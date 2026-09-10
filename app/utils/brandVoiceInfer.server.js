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

/** How many of the merchant's own descriptions to keep as voice samples. */
export const SAMPLE_COUNT = 3;
/** Descriptions shorter than this say nothing about a voice. */
export const MIN_SAMPLE_CHARS = 120;
/** Keep the stored sample bounded — this goes into every prompt. */
export const MAX_SAMPLE_CHARS = 1500;

/**
 * Pick the merchant's own best-written descriptions as voice samples. Pure.
 *
 * "Best" is their SEO/GEO score, which is what the app already computes for the
 * store score — so the samples are the products this merchant clearly put
 * effort into, not the first three alphabetically.
 *
 * @param {Array<{title?: string, description?: string, scores?: {combined?: number}}>} scored
 */
export function pickVoiceSamples(scored, { count = SAMPLE_COUNT } = {}) {
  if (!Array.isArray(scored)) return [];
  return scored
    .map((p) => ({ title: p?.title ?? "", text: plainText(p?.description), score: p?.scores?.combined ?? 0 }))
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
export async function ensureInferredBrandVoice(shop, { scored = [], shopName = null } = {}) {
  try {
    const existing = await prisma.brandVoice.findUnique({
      where: { shop },
      select: { shop: true },
    });
    if (existing) return { created: false };

    const samples = pickVoiceSamples(scored);
    const sampleContent = buildSampleContent(samples);
    // Shopify's own store name, falling back to the shop handle rather than to
    // an empty string — "Alpine Supply" reads as a brand, "" reads as a bug.
    const storeName = String(shopName || "").trim() || String(shop).split(".")[0];

    await prisma.brandVoice.upsert({
      where: { shop },
      create: { shop, storeName, sampleContent },
      // Empty ON PURPOSE. If the row appeared between the read above and this
      // write, the merchant's own settings win — inference never overwrites.
      update: {},
    });

    logger.info(
      { shop, storeName, samples: samples.length, event: "brand_voice_inferred" },
      "Brand voice inferred from the shop's own copy",
    );
    return { created: true, storeName, samples: samples.length };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "brand voice inference failed (non-fatal)");
    return { created: false };
  }
}
