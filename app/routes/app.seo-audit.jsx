import { Suspense } from "react";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import { Await, useLoaderData, useNavigate, useNavigation, useRevalidator } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  EmptyState,
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Box,
  DataTable,
  ProgressBar,
  Banner,
  Spinner,
  SkeletonBodyText,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import logger from "../utils/logger.server.js";
import { scoreTone } from "../utils/scoreBands.js";
import { shopifyQuery } from "../utils/shopifyQuery.server.js";
import { scopeForShop, scopeQueryFor } from "../utils/candidates.server.js";
import { SCORED_PRODUCT_FIELDS, toScorable } from "../utils/startState.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";

// ─── Loader ──────────────────────────────────────────────────────────────────

const AUDIT_PAGE_SIZE = 50;
const MAX_AUDIT_PRODUCTS = 500; // cap the catalog walk so a huge store cannot hang the scan
// The catalog walk is streamed now, so it lives inside entry.server.jsx's
// streamTimeout (15s, aborted at 16s) rather than inside a blocking loader that
// could take 25s. 10s leaves room for a page that is already in flight plus its
// one retry, so the table always arrives before the render is cut off. On a
// healthy store ten pages take 2-5s and this never fires.
const AUDIT_TIMEOUT_MS = 10_000;
const AUDIT_RETRY_DELAY_MS = 500; // one backoff before a page is written off

/**
 * Group 2.2 — "the first 500 sorted by title" is not a sample.
 *
 * Two things were wrong with it, and the cap was the smaller one.
 *
 * TITLE ORDER CLUSTERS. A catalogue with numeric SKU prefixes or variant
 * families returns near-identical siblings back to back — seven finishes of one
 * hose, forty lengths of one bolt — so the first 500 can be a few dozen real
 * products wearing 500 hats, and the score is an average over that.
 * `UPDATED_AT` descending returns what the merchant has touched most recently,
 * which is both less clustered and more useful: it is the work in front of them.
 *
 * IT INCLUDED PRODUCTS WITH NO PUBLIC PAGE. Archived and draft products, and
 * products not published to the Online Store, have no URL to rank — auditing
 * them drags the score down over pages nobody can reach and fills the fix list
 * with work that cannot pay off. The scope is the same candidate rule the rest
 * of the app now uses.
 *
 * The comment lives OUT here. A `//` inside a GraphQL template literal is a
 * valid JS comment and a GraphQL syntax error, which nearly shipped once.
 */
// A2 — the SHARED field selection. This query used to fetch description, seo
// and images only. The store score's graded-attributes dimension is worth 20 of
// 100 and reads productType, vendor, tags and variants.price, none of which were
// here — so switching this page onto the same rubric WITHOUT the same fields
// would have left the two screens ~20 points apart for a reason invisible on
// both of them.
const AUDIT_PAGE_QUERY = `query getProducts($cursor: String, $scoped: String) {
  products(first: ${AUDIT_PAGE_SIZE}, after: $cursor, sortKey: UPDATED_AT, reverse: true, query: $scoped) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        handle${SCORED_PRODUCT_FIELDS}
      }
    }
  }
}`;

export const loader = async ({ request }) => {
  const t = tForRequest(request);
  const { admin, session } = await authenticate.admin(request);
  const { calculateSeoScore } = await import("../utils/seo.server.js");
  const { calculateGeoScore } = await import("../utils/geo.server.js");
  const shop = session.shop;

  const SIX_MONTHS_AGO = new Date();
  SIX_MONTHS_AGO.setMonth(SIX_MONTHS_AGO.getMonth() - 6);

  // One page of the catalog, retried once after a short backoff. A single
  // failed page used to abort the whole audit; now the caller decides whether
  // to keep what it already has.
  // Group 1 + 2.2 — the audit population is the same candidate set the rest of
  // the app acts on: active products with a public page. Auditing archived and
  // unpublished products drags the score down over pages nobody can reach.
  const scoped = scopeQueryFor(await scopeForShop(shop));

  const fetchPage = async (cursor) => {
    // Phase 4 item 6 — through the shared backoff, so a throttled page waits
    // and retries instead of counting as a failed page. An audit that silently
    // stops early reports a score for part of the catalogue as if it were the
    // whole one.
    const attempt = async () => {
      const r = await shopifyQuery(
        admin.graphql,
        AUDIT_PAGE_QUERY,
        { cursor, scoped: scoped || null },
        {
          shop,
          label: t("audit page"),
        },
      );
      if (!r.ok) throw new Error(r.error ?? "audit page unavailable");
      return r.data?.products ?? null;
    };
    try {
      return await attempt();
    } catch (err) {
      logger.warn({ shop, err: err?.message }, "seo audit page failed, retrying once");
      await new Promise((resolve) => setTimeout(resolve, AUDIT_RETRY_DELAY_MS));
      return attempt();
    }
  };

  const AUDIT_START = Date.now();

  // Page one and the freshness records do not depend on each other, so they go
  // out together. The DB read used to wait for the ENTIRE catalog walk first.
  const [firstPage, dbContent] = await Promise.all([
    fetchPage(null),
    prisma.generatedContent.findMany({
      where: { shop, contentType: "description" },
      select: { productId: true, updatedAt: true, status: true },
    }),
  ]);
  const contentByProductId = new Map(dbContent.map((c) => [c.productId, c]));

  // Everything the page renders, derived from however many edges we have.
  // Called twice: once for page one (awaited, so the score paints) and once
  // for the full catalog (streamed).
  const summarize = (edges, { stoppedByTimeout, stoppedByError, hasNextPage }) => {
    const products = edges.map(({ node }) => {
      // A2 — one mapper, one rubric. `toScorable` is the same function the Home
      // scan uses, so neither screen assembles a product by hand.
      const scorable = toScorable(node);
      // THE STORE SCORE. calculateGeoScore is the rubric reviewed against the
      // doctrine and rebuilt in P1.3 on what W1 measured. This page used to
      // report calculateSeoScore instead, which is why it read 90 while Home
      // read 48 on the same store in the same minute.
      const score = calculateGeoScore(scorable).score;
      // calculateSeoScore is still called, but ONLY for its per-product checks,
      // which drive the Description / Page title / Search description / Alt text
      // icons below. Those are diagnostics a merchant can act on; they are no
      // longer the headline number.
      const { checks } = calculateSeoScore({
        description: scorable.description,
        seoTitle: scorable.seoTitle,
        seoDescription: scorable.seoDescription,
        images: scorable.images,
      });
      const dbRecord = contentByProductId.get(node.id);
      const isStale =
        dbRecord && dbRecord.status === "published" && new Date(dbRecord.updatedAt) < SIX_MONTHS_AGO;
      return {
        id: node.id,
        numericId: node.id.replace("gid://shopify/Product/", ""),
        title: node.title,
        score,
        checks,
        isStale,
        lastUpdated: dbRecord?.updatedAt ?? null,
      };
    });

    products.sort((a, b) => a.score - b.score); // worst first

    const totalScore =
      products.length > 0 ? Math.round(products.reduce((sum, p) => sum + p.score, 0) / products.length) : 0;

    // truncated: the scan did not cover the whole catalog — the product cap was
    // reached, the time budget ran out, or Shopify stopped answering. A large
    // store on a slow day must never see a partial audit presented as complete
    // (requirement 2.1.4).
    const truncatedReason = stoppedByError
      ? "error"
      : stoppedByTimeout && hasNextPage
        ? "timeout"
        : hasNextPage && edges.length >= MAX_AUDIT_PRODUCTS
          ? "cap"
          : null;

    return {
      products,
      totalScore,
      missingDesc: products.filter((p) => !p.checks.hasDescription).length,
      missingMeta: products.filter((p) => !p.checks.hasMetaTitle).length,
      // Distinguish: products with no images vs products with images but missing alt text
      noImages: products.filter((p) => p.checks.noImages).length,
      missingAltText: products.filter((p) => p.checks.missingAltText).length,
      staleCount: products.filter((p) => p.isStale).length,
      truncatedReason,
      scannedCount: edges.length,
    };
  };

  const firstEdges = firstPage?.edges ?? [];

  // The rest of the catalog is streamed: React Router sends the first-page
  // score straight away and pushes this in when it lands. Nothing in here
  // rejects — a page that fails twice ends the walk and the audit reports what
  // it managed to read.
  const rest = (async () => {
    const allEdges = [...firstEdges];
    let cursor = firstPage?.pageInfo?.endCursor ?? null;
    let hasNextPage = firstPage?.pageInfo?.hasNextPage ?? false;
    let stoppedByTimeout = false;
    let stoppedByError = false;

    while (hasNextPage && allEdges.length < MAX_AUDIT_PRODUCTS) {
      if (Date.now() - AUDIT_START > AUDIT_TIMEOUT_MS) {
        stoppedByTimeout = true;
        break;
      }
      let page;
      try {
        page = await fetchPage(cursor);
      } catch (err) {
        logger.error({ shop, err: err?.message }, "seo audit page failed after retry — keeping partial");
        stoppedByError = true;
        break;
      }
      if (!page) {
        stoppedByError = true;
        break;
      }
      allEdges.push(...(page.edges ?? []));
      hasNextPage = page.pageInfo?.hasNextPage ?? false;
      cursor = page.pageInfo?.endCursor ?? null;
    }

    return summarize(allEdges, { stoppedByTimeout, stoppedByError, hasNextPage });
  })();

  // Plain object (NOT Response.json) so React Router streams `rest`.
  // The top-level fields are page one, which is what the first paint scores.
  return {
    ...summarize(firstEdges, { stoppedByTimeout: false, stoppedByError: false, hasNextPage: false }),
    rest,
  };
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Group 6.1 — this said "/ 100 — Traditional SEO score" while Home said
 * "/ 100 — Store SEO score", computed by a DIFFERENT scanner over a DIFFERENT
 * sample (30 products against up to 500). Two numbers with the same shape and
 * nothing to tell them apart is the same defect as a before measured one way
 * and an after measured another: two unrelated numbers with an arrow between
 * them, on the app's headline claim.
 *
 * They stay two metrics — unifying them would mean running a 500-product scan
 * on every dashboard load, or throwing away the audit's per-product detail —
 * but each now carries its own name and its own N, and each points at the other.
 */
function ScoreRing({ score, scanned }) {
  const t = useT();
  // Unified color rule: >=70 green, 40–69 amber (highlight), <40 red.
  const tone = scoreTone(score);
  return (
    <BlockStack gap="200" inlineAlign="center">
      <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>
        {score}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {Number.isFinite(scanned)
          ? `/ 100 — Audit score, averaged across ${scanned} product${scanned === 1 ? "" : "s"}`
          : "/ 100 — Audit score"}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {/*
          A2 — this said "Measured DIFFERENTLY from the Store SEO score on Home",
          which was true when Home averaged two rubrics and this page reported
          one. It is now false: both use the same rubric, the same fields and the
          same scope, and on a store small enough for one page they read the same
          number. Leaving it would have been a screen explaining a disagreement
          that no longer exists — and inviting a merchant to distrust two numbers
          that finally agree.

          The only honest difference left is HOW MANY products each one reads, so
          that is what it now says.
        */}
        {t("Scored the same way as the Store SEO score on Home. Home samples up to 30 products; this page reads as much of your catalogue as it can, so the two can differ on a large store.")}
      </Text>
      <ProgressBar progress={score} tone={tone} size="medium" />
    </BlockStack>
  );
}

function CheckIcon({ pass, label }) {
  const t = useT();
  // Phase 2 items 2.5 and 2.12 — these were bare glyphs with no text and no
  // accessibilityLabel, rendered in four of six columns. On a 100-product store
  // that is roughly 400 of them, and a screen reader announced the raw
  // character. Polaris Badge carries real words; the tone is the decoration,
  // not the message.
  return pass ? (
    <Badge tone="success">{t("{label}: yes", { label })}</Badge>
  ) : (
    <Badge tone="critical">{t("{label}: no", { label })}</Badge>
  );
}

/**
 * Phase 2 item 2.11 — the score paints from page one; the rest streams.
 *
 * The loader used to walk the whole catalog before returning anything, so a
 * 500-product store stared at nothing for up to 25 seconds. Now page one is
 * awaited (that is the score, the issue counts and the empty-state branch) and
 * the remaining pages arrive behind <Await>, with the table as a skeleton until
 * they do.
 */
export default function SeoAuditPage() {
  const t = useT();
  const data = useLoaderData();
  const loadingThisRoute = useRouteLoading();

  if (loadingThisRoute) {
    return <AppSkeleton title={t("SEO Audit")} sections={2} layout="full" />;
  }

  return (
    <Suspense fallback={<AuditBody data={data} pending />}>
      {/* If the streamed walk throws, page one is still a real audit — show it
          with an honest banner rather than replacing the screen with an error. */}
      <Await resolve={data.rest} errorElement={<AuditBody data={data} scanFailed />}>
        {(rest) => <AuditBody data={rest} />}
      </Await>
    </Suspense>
  );
}

function AuditBody({ data, pending = false, scanFailed = false }) {
  const t = useT();
  const {
    products,
    totalScore,
    missingDesc,
    missingMeta,
    noImages,
    missingAltText,
    staleCount,
    truncatedReason,
    scannedCount,
  } = data;
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = navigation.state === "loading" || revalidator.state === "loading";

  const rows = products.map((p) => [
    <InlineStack gap="200" blockAlign="center" key={p.id}>
      <Button variant="plain" onClick={() => navigate(`/app/products/${p.numericId}`)}>
        {p.title}
      </Button>
      {p.isStale && <Badge tone="attention">{t("Stale")}</Badge>}
    </InlineStack>,
    <Text key={`${p.id}-score`} as="span" fontWeight="bold" tone={scoreTone(p.score)}>
      {p.score}
    </Text>,
    <CheckIcon label={t("Description")} key={`${p.id}-desc`} pass={p.checks.hasDescription} />,
    <CheckIcon label={t("Page title")} key={`${p.id}-meta`} pass={p.checks.hasMetaTitle} />,
    <CheckIcon label={t("Search description")} key={`${p.id}-metadesc`} pass={p.checks.hasMetaDesc} />,
    p.checks.noImages ? (
      <Badge key={`${p.id}-alt`} tone="subdued">
        {t("No images")}
      </Badge>
    ) : (
      <CheckIcon label={t("Alt text")} key={`${p.id}-alt`} pass={p.checks.hasAltText} />
    ),
  ]);

  const subtitle = pending
    ? `Scored the first ${products.length} product${products.length !== 1 ? "s" : ""} — the rest of your catalog is still being read`
    : `${products.length} product${products.length !== 1 ? "s" : ""} analyzed — sorted by score (worst first)${truncatedReason ? " · partial scan" : ""}`;

  return (
    <Page
      title={t("SEO Audit")}
      subtitle={subtitle}
      backAction={{ content: t("Dashboard"), onAction: () => navigate("/app") }}
      primaryAction={{
        content: t("Optimize store"),
        onAction: () => navigate("/app/optimize"),
      }}
      secondaryActions={[
        {
          content: isLoading ? t("Scanning...") : t("Refresh Audit"),
          onAction: () => revalidator.revalidate(),
          loading: isLoading,
          disabled: isLoading,
        },
      ]}
    >
      <BlockStack gap="500">
        {scanFailed && (
          <Banner tone="warning" title={t("This is a partial audit")}>
            <p>
              {t("Shopify stopped answering while the rest of your catalog was being read, so only the first {scannedCount} product{v} (sorted by title) were analyzed. Scores and counts below cover only that portion — refresh to try the rest again.", { scannedCount, v: scannedCount !== 1 ? "s" : "" })}
            </p>
          </Banner>
        )}
        {truncatedReason && (
          <Banner tone="warning" title={t("This is a partial audit")}>
            <p>
              {truncatedReason === "timeout" ? t("The scan hit its time limit after {scannedCount} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Try refreshing during a quieter period, or audit sections of your catalog from the Products page.", { scannedCount }) : truncatedReason === "error" ? t("Shopify stopped answering after {scannedCount} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Refresh to try the rest again.", { scannedCount }) : t("Your store has more than {scannedCount} products — only the first {scannedCount1} (sorted by title) were analyzed. Scores and counts below cover only the scanned portion.", { scannedCount, scannedCount1: scannedCount })}
            </p>
          </Banner>
        )}
        {isLoading && (
          <Banner tone="info">
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="p" variant="bodyMd">
                {t("Scanning your catalog... This may take a moment for large stores.")}
              </Text>
            </InlineStack>
          </Banner>
        )}

        {staleCount > 0 && (
          <Banner
            tone="warning"
            title={t("{staleCount} product{v} content older than 6 months", { staleCount, v: staleCount !== 1 ? "s have" : " has" })}
          >
            <p>{t("These descriptions were written more than six months ago.")}</p>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/optimize")}>{t("Optimize store")}</Button>
            </Box>
          </Banner>
        )}

        {/* Phase 2 item 2.10 — a store with no products scored 0 out of 100.
            `totalScore` is an average over an empty list, which the loader
            floors to 0, and the tone thresholds then read 0 as critical. So a
            brand-new merchant was shown a large red zero and four red zeros
            under "Issues Found", with a primary button pointing at Optimize —
            which greeted the same store with "Your store is fully optimized!".
            Two screens, one empty store, opposite verdicts. */}
        {products.length === 0 ? (
          <Card>
            <EmptyState heading={t("Nothing to audit yet")} image="/empty-seo.svg">
              <p>{t("Add products to your store, and this is where you see what needs attention.")}</p>
            </EmptyState>
          </Card>
        ) : (
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <ScoreRing score={totalScore} scanned={scannedCount} />
              </Card>
            </Layout.Section>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("Issues Found")}
                  </Text>
                  <InlineStack gap="400" wrap>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {missingDesc}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("Missing descriptions")}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {missingMeta}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("Missing meta titles")}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {noImages}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("No product images")}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {missingAltText}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("Images missing alt text")}
                      </Text>
                    </BlockStack>
                    {staleCount > 0 && (
                      <BlockStack gap="100">
                        <Text as="p" variant="heading2xl" fontWeight="bold" tone="attention">
                          {staleCount}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("Content >6 months old")}
                        </Text>
                      </BlockStack>
                    )}
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("SEO score breakdown: Description (30pts) · Meta Title (25pts) · Meta Description (25pts) · Has Images (10pts) · Alt Text (10pts)")}
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {products.length > 0 &&
          (pending ? (
            // The table is the expensive half of this page, so it is the half
            // that waits. A skeleton the size of the table it replaces, not a
            // bare spinner.
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {t("Product breakdown")}
                </Text>
                <SkeletonBodyText lines={12} />
              </BlockStack>
            </Card>
          ) : (
            <Card padding="0">
              <DataTable
                columnContentTypes={["text", "numeric", "text", "text", "text", "text"]}
                headings={["Product", "SEO Score", "Description", "Meta Title", "Meta Desc", "Alt Text"]}
                rows={rows}
                defaultSortDirection="ascending"
                initialSortColumnIndex={1}
              />
            </Card>
          ))}
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
