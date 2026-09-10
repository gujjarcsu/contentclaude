/**
 * Phase 4 item 4 — infer the brand voice instead of asking for it.
 *
 * The retired `/app/setup` opened with five questions about tone and audience
 * before the merchant had seen the app do anything. Most people answered them
 * badly or not at all, and a blank brand voice produces generic copy — so the
 * form that existed to improve quality was mostly lowering it.
 *
 * The shop already contains the answer. A merchant who has written their own
 * product descriptions has demonstrated their voice far more accurately than
 * they could describe it in a text field, and Shopify knows the store's name.
 * So on first run this reads both and writes the defaults.
 *
 * ── Three rules ────────────────────────────────────────────────────────────
 *
 * **It costs nothing extra.** The store name rides on the catalogue scan the
 * Start state already runs (`shop { name }` added to that query), and the
 * sample copy comes from the products that scan already returned. No new
 * Shopify request, no model call.
 *
 * **It never overwrites the merchant.** The write is `create`-only through an
 * upsert whose `update` is empty. A merchant who has set their voice in
 * Settings keeps it, for ever, and Settings always wins.
 *
 * **It is not gated.** Every plan gets it. A brand voice is not a feature, it
 * is the difference between usable copy and generic copy, and charging for it
 * would mean deliberately shipping worse writing to free shops.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { plainText } from "./contentQuality.js";
import { recurringClaims } from "./standingClaims.js";

/** How many of the merchant's own descriptions to keep as voice samples. */
export const SAMPLE_COUNT = 3;
/** Descriptions shorter than this say nothing about a voice. */
export const MIN_SAMPLE_CHARS = 120;
/** Keep the stored sample bounded — this goes into every prompt. */
export const MAX_SAMPLE_CHARS = 1500;

/**
 * Where a collection description ranks against a scored product.
 *
 * Above the middle, below a genuinely well-scored product. A collection is
 * usually the merchant's best writing but it describes a RANGE, so a voice
 * built purely from collections writes range copy for single products.
 */
export const COLLECTION_SAMPLE_SCORE = 55;

/** At most this many inferred differentiators; the rest is noise in a prompt. */
export const MAX_DIFFERENTIATORS = 5;

/**
 * The claims this shop makes on ITS OWN pages, as Key Differentiators.
 *
 * `recurringClaims` needs no pattern list: a sentence repeated across a fifth of
 * a shop's copy is a policy, not prose. Pattern-matched kinds (shipping, price
 * match, certification, trade terms) sort first because those are the ones a
 * shopper chooses on.
 *
 * Invents nothing: a shop that repeats nothing gets "".
 */
export function inferDifferentiators(texts) {
  const found = recurringClaims(texts, { minShare: 0.2, minCount: 3 });
  return found
    .slice(0, MAX_DIFFERENTIATORS)
    .map((f) => f.text.trim())
    .join(" ")
    .slice(0, MAX_SAMPLE_CHARS)
    .trim();
}

/**
 * Pick the merchant's own best-written descriptions as voice samples. Pure.
 *
 * "Best" is their SEO/GEO score, which is what the app already computes for the
 * store score — so the samples are the products this merchant clearly put
 * effort into, not the first three alphabetically.
 *
 * @param {Array<{title?: string, description?: string, scores?: {combined?: number}}>} scored
 */
export function pickVoiceSamples(scored, { count = SAMPLE_COUNT, collectionCopy = [] } = {}) {
  const products = Array.isArray(scored)
    ? scored.map((p) => ({
        title: p?.title ?? "",
        text: plainText(p?.description),
        score: p?.scores?.combined ?? 0,
      }))
    : [];

  // A4.6 — collection copy, which the inference never read.
  //
  // On the real store 21 of 30 sampled collections carried full hand-written
  // text naming certifications, the trade counter and 25 years of trading —
  // the merchant's actual differentiators — while every product description
  // was templated boilerplate. Sampling only products learned the boilerplate
  // and called it their voice.
  //
  // Scored just above the midpoint rather than top: a collection description is
  // usually the merchant's best writing, but it describes a RANGE, so a voice
  // built only from collections would write range copy for a single product.
  // Products still win on a store whose product copy is genuinely good.
  const collections = (Array.isArray(collectionCopy) ? collectionCopy : []).map((c) => ({
    title: c?.title ?? "",
    text: plainText(c?.text ?? c?.description),
    score: COLLECTION_SAMPLE_SCORE,
  }));

  return [...products, ...collections]
    .filter((p) => p.text.length >= MIN_SAMPLE_CHARS)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .slice(0, count);
}

/**
 * The sampleContent string to store, from those samples. Pure.
 * Returns "" when the shop has nothing worth learning from — a merchant with
 * no descriptions of their own has no voice to infer, and inventing one would
 * be worse than leaving it blank.
 */
export function buildSampleContent(samples) {
  if (!samples || samples.length === 0) return "";
  const joined = samples
    .map((s) => (s.title ? `${s.title}: ${s.text}` : s.text))
    .join("\n\n")
    .slice(0, MAX_SAMPLE_CHARS);
  return joined.trim();
}

/**
 * Create the brand-voice row from what the shop already contains, but only if
 * the merchant has not set one.
 *
 * Never throws and is never awaited by a loader — a missing brand voice costs
 * slightly more generic copy, and is not worth delaying a page or failing one.
 *
 * @param {string} shop
 * @param {{scored?: Array, shopName?: string|null}} from
 * @returns {Promise<{created: boolean, storeName?: string, samples?: number}>}
 */
export async function ensureInferredBrandVoice(
  shop,
  { scored = [], shopName = null, collectionCopy = [] } = {},
) {
  try {
    const existing = await prisma.brandVoice.findUnique({
      where: { shop },
      select: { shop: true },
    });
    if (existing) return { created: false };

    const samples = pickVoiceSamples(scored, { collectionCopy });
    const sampleContent = buildSampleContent(samples);

    // A4.6 — the merchant's own standing claims, read from products AND
    // collections. Create-only like everything else here: a merchant who has
    // written their own differentiators keeps them for ever.
    const keyDifferentiators = inferDifferentiators([
      ...(Array.isArray(scored) ? scored.map((p) => plainText(p?.description)) : []),
      ...(Array.isArray(collectionCopy) ? collectionCopy.map((c) => plainText(c?.text ?? c?.description)) : []),
    ]);
    // Shopify's own store name, falling back to the shop handle rather than to
    // an empty string — "Alpine Supply" reads as a brand, "" reads as a bug.
    const storeName = String(shopName || "").trim() || String(shop).split(".")[0];

    await prisma.brandVoice.upsert({
      where: { shop },
      create: { shop, storeName, sampleContent, keyDifferentiators },
      // Empty ON PURPOSE. If the row appeared between the read above and this
      // write, the merchant's own settings win — inference never overwrites.
      update: {},
    });

    logger.info(
      {
        shop,
        storeName,
        samples: samples.length,
        collectionsSampled: samples.filter((s) => s.score === COLLECTION_SAMPLE_SCORE).length,
        differentiators: keyDifferentiators ? keyDifferentiators.length : 0,
        event: "brand_voice_inferred",
      },
      "Brand voice inferred from the shop's own copy",
    );
    return { created: true, storeName, samples: samples.length };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "brand voice inference failed (non-fatal)");
    return { created: false };
  }
}
