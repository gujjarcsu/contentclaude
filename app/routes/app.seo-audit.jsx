import { Suspense } from "react";
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

const AUDIT_PAGE_QUERY = `query getProducts($cursor: String) {
  products(first: ${AUDIT_PAGE_SIZE}, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id title handle
        description
        seo { title description }
        images(first: 5) { edges { node { id url altText } } }
      }
    }
  }
}`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { calculateSeoScore } = await import("../utils/seo.server.js");
  const shop = session.shop;

  const SIX_MONTHS_AGO = new Date();
  SIX_MONTHS_AGO.setMonth(SIX_MONTHS_AGO.getMonth() - 6);

  // One page of the catalog, retried once after a short backoff. A single
  // failed page used to abort the whole audit; now the caller decides whether
  // to keep what it already has.
  const fetchPage = async (cursor) => {
    const attempt = async () => {
      const response = await admin.graphql(AUDIT_PAGE_QUERY, { variables: { cursor } });
      const { data } = await response.json();
      return data?.products ?? null;
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
      const images = node.images.edges.map((e) => e.node);
      const productData = {
        description: node.description || "",
        seoTitle: node.seo?.title || "",
        seoDescription: node.seo?.description || "",
        images,
      };
      const { score, checks } = calculateSeoScore(productData);
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

function ScoreRing({ score }) {
  // Unified color rule: >=70 green, 40–69 amber (highlight), <40 red.
  const tone = score >= 70 ? "success" : score >= 40 ? "highlight" : "critical";
  return (
    <BlockStack gap="200" inlineAlign="center">
      <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>
        {score}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        / 100 — Traditional SEO score
      </Text>
      <ProgressBar progress={score} tone={tone} size="medium" />
    </BlockStack>
  );
}

function CheckIcon({ pass, label }) {
  // Phase 2 items 2.5 and 2.12 — these were bare glyphs with no text and no
  // accessibilityLabel, rendered in four of six columns. On a 100-product store
  // that is roughly 400 of them, and a screen reader announced the raw
  // character. Polaris Badge carries real words; the tone is the decoration,
  // not the message.
  return pass ? (
    <Badge tone="success">{`${label}: yes`}</Badge>
  ) : (
    <Badge tone="critical">{`${label}: no`}</Badge>
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
  const data = useLoaderData();
  const loadingThisRoute = useRouteLoading();

  if (loadingThisRoute) {
    return <AppSkeleton title="SEO Audit" sections={2} layout="full" />;
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
      {p.isStale && <Badge tone="attention">Stale</Badge>}
    </InlineStack>,
    <Text
      key={`${p.id}-score`}
      as="span"
      fontWeight="bold"
      tone={p.score >= 70 ? "success" : p.score >= 40 ? undefined : "critical"}
    >
      {p.score}
    </Text>,
    <CheckIcon label="Description" key={`${p.id}-desc`} pass={p.checks.hasDescription} />,
    <CheckIcon label="Page title" key={`${p.id}-meta`} pass={p.checks.hasMetaTitle} />,
    <CheckIcon label="Search description" key={`${p.id}-metadesc`} pass={p.checks.hasMetaDesc} />,
    p.checks.noImages ? (
      <Badge key={`${p.id}-alt`} tone="subdued">
        No images
      </Badge>
    ) : (
      <CheckIcon label="Alt text" key={`${p.id}-alt`} pass={p.checks.hasAltText} />
    ),
  ]);

  const subtitle = pending
    ? `Scored the first ${products.length} product${products.length !== 1 ? "s" : ""} — the rest of your catalog is still being read`
    : `${products.length} product${products.length !== 1 ? "s" : ""} analyzed — sorted by score (worst first)${truncatedReason ? " · partial scan" : ""}`;

  return (
    <Page
      title="SEO Audit"
      subtitle={subtitle}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      primaryAction={{
        content: "Optimize store",
        onAction: () => navigate("/app/optimize"),
      }}
      secondaryActions={[
        {
          content: isLoading ? "Scanning..." : "Refresh Audit",
          onAction: () => revalidator.revalidate(),
          loading: isLoading,
          disabled: isLoading,
        },
      ]}
    >
      <BlockStack gap="500">
        {scanFailed && (
          <Banner tone="warning" title="This is a partial audit">
            <p>
              {`Shopify stopped answering while the rest of your catalog was being read, so only the first ${scannedCount} product${scannedCount !== 1 ? "s" : ""} (sorted by title) were analyzed. Scores and counts below cover only that portion — refresh to try the rest again.`}
            </p>
          </Banner>
        )}
        {truncatedReason && (
          <Banner tone="warning" title="This is a partial audit">
            <p>
              {truncatedReason === "timeout"
                ? `The scan hit its time limit after ${scannedCount} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Try refreshing during a quieter period, or audit sections of your catalog from the Products page.`
                : truncatedReason === "error"
                  ? `Shopify stopped answering after ${scannedCount} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Refresh to try the rest again.`
                  : `Your store has more than ${scannedCount} products — only the first ${scannedCount} (sorted by title) were analyzed. Scores and counts below cover only the scanned portion.`}
            </p>
          </Banner>
        )}
        {isLoading && (
          <Banner tone="info">
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="p" variant="bodyMd">
                Scanning your catalog... This may take a moment for large stores.
              </Text>
            </InlineStack>
          </Banner>
        )}

        {staleCount > 0 && (
          <Banner
            tone="warning"
            title={`${staleCount} product${staleCount !== 1 ? "s have" : " has"} content older than 6 months`}
          >
            <p>These descriptions were written more than six months ago.</p>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/optimize")}>Optimize store</Button>
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
            <EmptyState heading="Nothing to audit yet" image="/empty-seo.svg">
              <p>Add products to your store, and this is where you see what needs attention.</p>
            </EmptyState>
          </Card>
        ) : (
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <ScoreRing score={totalScore} />
              </Card>
            </Layout.Section>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Issues Found
                  </Text>
                  <InlineStack gap="400" wrap>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {missingDesc}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Missing descriptions
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {missingMeta}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Missing meta titles
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {noImages}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        No product images
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                        {missingAltText}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Images missing alt text
                      </Text>
                    </BlockStack>
                    {staleCount > 0 && (
                      <BlockStack gap="100">
                        <Text as="p" variant="heading2xl" fontWeight="bold" tone="attention">
                          {staleCount}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Content &gt;6 months old
                        </Text>
                      </BlockStack>
                    )}
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    SEO score breakdown: Description (30pts) · Meta Title (25pts) · Meta Description (25pts) ·
                    Has Images (10pts) · Alt Text (10pts)
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
                  Product breakdown
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
