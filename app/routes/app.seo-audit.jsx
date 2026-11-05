import { Suspense, useState } from "react";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import { Await, useLoaderData, useNavigate, useNavigation, useRevalidator } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  EmptyState,
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Button,
  Badge,
  Box,
  Banner,
  Tabs,
  IndexTable,
  Thumbnail,
  Pagination,
  Divider,
  SkeletonBodyText,
  useBreakpoints,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import logger from "../utils/logger.server.js";
import { shopifyQuery } from "../utils/shopifyQuery.server.js";
import { scopeForShop, scopeQueryFor, getCandidateCounts } from "../utils/candidates.server.js";
import { getOrCreatePlan } from "../utils/plans.server.js";
import { SCORED_PRODUCT_FIELDS, toScorable } from "../utils/startState.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { ScoreRing } from "../components/ScoreRing.jsx";
import { IssueList } from "../components/IssueList.jsx";
import { blockerRows } from "../utils/fixRows.js";
import { blockerLines, BLOCKER_GROUPS } from "../utils/firstRun.js";
import { gradeProduct } from "../utils/catalogueWatch.js";
import { getEntitlements } from "../utils/billing-plans.js";
import { GEO_RUBRIC } from "../utils/geoRubric.js";

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
const TABLE_PAGE_SIZE = 50;

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

/**
 * Redesign (Nov 2026) — the feed findings the audit can honestly make.
 *
 * gradeProduct() is the daily walk's grader; the audit's node carries title,
 * description, vendor and the featured image with its alt text, so the
 * findings it can make from those are real: a missing title, description,
 * brand or image (blocking) and a thin description or an image without alt
 * text (degrading). It cannot see the Online Store URL, barcodes or option
 * names, so those findings are not made here: `storefrontPublic: false`
 * skips the URL checks, and gradeProduct makes no barcode or option finding
 * when the fields are absent. Home's counts come from the nightly walk over
 * the WHOLE catalogue; the audit's come from the products it scanned, and
 * every count on this page says so (L5).
 */
function feedFindings(node) {
  const image = node.featuredMedia?.preview?.image ?? null;
  return gradeProduct(
    {
      title: node.title,
      description: node.description,
      vendor: node.vendor,
      productType: node.productType,
      status: "ACTIVE",
      featuredImage: image ? { url: image.url, altText: image.altText ?? "" } : null,
    },
    { storefrontPublic: false },
  ).findings.filter((f) => f.surface === "openai");
}

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
  const scope = await scopeForShop(shop);
  const scoped = scopeQueryFor(scope);

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

  // Page one, the freshness records, the catalogue count and the plan do not
  // depend on each other, so they go out together. The DB read used to wait
  // for the ENTIRE catalog walk first.
  const [firstPage, dbContent, counts, plan] = await Promise.all([
    fetchPage(null),
    prisma.generatedContent.findMany({
      where: { shop, contentType: "description" },
      select: { productId: true, updatedAt: true, status: true },
    }),
    getCandidateCounts(admin, shop, { scope }),
    getOrCreatePlan(shop),
  ]);
  const contentByProductId = new Map(dbContent.map((c) => [c.productId, c]));
  // The catalogue the scan is a part of: the same candidate count Home and
  // Products report, or null when Shopify could not be read (never 0).
  const catalogueCount = counts?.candidates?.count ?? null;

  // Everything the page renders, derived from however many edges we have.
  // Called twice: once for page one (awaited, so the score paints) and once
  // for the full catalog (streamed).
  const summarize = (edges, { stoppedByTimeout, stoppedByError, hasNextPage }) => {
    const tally = {};
    const dimensionSums = {};
    let eligibleCount = 0;

    const products = edges.map(({ node }) => {
      // A2 — one mapper, one rubric. `toScorable` is the same function the Home
      // scan uses, so neither screen assembles a product by hand.
      const scorable = toScorable(node);
      // THE STORE SCORE. calculateGeoScore is the rubric reviewed against the
      // doctrine and rebuilt in P1.3 on what W1 measured. This page used to
      // report calculateSeoScore instead, which is why it read 90 while Home
      // read 48 on the same store in the same minute.
      const geo = calculateGeoScore(scorable);
      const score = geo.score;
      for (const d of geo.breakdown) {
        const acc = (dimensionSums[d.key] ??= { points: 0, n: 0, max: d.max, label: d.label });
        acc.points += d.points;
        acc.n += 1;
      }
      // calculateSeoScore is still called, but ONLY for its per-product checks,
      // which drive the per-product "what is missing" badges. Those are
      // diagnostics a merchant can act on; they are not the headline number.
      const { checks } = calculateSeoScore({
        description: scorable.description,
        seoTitle: scorable.seoTitle,
        seoDescription: scorable.seoDescription,
        images: scorable.images,
      });
      // The feed's view of the same product, from the daily walk's grader.
      const findings = feedFindings(node);
      const blocking = findings.filter((f) => f.grade === "blocking").length;
      if (blocking === 0) eligibleCount += 1;
      for (const f of findings) {
        const key = `${f.surface}·${f.field}·${f.grade}`;
        tally[key] = (tally[key] ?? 0) + 1;
      }
      const dbRecord = contentByProductId.get(node.id);
      const isStale =
        dbRecord && dbRecord.status === "published" && new Date(dbRecord.updatedAt) < SIX_MONTHS_AGO;
      return {
        id: node.id,
        numericId: node.id.replace("gid://shopify/Product/", ""),
        title: node.title,
        imageUrl: scorable.imageUrl,
        score,
        checks,
        feedBlocking: blocking,
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

    // The rubric's dimensions, averaged over the products that had each one
    // measured (freshness is excluded for a product with no date, so its N can
    // be smaller). Labels are catalogue keys; the screen translates them.
    const dimensions = GEO_RUBRIC.filter((d) => dimensionSums[d.key]).map((d) => ({
      key: d.key,
      label: d.label,
      max: d.max,
      points: Math.round(dimensionSums[d.key].points / dimensionSums[d.key].n),
      n: dimensionSums[d.key].n,
    }));

    return {
      products,
      totalScore,
      missingDesc: products.filter((p) => !p.checks.hasDescription).length,
      missingMeta: products.filter((p) => !p.checks.hasMetaTitle).length,
      missingMetaDesc: products.filter((p) => !p.checks.hasMetaDesc).length,
      // Distinguish: products with no images vs products with images but missing alt text
      noImages: products.filter((p) => p.checks.noImages).length,
      missingAltText: products.filter((p) => p.checks.missingAltText).length,
      staleCount: products.filter((p) => p.isStale).length,
      eligibleCount,
      tally,
      dimensions,
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
    catalogueCount,
    planName: plan.planName,
    rest,
  };
};

// ─── Component ───────────────────────────────────────────────────────────────

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
    return <AppSkeleton title={t("Audit")} sections={2} layout="full" />;
  }

  const shared = { catalogueCount: data.catalogueCount, planName: data.planName };
  return (
    <Suspense fallback={<AuditBody data={{ ...data, ...shared }} pending />}>
      {/* If the streamed walk throws, page one is still a real audit — show it
          with an honest banner rather than replacing the screen with an error. */}
      <Await resolve={data.rest} errorElement={<AuditBody data={{ ...data, ...shared }} scanFailed />}>
        {(rest) => <AuditBody data={{ ...rest, ...shared }} />}
      </Await>
    </Suspense>
  );
}

/**
 * The partial-audit sentence, one place. This page shows at most one notice,
 * and only when the scan did not cover the whole catalogue.
 */
function partialNotice({ scanFailed, truncatedReason, scannedCount }, t) {
  const n = t.number(scannedCount);
  if (scanFailed) {
    return t("Shopify stopped answering while the rest of your catalog was being read, so only the {n} most recently updated products were analyzed. Scores and counts below cover only that portion — rescan to try the rest again.", { n });
  }
  if (truncatedReason === "timeout") {
    return t("The scan hit its time limit after {n} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Try again during a quieter period, or audit sections of your catalog from the Products page.", { n });
  }
  if (truncatedReason === "error") {
    return t("Shopify stopped answering after {n} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Rescan to try the rest again.", { n });
  }
  // The cap is not a failure: the subtitle already says "Scored 500 of
  // 10,000 products · partial scan", and a banner on every load of every
  // large store would be the one notice this page allows, spent on nothing.
  return null;
}

/** The feed's blocking reasons, largest first, as "{n} have no image" lines. */
const FEED_REASON = {
  "openai·image_link·blocking": (n, t) => t("{n, plural, one {# has} other {# have}} no image", { n }),
  "openai·description·blocking": (n, t) => t("{n, plural, one {# has} other {# have}} no description", { n }),
  "openai·brand·blocking": (n, t) => t("{n, plural, one {# has} other {# have}} no brand", { n }),
  "openai·title·blocking": (n, t) => t("{n, plural, one {# has} other {# have}} no title", { n }),
};

/**
 * The checks a scanned product can pass, in the order the Passed tab lists
 * them. A check is "passed" when no scanned product fails it — the sentence
 * says over how many.
 */
function passedRows({ tally, missingMeta, missingMetaDesc, missingAltText, staleCount, scannedCount }, t) {
  const n = scannedCount;
  const checks = [
    { id: "title", failing: tally["openai·title·blocking"] ?? 0, title: t("Every scanned product has a title ({n})", { n: t.number(n) }) },
    { id: "description", failing: (tally["openai·description·blocking"] ?? 0) + (tally["openai·description·degrading"] ?? 0), title: t("Every scanned product has a description an answer can quote ({n})", { n: t.number(n) }) },
    { id: "brand", failing: tally["openai·brand·blocking"] ?? 0, title: t("Every scanned product has a brand ({n})", { n: t.number(n) }) },
    { id: "image", failing: (tally["openai·image_link·blocking"] ?? 0) + (tally["openai·image alt·degrading"] ?? 0), title: t("Every scanned product has an image with alt text ({n})", { n: t.number(n) }) },
    { id: "meta", failing: missingMeta + missingMetaDesc, title: t("Every scanned product has a page title and search description ({n})", { n: t.number(n) }) },
    { id: "alt", failing: missingAltText, title: t("Every image on every scanned product has alt text ({n})", { n: t.number(n) }) },
    { id: "fresh", failing: staleCount, title: t("No published description is older than six months ({n})", { n: t.number(n) }) },
  ];
  return checks.filter((c) => c.failing === 0).map((c) => ({ id: `passed-${c.id}`, severity: "passed", title: c.title }));
}

/** Exported for tests/components/auditScreen.test.jsx, which renders it with the loader's shape. */
export function AuditBody({ data, pending = false, scanFailed = false }) {
  const t = useT();
  const {
    products,
    totalScore,
    missingMeta,
    missingMetaDesc,
    missingAltText,
    staleCount,
    eligibleCount,
    tally,
    dimensions,
    truncatedReason,
    scannedCount,
    catalogueCount,
    planName,
  } = data;
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = navigation.state === "loading" || revalidator.state === "loading";
  const entitlements = getEntitlements(planName);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const { smDown } = useBreakpoints();

  // ── The issue rows ────────────────────────────────────────────────────────
  // The feed findings, through the same mapping Home uses, so the two screens
  // name a finding with the same sentence and the same button. The count
  // column states the scope: these are counts over the scanned products.
  const scopeCount = (b) => (b.count === null ? undefined : t("{n} of {scanned} scanned", { n: t.number(b.count), scanned: t.number(scannedCount) }));
  const feedRows = blockerRows(blockerLines(tally ?? {}, { max: BLOCKER_GROUPS.length, t }), { entitlements, t, navigate, count: scopeCount });
  // The per-product checks that are not feed findings: page title, search
  // description, alt text on every image, and content older than six months.
  const seoRows = [
    missingMeta > 0 && {
      id: "meta-title",
      severity: "warning",
      title: t("{n, plural, one {# product has} other {# products have}} no page title, so search engines make one up.", { n: missingMeta }),
      count: scopeCount({ count: missingMeta }),
      action: { content: t("Optimize store"), onAction: () => navigate("/app/optimize") },
    },
    missingMetaDesc > 0 && {
      id: "meta-desc",
      severity: "warning",
      title: t("{n, plural, one {# product has} other {# products have}} no search description, so the snippet is whatever Google picks.", { n: missingMetaDesc }),
      count: scopeCount({ count: missingMetaDesc }),
      action: { content: t("Optimize store"), onAction: () => navigate("/app/optimize") },
    },
    missingAltText > 0 && {
      id: "alt",
      severity: "warning",
      title: t("{n, plural, one {# product has} other {# products have}} images without alt text.", { n: missingAltText }),
      count: scopeCount({ count: missingAltText }),
      action: { content: t("Optimize store"), onAction: () => navigate("/app/optimize") },
    },
    staleCount > 0 && {
      id: "stale",
      severity: "warning",
      title: t("{staleCount, plural, one {# product has} other {# products have}} content older than 6 months", { staleCount }),
      count: scopeCount({ count: staleCount }),
      action: { content: t("Optimize store"), onAction: () => navigate("/app/optimize") },
    },
  ].filter(Boolean);
  const critical = feedRows.filter((r) => r.severity === "critical");
  const warning = [...feedRows.filter((r) => r.severity === "warning"), ...seoRows];
  const passed = passedRows({ tally: tally ?? {}, missingMeta, missingMetaDesc, missingAltText, staleCount, scannedCount }, t);
  const tabs = [
    { id: "critical", content: t("Critical ({n})", { n: critical.length }), rows: critical, empty: t("Nothing blocks a scanned product from being listed.") },
    { id: "warning", content: t("Warning ({n})", { n: warning.length }), rows: warning, empty: t("Nothing is holding a scanned product back.") },
    { id: "passed", content: t("Passed ({n})", { n: passed.length }), rows: passed, empty: t("No check is passed by every scanned product yet.") },
  ];
  const activeTab = tabs[Math.min(tab, tabs.length - 1)];

  // ── The feed's blocking reasons under the eligibility ring ────────────────
  const feedReasons = Object.entries(tally ?? {})
    .filter(([key, n]) => FEED_REASON[key] && n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, n]) => FEED_REASON[key](n, t));
  const eligiblePct = scannedCount > 0 ? Math.round((eligibleCount / scannedCount) * 100) : null;

  // ── The title row ─────────────────────────────────────────────────────────
  const scanned = t.number(scannedCount);
  const subtitle = pending
    ? t("Scored the first {n, plural, one {# product} other {# products}} — the rest of your catalog is still being read", { n: products.length })
    : [
        catalogueCount === null || catalogueCount < scannedCount
          ? t("Scored {n, plural, one {# product} other {# products}}", { n: scannedCount })
          : t("Scored {scanned} of {total} products", { scanned, total: t.number(catalogueCount) }),
        truncatedReason || scanFailed ? t("partial scan") : null,
      ]
        .filter(Boolean)
        .join(" · ");
  const notice = partialNotice({ scanFailed, truncatedReason, scannedCount }, t);

  // ── The product breakdown, 50 rows a page, worst first ───────────────────
  const pageCount = Math.max(1, Math.ceil(products.length / TABLE_PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = products.slice(pageIndex * TABLE_PAGE_SIZE, (pageIndex + 1) * TABLE_PAGE_SIZE);

  return (
    <Page
      title={t("Audit")}
      subtitle={subtitle}
      primaryAction={{
        content: t("Optimize store"),
        onAction: () => navigate("/app/optimize"),
      }}
      secondaryActions={[
        {
          content: t("Rescan"),
          onAction: () => revalidator.revalidate(),
          loading: isLoading,
          disabled: isLoading,
        },
      ]}
    >
      <BlockStack gap="500">
        {notice && (
          <Banner tone="warning" title={t("This is a partial audit")}>
            <p>{notice}</p>
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
              <p>{t("Add products to your store, and this is where you generate content for them.")}</p>
            </EmptyState>
          </Card>
        ) : (
          <>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              {/* Search readiness: the store score, and how its points fall. */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {t("Search readiness")}
                  </Text>
                  <InlineGrid columns={{ xs: 1, sm: "auto 1fr" }} gap="500" alignItems="start">
                    <ScoreRing
                      value={totalScore}
                      size="large"
                      label={t("Search readiness")}
                      caption={t("across {n, plural, one {# product} other {# products}} scanned", { n: scannedCount })}
                    />
                    <BlockStack gap="0">
                      {dimensions.map((d, i) => (
                        <Box key={d.key}>
                          {i > 0 ? <Divider /> : null}
                          <Box paddingBlock="150">
                            <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                              <Text as="span" variant="bodySm">
                                {t(d.label)}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {t("{points} of {max}", { points: d.points, max: d.max })}
                              </Text>
                            </InlineStack>
                          </Box>
                        </Box>
                      ))}
                      <Box paddingBlockStart="200">
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("Average points per dimension over the scanned products. Home samples 30; this page reads up to 500.")}
                        </Text>
                      </Box>
                    </BlockStack>
                  </InlineGrid>
                </BlockStack>
              </Card>

              {/* AI shopping eligibility: the share of scanned products the
                  OpenAI product feed could list as they stand. */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {t("AI shopping eligibility")}
                  </Text>
                  <InlineGrid columns={{ xs: 1, sm: "auto 1fr" }} gap="500" alignItems="start">
                    <ScoreRing
                      value={eligiblePct}
                      size="large"
                      label={t("AI shopping eligibility")}
                      caption={t("{eligible} of {scanned} scanned can be listed", { eligible: t.number(eligibleCount), scanned })}
                    />
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        {t("The share of scanned products with every field the OpenAI product feed requires: a title, a description, a brand and an image.")}
                      </Text>
                      {feedReasons.length > 0 ? (
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {t("What stops the rest:")}
                          </Text>
                          {feedReasons.map((line, i) => (
                            <Text key={i} as="p" variant="bodySm">
                              {line}
                            </Text>
                          ))}
                        </BlockStack>
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("Every scanned product has all four.")}
                        </Text>
                      )}
                    </BlockStack>
                  </InlineGrid>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* The issues, by severity. Each row is one finding with its count
                over the scanned products and the one place it is fixed. */}
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="baseline" gap="300" wrap>
                  <Text as="h2" variant="headingMd">
                    {t("Issues")}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Counted over the {n} products scanned", { n: scanned })}
                  </Text>
                </InlineStack>
                <Tabs tabs={tabs.map(({ id, content }) => ({ id, content }))} selected={tab} onSelect={setTab} />
                <IssueList items={activeTab.rows} emptyText={activeTab.empty} />
              </BlockStack>
            </Card>

            {/* The product breakdown: the expensive half of this page, so the
                half that waits. A skeleton the size of the table it replaces,
                not a bare spinner. */}
            {pending ? (
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
                <Box padding="400" paddingBlockEnd="200">
                  <InlineStack align="space-between" blockAlign="baseline" gap="300" wrap>
                    <Text as="h2" variant="headingMd">
                      {t("Product breakdown")}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("{n, plural, one {# product} other {# products}} analyzed — sorted by score (worst first)", { n: products.length })}
                    </Text>
                  </InlineStack>
                </Box>
                <IndexTable
                  resourceName={{ singular: t("product"), plural: t("products") }}
                  itemCount={pageRows.length}
                  selectable={false}
                  condensed={smDown}
                  headings={[
                    { id: "thumb", title: "", hidden: true },
                    { id: "product", title: t("Product") },
                    { id: "score", title: t("Score") },
                    { id: "missing", title: t("Missing") },
                    { id: "edit", title: "", hidden: true },
                  ]}
                >
                  {pageRows.map((p, index) =>
                    smDown ? (
                      // On a phone the row is one block: thumbnail, title and
                      // score on a line, what is missing under it. A five-column
                      // table at 390px scrolls sideways and stacks the badges.
                      <IndexTable.Row id={p.id} key={p.id} position={index} onClick={() => navigate(`/app/products/${p.numericId}`)}>
                        <Box padding="300" width="100%">
                          <BlockStack gap="200">
                            <InlineStack gap="300" blockAlign="center" wrap={false}>
                              <Thumbnail source={p.imageUrl || ImageIcon} alt="" size="small" />
                              <Box width="100%">
                                <Text as="span" variant="bodyMd" fontWeight="medium">
                                  {p.title}
                                </Text>
                              </Box>
                              <ScoreRing value={p.score} size="xs" label={t("Score")} />
                            </InlineStack>
                            <MissingBadges product={p} />
                          </BlockStack>
                        </Box>
                      </IndexTable.Row>
                    ) : (
                      <IndexTable.Row id={p.id} key={p.id} position={index}>
                        <IndexTable.Cell>
                          <Thumbnail source={p.imageUrl || ImageIcon} alt="" size="small" />
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {p.title}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <ScoreRing value={p.score} size="xs" label={t("Score")} />
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <MissingBadges product={p} />
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack align="end">
                            <Button size="slim" onClick={() => navigate(`/app/products/${p.numericId}`)}>
                              {t("Edit")}
                            </Button>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ),
                  )}
                </IndexTable>
                {pageCount > 1 && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Pagination
                        label={t("Page {page} of {pages}", { page: pageIndex + 1, pages: pageCount })}
                        hasPrevious={pageIndex > 0}
                        hasNext={pageIndex < pageCount - 1}
                        onPrevious={() => setPage(pageIndex - 1)}
                        onNext={() => setPage(pageIndex + 1)}
                      />
                    </InlineStack>
                  </Box>
                )}
              </Card>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}

/**
 * What a scanned product is missing, as words. These used to be four columns
 * of pass/fail badges on every row (roughly 400 badges on a 100-product
 * store); a row now carries only what is wrong with it, and a row with
 * nothing wrong says so.
 */
function MissingBadges({ product }) {
  const t = useT();
  const { checks, feedBlocking, isStale } = product;
  const items = [
    !checks.hasDescription && t("No description"),
    !checks.hasMetaTitle && t("No page title"),
    !checks.hasMetaDesc && t("No search description"),
    checks.noImages ? t("No images") : checks.missingAltText ? t("Alt text missing") : null,
    isStale && t("Older than 6 months"),
  ].filter(Boolean);
  if (feedBlocking > 0 && items.length === 0) items.push(t("Feed cannot list it"));
  if (items.length === 0) {
    return <Badge tone="success">{t("Nothing missing")}</Badge>;
  }
  return (
    <InlineStack gap="100" wrap>
      {items.map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
    </InlineStack>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
