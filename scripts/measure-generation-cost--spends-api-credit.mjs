#!/usr/bin/env node
/**
 * P0.6 — MEASURE the real cost per generation, per content type.
 *
 * Every cost figure in docs/navaal/08-ECONOMICS.md was marked `ASSUMED`, and it
 * had to be: nothing in this app had ever recorded a token count. The Anthropic
 * response's `usage` block was discarded inside callClaude, and
 * `UsageRecord.tokensUsed` was written as the literal 0 at both of the only two
 * places it is ever written. There was no data to measure from.
 *
 * This script makes real Anthropic API calls through THE REAL PRODUCTION
 * FUNCTIONS in app/utils/ai.server.js — not a re-implementation of them — and
 * reads the token counts the API actually returns. A re-implementation would
 * measure the prompt I wrote today, not the prompt merchants are billed for.
 *
 * WHAT IT TOUCHES
 *   - The Anthropic API. It SPENDS REAL CREDIT. A default run is a few cents.
 *   - Nothing else. No Shopify store, no database, no metafield, no product.
 *     The product it describes is a fixture defined in this file. It cannot
 *     write to a merchant's catalogue because it never opens a Shopify client.
 *
 * USAGE
 *   node scripts/measure-generation-cost--spends-api-credit.mjs [options]
 *
 *     --samples N       runs per content type (default 3). More = tighter mean.
 *     --image-url URL   a https://cdn.shopify.com image, required to measure
 *                       altText. Without it altText is reported NOT MEASURED
 *                       rather than guessed.
 *     --types a,b       only these content types.
 *     --json            machine-readable output.
 *
 * Needs ANTHROPIC_API_KEY. It is read from the environment or .env and is never
 * printed (G3).
 */
import { readFileSync, existsSync } from "node:fs";

// --- .env, without adding a dependency -------------------------------------
//
// A value that is empty, a comment, or an obvious placeholder is NOT a value.
// The first version of this loader did not check, so it read this repo's .env —
// where the ANTHROPIC_API_KEY line is a note explaining the key lives in Fly
// secrets, not the key — and cheerfully put that sentence in the x-api-key
// header. The failure surfaced as "Cannot convert argument to a ByteString",
// pointing at an em dash, which says nothing about the real problem. "I have no
// key" and "my key is rejected" must never arrive as the same error.
function usableValue(raw) {
  const v = raw.trim().replace(/^["']|["']$/g, "");
  if (v === "" || v.startsWith("#")) return null;
  if (/^(placeholder|changeme|your[-_])/i.test(v)) return null;
  return v;
}

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    const v = usableValue(m[2]);
    if (v) process.env[m[1]] = v;
  }
}

const KEY = usableValue(process.env.ANTHROPIC_API_KEY || "");
if (!KEY) {
  console.error(
    "No usable ANTHROPIC_API_KEY (checked the environment and .env; an empty value, a\n" +
      "comment or a placeholder does not count).\n\n" +
      "This repo's .env does not hold the key — it holds a note saying the key is a Fly\n" +
      "secret. Run this where the secret exists:\n\n" +
      '  fly ssh console -a contentclaude -C "node /app/scripts/measure-generation-cost--spends-api-credit.mjs"\n\n' +
      "or, without a local Fly token, through the `Measure generation cost` workflow.",
  );
  process.exit(2);
}
process.env.ANTHROPIC_API_KEY = KEY;
// Keep the run quiet: the point is the table, not 200 lines of pino.
process.env.LOG_LEVEL ||= "error";

const {
  generateProductContent,
  generateAltText,
  enhanceExistingContent,
  generateBlogPost,
  generateSocialContent,
  generateCollectionDescription,
  setUsageObserver,
} = await import("../app/utils/ai.server.js");

const { MODEL_PRICING, modelFor, costUsd, formatUsd, PRICING_VERIFIED_ON } = await import(
  "../app/utils/modelPricing.js"
);

// --- arguments --------------------------------------------------------------
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const SAMPLES = Math.max(1, parseInt(argOf("--samples", "3"), 10));
const IMAGE_URL = argOf("--image-url", process.env.MEASURE_IMAGE_URL || "");
const AS_JSON = argv.includes("--json");
const ONLY = argOf("--types", "").split(",").filter(Boolean);

/**
 * A deliberately ORDINARY product. Not the smallest possible input and not a
 * pathological one: roughly what a real store's mid-catalogue product looks
 * like, because that is what the per-generation figure has to represent.
 */
const PRODUCT = {
  title: "Merino Wool Crew Neck Sweater",
  description:
    "<p>A classic crew neck sweater knitted from 100% extra-fine merino wool. Breathable, " +
    "naturally odour-resistant and soft enough to wear against the skin. Ribbed cuffs and hem " +
    "hold their shape. Machine washable on a wool cycle.</p>",
  productType: "Sweaters",
  vendor: "Northfield Knitwear",
  tags: ["merino", "knitwear", "autumn", "mens"],
  price: "89.00",
};

const BRAND_VOICE = {
  storeName: "Northfield Knitwear",
  brandTone: "warm, plain-spoken, quietly confident",
  targetAudience: "people who buy few clothes and keep them a long time",
  keyDifferentiators: "Traceable British wool, knitted in Yorkshire, repaired free for five years",
  language: "en",
  targetKeywords: "merino wool sweater, mens crew neck",
};

const COLLECTION = {
  title: "Autumn Knitwear",
  description: "Our knitwear for the colder months.",
  productsCount: 24,
};

// --- the jobs ---------------------------------------------------------------
const JOBS = {
  product: () => generateProductContent(PRODUCT, BRAND_VOICE, ["description", "metaTitle", "metaDescription"], {}),
  enhance: () => enhanceExistingContent(PRODUCT, BRAND_VOICE, ["description"], {}),
  blog: () => generateBlogPost("How to care for merino wool so it lasts a decade", BRAND_VOICE, { length: "medium" }),
  collection: () => generateCollectionDescription(COLLECTION, BRAND_VOICE, {}),
  social: () => generateSocialContent(PRODUCT, BRAND_VOICE),
  altText: () => generateAltText(IMAGE_URL, PRODUCT.title),
};

// --- capture real usage off the real call path ------------------------------
let captured = [];
setUsageObserver((u) => captured.push(u));

const results = [];
const types = (ONLY.length ? ONLY : Object.keys(JOBS)).filter((t) => JOBS[t]);

for (const type of types) {
  if (type === "altText" && !IMAGE_URL) {
    results.push({ type, status: "NOT MEASURED", reason: "needs --image-url (a https://cdn.shopify.com image)" });
    if (!AS_JSON) console.error(`altText: NOT MEASURED — needs --image-url. Reporting no figure rather than guessing.`);
    continue;
  }

  const runs = [];
  for (let i = 0; i < SAMPLES; i++) {
    captured = [];
    const t0 = Date.now();
    try {
      await JOBS[type]();
    } catch (err) {
      results.push({ type, status: "FAILED", reason: err.message });
      if (!AS_JSON) console.error(`${type}: FAILED — ${err.message}`);
      break;
    }
    // One logical generation can be more than one API call (a retry). Charge
    // the generation with everything it actually cost.
    const inputTokens = captured.reduce((a, c) => a + c.inputTokens, 0);
    const outputTokens = captured.reduce((a, c) => a + c.outputTokens, 0);
    const model = captured[0]?.model ?? modelFor(type);
    runs.push({ inputTokens, outputTokens, model, usd: costUsd({ model, inputTokens, outputTokens }), ms: Date.now() - t0, calls: captured.length });
    if (!AS_JSON) {
      process.stderr.write(
        `  ${type} run ${i + 1}/${SAMPLES}: in=${inputTokens} out=${outputTokens} ` +
          `${formatUsd(costUsd({ model, inputTokens, outputTokens }))}\n`,
      );
    }
  }

  if (runs.length === 0) continue;
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  results.push({
    type,
    status: "MEASURED",
    model: runs[0].model,
    samples: runs.length,
    meanInputTokens: Math.round(mean((r) => r.inputTokens)),
    meanOutputTokens: Math.round(mean((r) => r.outputTokens)),
    meanUsd: mean((r) => r.usd),
    minUsd: Math.min(...runs.map((r) => r.usd)),
    maxUsd: Math.max(...runs.map((r) => r.usd)),
    meanMs: Math.round(mean((r) => r.ms)),
  });
}

setUsageObserver(null);

// --- report -----------------------------------------------------------------
if (AS_JSON) {
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), samples: SAMPLES, pricingVerifiedOn: PRICING_VERIFIED_ON, results }, null, 2));
} else {
  const measured = results.filter((r) => r.status === "MEASURED");
  console.log(`\nMEASURED COST PER GENERATION — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`prices verified ${PRICING_VERIFIED_ON} · ${SAMPLES} sample(s) per type · real API calls through the production code path\n`);
  console.log("| content type | model | in tok | out tok | mean cost | range |");
  console.log("|---|---|---|---|---|---|");
  for (const r of measured) {
    console.log(
      `| ${r.type} | ${MODEL_PRICING[r.model]?.label ?? r.model} | ${r.meanInputTokens} | ${r.meanOutputTokens} | ` +
        `**${formatUsd(r.meanUsd)}** | ${formatUsd(r.minUsd)}–${formatUsd(r.maxUsd)} |`,
    );
  }
  for (const r of results.filter((x) => x.status !== "MEASURED")) {
    console.log(`| ${r.type} | — | — | — | **${r.status}** | ${r.reason} |`);
  }

  if (measured.length) {
    const avg = measured.reduce((a, r) => a + r.meanUsd, 0) / measured.length;
    console.log(`\nunweighted mean across measured types: ${formatUsd(avg)}`);
    console.log("NOTE: the blended figure a plan actually incurs depends on the MIX a merchant generates,");
    console.log("not on this unweighted mean. Weight it before putting it in a pricing table.");
  }
}
