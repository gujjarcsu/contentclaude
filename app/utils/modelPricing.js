/**
 * P0.6 — MODEL CHOICE AND MODEL COST. One constant, one place.
 *
 * Why this file exists
 * --------------------
 * Every cost figure in docs/navaal/08-ECONOMICS.md was marked `ASSUMED`, and it
 * had to be, because nothing in this app had ever measured one. Two facts made
 * that permanent:
 *
 *   1. Model IDs were written inline at six separate call sites in
 *      ai.server.js. Re-pricing or re-routing meant finding all six.
 *   2. `UsageRecord.tokensUsed` — a column that exists, is typed, is indexed and
 *      is named as if it measures something — was written as the LITERAL 0, at
 *      both of the only two places it is ever written. The Anthropic response's
 *      `usage` block sat in callClaude and was discarded. So there was no data
 *      to measure from, and there never would have been.
 *
 * 08-ECONOMICS.md §7 asks for exactly this: "Model price changes. The whole
 * table above moves with one number; keep the assumption in one place in code so
 * it can be re-priced in one edit."
 *
 * PURE MODULE (G5). No I/O, no imports, no environment. Safe on the client.
 * Prices are USD per million tokens, taken from Anthropic's published pricing
 * page on 2026-09-14. If they move, they move HERE and nowhere else.
 */

/** Model IDs. Never write one inline. */
export const MODELS = {
  SONNET_4_6: "claude-sonnet-4-6",
  SONNET_5: "claude-sonnet-5",
  HAIKU_4_5: "claude-haiku-4-5-20251001",
};

/**
 * USD per MILLION tokens, verified against Anthropic's pricing page 2026-09-14.
 *
 * `tokenizer` matters as much as price and is the trap in any naive comparison:
 * Claude 4.7-and-later models use a newer tokenizer that produces roughly 30%
 * MORE tokens for the same text. So a model with a lower per-token price is not
 * automatically cheaper per GENERATION. That is precisely why the figures in
 * 08-ECONOMICS.md come from measured token counts and not from this table alone.
 */
export const MODEL_PRICING = {
  [MODELS.SONNET_4_6]: { input: 3.0, output: 15.0, tokenizer: "legacy", label: "Sonnet 4.6" },
  [MODELS.SONNET_5]: { input: 2.0, output: 10.0, tokenizer: "modern", label: "Sonnet 5" },
  [MODELS.HAIKU_4_5]: { input: 1.0, output: 5.0, tokenizer: "legacy", label: "Haiku 4.5" },
};

/** Pricing page checked on this date. Re-verify when it is stale. */
export const PRICING_VERIFIED_ON = "2026-09-14";

/**
 * Content type -> model. THE routing table.
 *
 * The rule: a frontier model earns its price only where the merchant reads the
 * output as prose they would otherwise have written themselves. Alt text is a
 * caption under 125 characters describing a picture — a small model does that as
 * well as a large one, and it is the highest-VOLUME content type we generate
 * (one per image, and a catalogue has several images per product). Social
 * captions are the same shape: short, templated, high volume.
 *
 * Long-form prose — product descriptions, blog posts, collection copy — is what
 * the merchant is actually paying for. That is where the quality is worth the
 * money.
 */
export const MODEL_FOR = {
  // Long-form, merchant-facing prose. Worth a frontier model.
  product: MODELS.SONNET_4_6,
  enhance: MODELS.SONNET_4_6,
  blog: MODELS.SONNET_4_6,
  collection: MODELS.SONNET_4_6,

  // Short, high-volume, structurally simple. A frontier model is wasted here.
  altText: MODELS.HAIKU_4_5,
  social: MODELS.HAIKU_4_5,
};

/** Every content type this app can generate. Keep in step with MODEL_FOR. */
export const CONTENT_TYPES = Object.keys(MODEL_FOR);

/**
 * The model a content type should use.
 *
 * An UNKNOWN content type throws rather than silently defaulting. A default
 * here would mean a new content type quietly billing at frontier rates with
 * nobody deciding that — which is the failure this whole file exists to stop.
 */
export function modelFor(contentType) {
  const model = MODEL_FOR[contentType];
  if (!model) {
    throw new Error(
      `No model routing for content type "${contentType}". Add it to MODEL_FOR in app/utils/modelPricing.js — ` +
        `a new content type must have its cost decided deliberately, not inherited by default.`,
    );
  }
  return model;
}

/**
 * Cost of one call, in USD.
 *
 * Returns a float for display. For storage or accumulation use costMicroUsd —
 * summing floats across thousands of generations drifts.
 */
export function costUsd({ model, inputTokens = 0, outputTokens = 0 }) {
  const price = MODEL_PRICING[model];
  if (!price) {
    throw new Error(
      `No pricing for model "${model}". Add it to MODEL_PRICING in app/utils/modelPricing.js. ` +
        `An unpriced model must not be billable as free.`,
    );
  }
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * Cost in MICRO-dollars (millionths of a USD), as an integer.
 *
 * A single alt text costs about 0.0002 USD. Stored as a float and summed over a
 * month that loses precision exactly where the number matters; stored as cents
 * it rounds to zero and every cheap generation becomes free. Integer micro-USD
 * keeps a Scale-plan month (25,000 generations) exact and well inside Int range.
 */
export function costMicroUsd({ model, inputTokens = 0, outputTokens = 0 }) {
  return Math.round(costUsd({ model, inputTokens, outputTokens }) * 1_000_000);
}

/** USD formatted at a sensible precision for figures this small. */
export function formatUsd(usd) {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
