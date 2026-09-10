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
import { calculateSeoScore } from "./seo.server.js";
import { calculateGeoScore } from "./geo.server.js";

/**
 * How many products to score. The store score is a sample and is described as
 * one ("We scanned N of your products"), never as the whole catalogue.
 * 30 is what the welcome scan used and what its GraphQL cost was sized for.
 */
export const SCAN_LIMIT = 30;
/** How many products the Start state offers to fix. The brief's number. */
export const START_TARGETS = 3;
/** Short — a merchant who refreshes twice in a minute should not re-scan. */
export const START_SCAN_TTL_S = 120;

export const START_SCAN_QUERY = `query startScan($n: Int!) {
  products(first: $n, sortKey: UPDATED_AT, query: "status:active") {
    edges { node {
      id title description productType vendor tags
      seo { title description }
      featuredMedia { preview { image { url } } }
      media(first: 3) { edges { node { mediaContentType ... on MediaImage { image { altText } } } } }
      variants(first: 3) { edges { node { price } } }
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
  return { seo: seoScore, geo: geoScore, combined: Math.round((seoScore + geoScore) / 2) };
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
export async function scanStoreForStart(admin, shop, { skipCache = false } = {}) {
  const load = async () => {
    const resp = await admin.graphql(START_SCAN_QUERY, { variables: { n: SCAN_LIMIT } });
    const { data, errors } = await resp.json();
    if (errors?.length) throw new Error(errors[0]?.message || "GraphQL error");

    const nodes = (data?.products?.edges ?? []).map((e) => e.node).filter(Boolean);
    if (nodes.length === 0) return { empty: true };

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

    return {
      empty: false,
      storeScore: meanOf(scored, (p) => p.scores.combined),
      storeGeo: meanOf(scored, (p) => p.scores.geo),
      storeSeo: meanOf(scored, (p) => p.scores.seo),
      totalScanned: scored.length,
      targets,
      weakest: targets[0] ?? null,
    };
  };

  try {
    return skipCache ? await load() : await getCache(`startscan:${shop}`, load, START_SCAN_TTL_S);
  } catch (err) {
    // A fabricated score is worse than no score. The screen offers a retry.
    logger.error(
      { shop, err: err?.message, event: "start_scan_failed" },
      "Start-state scan failed — showing retry",
    );
    return { error: true };
  }
}
