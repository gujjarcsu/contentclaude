// GEO / AEO engine — server-only, pure functions (no external API calls).
//
// "GEO" = Generative/Answer Engine Optimization: making product content easy for
// AI answer engines (ChatGPT, Perplexity, Gemini, Google AI Overviews) to extract,
// trust, and cite. This is the wedge that differentiates ContentClaude from
// commodity "AI description" apps.
//
// This module EXTENDS the existing SEO primitives in seo.server.js (it reuses
// parseFaqPairs/faqToJsonLd and mirrors calculateSeoScore's shape) — it does not
// replace them. Traditional SEO score and GEO readiness score are kept separate
// and clearly labelled.

import { parseFaqPairs, faqToJsonLd } from "./seo.server.js";
import { GEO_RUBRIC, ATTRIBUTE_GRADES } from "./geoRubric.js";

// Re-exported so existing importers keep working, and so there is still exactly
// one definition of the rubric.
export { GEO_RUBRIC, ATTRIBUTE_GRADES };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text) {
  const clean = stripHtml(text);
  if (!clean) return "";
  const m = clean.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : clean).trim();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ─── GEO Readiness Score ──────────────────────────────────────────────────────

/** A year. Older than this and "recently reviewed" stops being true. */
const FRESH_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Concrete, checkable facts: a number attached to a unit.
 *
 * The separator is `[\s-]*`, not `\s*`, because real product copy hyphenates
 * constantly \u2014 "14-inch laptop", "3-metre cable", "500-gram bag". The first
 * version required whitespace, so it scored every one of those as zero evidence
 * and would have called a genuinely specific description thin. Found by running
 * it against this repo's own RICH_PRODUCT fixture instead of against strings
 * written to make it pass.
 */
const EVIDENCE_PATTERN =
  /\d+(?:[.,]\d+)?[\s-]*(?:mm|cm|m|km|kg|g|mg|ml|l|oz|lb|lbs|in|inch|inches|ft|foot|feet|"|%|\u00b0c|\u00b0f|w|kw|v|ah|mah|gb|tb|hz|px|pcs|pack|ply|thread|count|litre|liter|gram|metre|meter)\b/gi;

/**
 * Compute a GEO Readiness Score (0\u2013100) for a single product from data the store
 * ALREADY has \u2014 no external API calls.
 *
 * P1.1 \u2014 what this DOES and does not measure. It grades properties of the
 * merchant's own content. It cannot observe a citation, and no evidence links
 * these inputs to being cited by any named engine. The score is a
 * content-readiness score; say that and nothing more (`09-DOCTRINE.md` §2).
 *
 * input shape (all optional, missing = not credited \u2014 never fabricated):
 *   description     \u2013 product description (HTML or text)
 *   seoTitle        \u2013 meta title
 *   seoDescription  \u2013 meta description
 *   images          \u2013 [{ altText }]
 *   productType, vendor, tags[]            \u2013 entity attributes
 *   price | variants[{price}]              \u2013 pricing entity
 *   barcode | variants[{barcode}]          \u2013 Admin-API-only; scored only if supplied
 *   faq             \u2013 FAQ text in "Q:/A:" format (from generation)
 *   updatedAt       \u2013 ISO date or Date; scored only if supplied
 *
 * @returns {{ score:number, checks:object, breakdown:Array, notMeasured:string[] }}
 */
export function calculateGeoScore(input = {}) {
  const descText = stripHtml(input.description);
  const faqPairs = parseFaqPairs(input.faq);
  const images = Array.isArray(input.images) ? input.images : [];
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const variants = Array.isArray(input.variants) ? input.variants : [];

  const prices = variants.map((v) => parseFloat(v?.price)).filter((n) => !isNaN(n));
  const hasPrice = prices.length > 0 || !isNaN(parseFloat(input.price));

  // "Not supplied" and "supplied but empty" are different findings (L3). Only
  // an attribute the caller actually asked about is scored.
  const barcodeSupplied = "barcode" in input || variants.some((v) => v && "barcode" in v);
  const hasBarcode =
    !!String(input.barcode || "").trim() ||
    variants.some((v) => !!String(v?.barcode || "").trim());

  // ── 1. Content density (25) ────────────────────────────────────────────
  // Length band plus concrete detail. A long description of adjectives is not
  // dense; "26cm, 3.2kg, cast iron" is.
  const len = descText.length;
  const lengthPts = len >= 600 ? 15 : len >= 300 ? 12 : len >= 120 ? 7 : len > 0 ? 2 : 0;
  const evidenceHits = (descText.match(EVIDENCE_PATTERN) || []).length;
  const evidencePts = Math.min(10, evidenceHits * 2.5);
  const contentDensityPts = Math.round(lengthPts + evidencePts);

  // ── 2. Attributes (20), graded ─────────────────────────────────────────
  const attributePresence = {
    price: hasPrice,
    vendor: !!String(input.vendor || "").trim(),
    barcode: hasBarcode,
    productType: !!String(input.productType || "").trim(),
    tags: tags.length >= 1,
  };
  const gradedAttributes = ATTRIBUTE_GRADES.filter(
    (a) => !a.adminOnly || barcodeSupplied,
  ).map((a) => ({ ...a, present: !!attributePresence[a.key] }));

  const attributesAvailable = gradedAttributes.reduce((sum, a) => sum + a.weight, 0);
  const attributesEarned = gradedAttributes
    .filter((a) => a.present)
    .reduce((sum, a) => sum + a.weight, 0);
  // Renormalised within the dimension, so not supplying barcode does not cost
  // points it was never possible to earn.
  const attributePts = attributesAvailable
    ? Math.round((attributesEarned / attributesAvailable) * 20)
    : 0;

  // ── 3. Answer-first opening (15) ───────────────────────────────────────
  const opener = firstSentence(input.description);
  const answerFirst = descText.length >= 120 && opener.length >= 40 && opener.length <= 300;
  const answerFirstPartial = !answerFirst && descText.length >= 60 && opener.length >= 20;
  const answerFirstPts = answerFirst ? 15 : answerFirstPartial ? 8 : 0;

  // ── 4. Questions and answers (15) ──────────────────────────────────────
  const faqCount = faqPairs.length;
  const qaPts = faqCount >= 3 ? 15 : faqCount === 2 ? 10 : faqCount === 1 ? 5 : 0;

  // ── 5. Meta (10) ───────────────────────────────────────────────────────
  const metaTitle = (input.seoTitle || "").trim();
  const metaDesc = (input.seoDescription || "").trim();
  const titleOk = metaTitle.length > 0 && metaTitle.length <= 60;
  const descOk = metaDesc.length > 0 && metaDesc.length <= 160;
  const metaPts = (titleOk ? 5 : metaTitle ? 2 : 0) + (descOk ? 5 : metaDesc ? 2 : 0);

  // ── 6. Image alt text (10) ─────────────────────────────────────────────
  const hasImages = images.length > 0;
  const hasAlt = hasImages && images.some((i) => i?.altText && String(i.altText).trim());
  const mediaPts = (hasImages ? 4 : 0) + (hasAlt ? 6 : 0);

  // ── 7. Freshness (5), only when the date is known ──────────────────────
  const updatedAt = input.updatedAt ? new Date(input.updatedAt) : null;
  const freshnessKnown = !!updatedAt && !isNaN(updatedAt.getTime());
  const ageMs = freshnessKnown ? Date.now() - updatedAt.getTime() : null;
  const freshnessPts = freshnessKnown ? (ageMs <= FRESH_MAX_AGE_MS ? 5 : 0) : 0;

  const earned = {
    contentDensity: contentDensityPts,
    attributes: attributePts,
    answerFirst: answerFirstPts,
    qa: qaPts,
    meta: metaPts,
    media: mediaPts,
    freshness: freshnessPts,
  };

  // A dimension we could not measure is EXCLUDED, not zeroed, and the rest is
  // renormalised to 100.
  const measurable = GEO_RUBRIC.filter((d) => !(d.key === "freshness" && !freshnessKnown));
  const notMeasured = GEO_RUBRIC.filter((d) => !measurable.includes(d)).map((d) => d.key);

  const availableMax = measurable.reduce((sum, d) => sum + d.max, 0);
  const totalEarned = measurable.reduce((sum, d) => sum + (earned[d.key] || 0), 0);
  const score = availableMax ? clamp(Math.round((totalEarned / availableMax) * 100), 0, 100) : 0;

  const breakdown = measurable.map((d) => ({
    key: d.key,
    label: d.label,
    points: earned[d.key] || 0,
    max: d.max,
    why: d.why,
    ...(d.key === "attributes" ? { attributes: gradedAttributes } : {}),
  }));

  const checks = {
    contentDensity: { pass: contentDensityPts >= 15, chars: len, evidence: evidenceHits },
    attributes: {
      pass: gradedAttributes.filter((a) => a.grade === "blocking").every((a) => a.present),
      missingBlocking: gradedAttributes.filter((a) => a.grade === "blocking" && !a.present).map((a) => a.key),
      missingDegrading: gradedAttributes.filter((a) => a.grade === "degrading" && !a.present).map((a) => a.key),
      missingCosmetic: gradedAttributes.filter((a) => a.grade === "cosmetic" && !a.present).map((a) => a.key),
    },
    answerFirst: { pass: answerFirst, partial: answerFirstPartial },
    qa: { pass: faqCount >= 2, count: faqCount },
    meta: { pass: titleOk && descOk },
    media: { pass: hasAlt },
    freshness: { pass: freshnessKnown && freshnessPts > 0, known: freshnessKnown },
  };

  return { score, checks, breakdown, notMeasured };
}

/** Aggregate a store-level GEO score from an array of per-product scores. */
export function aggregateGeoScore(productScores) {
  const arr = Array.isArray(productScores) ? productScores.filter((n) => typeof n === "number") : [];
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);
}

// ─── JSON-LD schema builder (Product / Offer / AggregateRating / FAQPage) ──────

/**
 * Build a valid JSON-LD @graph for a product. Only includes nodes/fields for
 * which real data exists — never emits malformed schema and never invents data
 * (e.g. AggregateRating only when a real rating + count are supplied).
 *
 * @returns {object|null} a schema.org object with @graph, or null if nothing valid.
 */
export function buildProductJsonLd(input = {}) {
  const name = (input.title || "").trim();
  const description = stripHtml(input.description).slice(0, 5000);
  const graph = [];

  // Product node — requires at least a name.
  if (name) {
    const product = {
      "@type": "Product",
      name,
    };
    if (description) product.description = description;
    if (input.vendor && String(input.vendor).trim()) {
      product.brand = { "@type": "Brand", name: String(input.vendor).trim() };
    }
    if (input.productType && String(input.productType).trim()) {
      product.category = String(input.productType).trim();
    }
    if (input.sku) product.sku = String(input.sku);
    if (input.imageUrl) product.image = input.imageUrl;
    else if (Array.isArray(input.images) && input.images[0]?.url) product.image = input.images[0].url;

    // Offer — only with a valid numeric price.
    const prices = Array.isArray(input.variants)
      ? input.variants.map((v) => parseFloat(v?.price)).filter((p) => !isNaN(p))
      : [];
    const single = parseFloat(input.price);
    const lowPrice = prices.length ? Math.min(...prices) : (!isNaN(single) ? single : null);
    if (lowPrice !== null) {
      const offer = {
        "@type": "Offer",
        price: lowPrice.toFixed(2),
        priceCurrency: input.currency || "USD",
        availability: "https://schema.org/InStock",
      };
      if (prices.length > 1) {
        offer["@type"] = "AggregateOffer";
        offer.lowPrice = Math.min(...prices).toFixed(2);
        offer.highPrice = Math.max(...prices).toFixed(2);
        offer.offerCount = prices.length;
        delete offer.price;
      }
      product.offers = offer;
    }

    // AggregateRating — ONLY when a real rating + review count exist.
    const rv = parseFloat(input.rating?.value);
    const rc = parseInt(input.rating?.count, 10);
    if (!isNaN(rv) && rv > 0 && rv <= 5 && !isNaN(rc) && rc > 0) {
      product.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: rv,
        reviewCount: rc,
        bestRating: 5,
        worstRating: 1,
      };
    }

    graph.push(product);
  }

  // FAQPage node — reuse the existing FAQ → JSON-LD primitive.
  const faqLd = faqToJsonLd(input.faq);
  if (faqLd) graph.push({ "@type": "FAQPage", mainEntity: faqLd.mainEntity });

  if (graph.length === 0) return null;
  return { "@context": "https://schema.org", "@graph": graph };
}

/** List the schema.org @types present in a built graph (incl. nested Offer/Rating). */
export function schemaTypes(schema) {
  if (!schema || !Array.isArray(schema["@graph"])) return [];
  const types = new Set();
  for (const node of schema["@graph"]) {
    if (node["@type"]) types.add(node["@type"]);
    if (node.offers?.["@type"]) types.add(node.offers["@type"] === "AggregateOffer" ? "Offer" : node.offers["@type"]);
    if (node.aggregateRating?.["@type"]) types.add("AggregateRating");
  }
  return [...types];
}

/** Serialize a JSON-LD object to a ready-to-embed <script> string (or "" if null). */
export function jsonLdScriptTag(schema) {
  if (!schema) return "";
  // Escape "</" to prevent breaking out of the <script> context.
  const json = JSON.stringify(schema).replace(/<\//g, "<\\/");
  return `<script type="application/ld+json">${json}</script>`;
}

// ─── llms.txt generator ────────────────────────────────────────────────────────

/**
 * Generate an `llms.txt` (or expanded `llms-full.txt`) document following the
 * llms.txt convention (https://llmstxt.org): a clean, curated, Markdown index of
 * the store's key products/collections that AI agents can read to understand the
 * catalog. Pure function — caller supplies the already-fetched data.
 *
 * @param {object} store   { name, domain, description, appProxyUrl }
 * @param {Array}  items   [{ title, handle, url, summary, type }]
 * @param {object} opts    { full?:boolean, collections?:Array }
 * @returns {string} Markdown document
 */
export function generateLlmsTxt(store = {}, items = [], opts = {}) {
  const full = !!opts.full;
  const name = (store.name || "Store").trim();
  const lines = [];

  lines.push(`# ${name}`);
  if (store.description) lines.push("", `> ${oneLine(store.description)}`);
  lines.push(
    "",
    `This file helps AI assistants and answer engines understand ${name}'s catalog.`
  );

  const products = items.filter((i) => (i.type || "product") === "product");
  const collections = Array.isArray(opts.collections) ? opts.collections : items.filter((i) => i.type === "collection");

  if (collections.length) {
    lines.push("", "## Collections");
    for (const c of collections) {
      lines.push(`- [${oneLine(c.title)}](${c.url})${c.summary ? `: ${oneLine(c.summary)}` : ""}`);
    }
  }

  if (products.length) {
    lines.push("", "## Products");
    for (const p of products) {
      const summary = oneLine(p.summary || "");
      const trimmed = full ? summary : summary.slice(0, 160);
      lines.push(`- [${oneLine(p.title)}](${p.url})${trimmed ? `: ${trimmed}` : ""}`);
      if (full && p.attributes) {
        const attrs = Object.entries(p.attributes)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${oneLine(String(v))}`);
        if (attrs.length) lines.push(`  - ${attrs.join(" · ")}`);
      }
    }
  }

  lines.push("", `_Generated by Navaal · ${new Date().toISOString().slice(0, 10)}_`);
  return lines.join("\n") + "\n";
}

function oneLine(s) {
  return stripHtml(String(s || "")).replace(/\s+/g, " ").trim();
}
