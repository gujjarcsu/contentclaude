import { Suspense } from "react";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import { Await, useLoaderData } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import { AuditBody } from "../components/AuditBody.jsx";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import logger from "../utils/logger.server.js";
import { shopifyQuery } from "../utils/shopifyQuery.server.js";
import { scopeForShop, scopeQueryFor, getCandidateCounts } from "../utils/candidates.server.js";
import { getOrCreatePlan } from "../utils/plans.server.js";
import { SCORED_PRODUCT_FIELDS, toScorable } from "../utils/startState.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { gradeProduct } from "../utils/catalogueWatch.js";
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
  // Display only: Shopify answers AT_LEAST past 10,000, so the screen says
  // "10,000+" instead of presenting a floor as the total (L5).
  const catalogueExact = counts?.candidates ? counts.candidates.exact !== false : null;

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
        // Display only: which feed findings this product carries, so an
        // issue row can list exactly the products its count counted.
        findingKeys: findings.map((f) => `${f.surface}·${f.field}·${f.grade}`),
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
    catalogueExact,
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

  const shared = { catalogueCount: data.catalogueCount, catalogueExact: data.catalogueExact, planName: data.planName };
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

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
