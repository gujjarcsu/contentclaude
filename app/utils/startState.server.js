/**
 * The Start state — Phase 3 items 3.1 and 3.2.
 *
 * This is the magic-moment engine from the retired `/app/welcome`, absorbed.
 * What carried over: the catalogue scan, the GEO + SEO scoring, the store-wide
 * score reveal, and picking the merchant's weakest products as the demo target.
 * What did not: the route, the feature flag, the setup checklist, the plan
 * split, and the "Skip to dashboard" escape (there is nothing to skip now —
 * this IS Home).
 *
 * The important structural change is that it no longer redirects. Home renders
 * the Start state itself while `Shop.firstDraftSeenAt` is null, so the embedded
 * chain a merchant walks on a fresh install is exactly the one that was proven
 * against the App Store rejections: admin → `/app`, and nothing else.
 *
 * Everything here is read-only against Shopify and never throws: a scan that
 * fails returns `{ error: true }` so the screen can offer a retry rather than
 * render a fabricated score. Nothing in here spends a credit — generation is
 * `runQuickStartOne`, one product per request, fired by the client.
 */
import logger from "./logger.server.js";
import { getCache } from "./cache.server.js";
// P5.2 — the key lives with its invalidator so neither can drift from the
// other, and so the three publish paths can clear this cache without
// importing the scanner, the GraphQL document and the scorer below.
import { storeScanKey } from "./storeScanCache.server.js";
import { calculateSeoScore } from "./seo.server.js";
import { scopeQueryFor } from "./candidates.js";
import { calculateGeoScore } from "./geo.server.js";
import { shopifyQuery } from "./shopifyQuery.server.js";
import { defaultLanguageFor } from "./language.js";

/**
 * How many products to score. The store score is a sample and is described as
 * one ("We scanned N of your products"), never as the whole catalogue.
 * 30 is what the welcome scan used and what its GraphQL cost was sized for.
 */
export const SCAN_LIMIT = 30;

/** How much of a page body is kept. A Terms page is long; its voice is in the opening. */
export const PAGE_SAMPLE_CHARS = 1200;
/** How many products the Start state offers to fix. The brief's number. */
export const START_TARGETS = 3;
/** Short — a merchant who refreshes twice in a minute should not re-scan. */
export const START_SCAN_TTL_S = 120;

// `shop { name }` is Phase 4 item 4 — the store's own name for the inferred
// brand voice. One scalar on a query we already run: no extra request and no
// extra round trip.
//
// NOTE: the comment lives OUT here. GraphQL comments are `#`, not `//`, and a
// `//` inside this template literal is a syntax error Shopify rejects — which
// no test in this repo would catch, because they all mock the transport and
// never parse the query.
/**
 * A2 — THE FIELDS THE STORE SCORE IS COMPUTED FROM. Shared, because the score
 * depends on them and two screens fetching different fields produce different
 * numbers from the same rubric.
 *
 * This is half of why Home said 48 and the SEO Audit said 90 on the same store
 * in the same minute. The other half was the rubric. Fixing only the rubric
 * would have left a ~20-point gap: the audit did not fetch `productType`,
 * `vendor`, `tags` or `variants.price`, so the graded-attributes dimension
 * (20 of 100) scored zero on every product it looked at.
 *
 * Any surface that shows a store score selects THESE fields and maps them with
 * `toScorable`. Nothing scores a product it assembled by hand.
 */
export const SCORED_PRODUCT_FIELDS = `
      id title description productType vendor tags
      seo { title description }
      featuredMedia { preview { image { url } } }
      media(first: 3) { edges { node { mediaContentType ... on MediaImage { image { altText } } } } }
      variants(first: 3) { edges { node { price } } }`;

export const START_SCAN_QUERY = `query startScan($n: Int!, $scoped: String) {
  shop { name billingAddress { countryCodeV2 } }
  collections(first: 20, sortKey: UPDATED_AT, reverse: true) {
    edges { node { title description } }
  }
  pages(first: 5, sortKey: UPDATED_AT, reverse: true) {
    edges { node { title body isPublished } }
  }
  products(first: $n, sortKey: UPDATED_AT, query: $scoped) {
    edges { node {${SCORED_PRODUCT_FIELDS}
    } }
  }
}`;

/** Shape one GraphQL node into what the two scorers expect. Pure. */
export function toScorable(node) {
  return {
    id: node.id,
    numericId: String(node.id || "")
      .split("/")
      .pop(),
    title: node.title || "",
    description: node.description || "",
    seoTitle: node.seo?.title || "",
    seoDescription: node.seo?.description || "",
    productType: node.productType || "",
    vendor: node.vendor || "",
    tags: node.tags || [],
    imageUrl: node.featuredMedia?.preview?.image?.url || "",
    images: (node.media?.edges ?? [])
      .filter((e) => e.node?.mediaContentType === "IMAGE")
      .map((e) => ({ altText: e.node?.image?.altText || "" })),
    variants: (node.variants?.edges ?? []).map((e) => e.node),
  };
}

/**
 * Score one product on both rubrics, and combine.
 *
 * The headline the brief asks for is a single "N/100", so the two rubrics are
 * averaged rather than presented separately at the top. Both are still returned
 * because the reveal shows them, and because a store can be strong on one and
 * weak on the other — which is the entire pitch.
 * Pure.
 */
export function scoreProduct(p) {
  const seo = calculateSeoScore({
    description: p.description,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    images: p.images,
  });
  // No faq yet — that gap is exactly what a generated draft fills.
  const geo = calculateGeoScore(p);
  const seoScore = Number(seo?.score) || 0;
  const geoScore = Number(geo?.score) || 0;

  // A2 — `combined` USED TO BE (seo + geo) / 2, and that is what made Home and
  // the SEO Audit disagree by 42 points on the same store in the same minute.
  // Home averaged two rubrics; the audit reported one of them. The gap was
  // arithmetic, not sampling: it is exactly (seo - geo) / 2.
  //
  // There is one rubric in this app that has been reviewed against the doctrine
  // — geoRubric.js, rebuilt in P1.3 on what W1 measured, after it stopped giving
  // a quarter of its marks away for structured data Shopify requires every theme
  // to emit. calculateSeoScore is the older, cruder one: it awards 30 of 100 for
  // a description of 50 characters, which is the exact defect W1 found in 43.9%
  // of stores and the thing this app sells the fix for. A rubric that scores the
  // problem as a pass cannot be the store's headline.
  //
  // So the store score IS the reviewed rubric. `seo` stays in the return because
  // the first-run reveal shows both and a store can be strong on one and weak on
  // the other, but it is no longer half of the headline.
  return { seo: seoScore, geo: geoScore, combined: geoScore };
}

/** Mean of a numeric field across rows, rounded. 0 for an empty list. Pure. */
const meanOf = (rows, pick) =>
  rows.length ? Math.round(rows.reduce((sum, r) => sum + pick(r), 0) / rows.length) : 0;

/**
 * Pick the products that hurt the store score most: lowest combined score
 * first, and on a tie the one with no description at all, because an empty
 * description is the most visible fix and the most convincing first draft.
 * Pure.
 */
export function pickWeakest(scored, n = START_TARGETS) {
  return [...scored]
    .sort((a, b) => {
      const d = a.scores.combined - b.scores.combined;
      if (d !== 0) return d;
      return a.description.trim().length - b.description.trim().length;
    })
    .slice(0, n);
}

/**
 * Scan, score, and choose. Read-only; never throws.
 *
 * @param {object} admin authenticated admin client
 * @param {string} shop
 * @returns {Promise<{empty:true}|{error:true}|{
 *   storeScore:number, storeGeo:number, storeSeo:number, totalScanned:number,
 *   targets:Array<object>, weakest:object }>}
 */
export async function scanStoreForStart(
  admin,
  shop,
  { skipCache = false, ttlSeconds = START_SCAN_TTL_S, adminLocale = null } = {},
) {
  const load = async () => {
    // Phase 4 item 6 — through the shared backoff. This scan now feeds the
    // store score on Home as well as the Start state, so a throttle here would
    // blank the merchant's headline number rather than just delaying a page.
    // A2 — THE SAME SCOPE the SEO Audit uses. This was the literal string
    // "status:active" while the audit used scopeQueryFor(), which also requires
    // published_status:published. So the two screens scored different
    // POPULATIONS as well as using different rubrics: a POS-only or
    // wholesale-only product counted on Home and not in the audit. Unifying the
    // rubric alone would have left that difference in place and the two numbers
    // still disagreeing, for a reason nobody could see on either screen.
    // scopeForShop reads the database, and this module must not import Prisma at
    // load time — L10, and it broke tests/utils/startState.test.js the moment it
    // did. A dynamic import keeps the module graph clean while leaving the scope
    // resolved in ONE place: if each of the two callers had to pass it in,
    // either could forget and the populations would silently diverge again,
    // which is the whole bug.
    const { scopeForShop } = await import("./candidates.server.js");
    const scoped = scopeQueryFor(await scopeForShop(shop));
    const r = await shopifyQuery(
      admin.graphql,
      START_SCAN_QUERY,
      { n: SCAN_LIMIT, scoped },
      {
        shop,
        label: "start scan",
      },
    );
    if (!r.ok) throw new Error(r.error ?? "scan unavailable");

    const shopName = r.data?.shop?.name ?? null;
    // Phase 12 A5 — the shop's country, read with the name, one of the three
    // scope-free signals the language default uses.
    const country = r.data?.shop?.billingAddress?.countryCodeV2 ?? null;
    // A4.6 — a merchant's differentiators live in their COLLECTION copy far more
    // often than in a product description: 21 of 30 sampled collections on the
    // real store carried full hand-written text naming certifications, the trade
    // counter and 25 years of trading, and the voice inference never read any of
    // it. Riding the scan that already runs, so no extra Shopify request.
    const collectionCopy = (r.data?.collections?.edges ?? [])
      .map((e) => ({ title: e?.node?.title ?? "", text: String(e?.node?.description ?? "").trim() }))
      .filter((c) => c.text.length > 0);

    // A4.8 — About / Shipping / Returns pages, on the SAME request.
    //
    // The item was written assuming these would each cost a request. They do
    // not: `pages` is a root connection, so it rides the scan exactly as
    // `collections` and `shop { name }` do. Checking the schema disproved my
    // own premise.
    //
    // UNPUBLISHED pages are dropped: a page nobody can read is not the voice
    // the shop presents. Bodies are sliced here rather than in the query
    // because a Terms page can be very long and only the opening carries voice.
    //
    // ARTICLES ARE DELIBERATELY NOT INCLUDED. Blog posts are long-form and
    // their cadence is not product cadence; learning from them would teach the
    // model to write blog paragraphs into product descriptions. `articles` is
    // available on the same connection if that judgement ever changes.
    const pageCopy = (r.data?.pages?.edges ?? [])
      .filter((e) => e?.node?.isPublished !== false)
      .map((e) => ({
        title: e?.node?.title ?? "",
        text: String(e?.node?.body ?? "")
          .trim()
          .slice(0, PAGE_SAMPLE_CHARS),
      }))
      .filter((p) => p.text.length > 0);
    const nodes = (r.data?.products?.edges ?? []).map((e) => e.node).filter(Boolean);
    if (nodes.length === 0) return { empty: true, shopName, country, language: defaultLanguageFor({ adminLocale, country }) };

    const scored = nodes.map((node) => {
      const p = toScorable(node);
      return { ...p, scores: scoreProduct(p) };
    });

    const targets = pickWeakest(scored, START_TARGETS).map((p) => ({
      productId: p.id,
      numericId: p.numericId,
      title: p.title,
      imageUrl: p.imageUrl,
      geoBefore: p.scores.geo,
      seoBefore: p.scores.seo,
      scoreBefore: p.scores.combined,
      // The "before" the merchant sees next to the draft we write.
      beforeSnippet: p.description
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 280),
    }));

    // Phase 12 A5 — the language this store writes in, from its own copy
    // first, then the admin locale, then the country. Named on the splash,
    // stored on the Shop row, and the brand voice's default when the merchant
    // has not chosen one.
    const catalogueText = [...scored.map((p) => `${p.title} ${p.description}`), ...collectionCopy.map((c) => c.text)].join(" ");
    const language = defaultLanguageFor({ catalogueText, adminLocale, country });

    return {
      empty: false,
      shopName,
      country,
      language,
      collectionCopy,
      pageCopy,
      // Phase 4 item 4.3 — every scored product, so the store score and the
      // per-product before/after come from ONE scan. A "before" measured by a
      // different code path from the "after" is not a delta.
      scored,
      storeScore: meanOf(scored, (p) => p.scores.combined),
      storeGeo: meanOf(scored, (p) => p.scores.geo),
      storeSeo: meanOf(scored, (p) => p.scores.seo),
      totalScanned: scored.length,
      targets,
      weakest: targets[0] ?? null,
    };
  };

  try {
    return skipCache ? await load() : await getCache(storeScanKey(shop), load, ttlSeconds);
  } catch (err) {
    // A fabricated score is worse than no score. The screen offers a retry.
    logger.error(
      { shop, err: err?.message, event: "start_scan_failed" },
      "Start-state scan failed — showing retry",
    );
    return { error: true };
  }
}
