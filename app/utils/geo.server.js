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

/**
 * Compute a GEO Readiness Score (0–100) for a single product from data the store
 * ALREADY has — no external API calls. Grades how citable the content is by AI
 * answer engines across six dimensions.
 *
 * input shape (all optional, missing = not credited — never fabricated):
 *   description     – product description (HTML or text)
 *   seoTitle        – meta title
 *   seoDescription  – meta description
 *   images          – [{ altText }]
 *   productType, vendor, tags[]            – entity attributes
 *   price | variants[{price}]              – pricing entity
 *   faq             – FAQ text in "Q:/A:" format (from generation)
 *   rating          – { value, count } from a reviews source (never invented)
 *
 * @returns {{ score:number, checks:object, breakdown:Array }}
 */
export function calculateGeoScore(input = {}) {
  const descText = stripHtml(input.description);
  const faqPairs = parseFaqPairs(input.faq);
  const images = Array.isArray(input.images) ? input.images : [];
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const prices = Array.isArray(input.variants)
    ? input.variants.map((v) => parseFloat(v?.price)).filter((p) => !isNaN(p))
    : [];
  const hasPrice = prices.length > 0 || !isNaN(parseFloat(input.price));

  // 1) Answer-first structure (15) — leads with a concise, self-contained answer.
  //    Heuristic: a real opening sentence that is declarative and standalone,
  //    on a description of usable length.
  const opener = firstSentence(input.description);
  const answerFirst =
    descText.length >= 120 && opener.length >= 40 && opener.length <= 300;
  const answerFirstPartial = !answerFirst && descText.length >= 60 && opener.length >= 20;
  const answerFirstPts = answerFirst ? 15 : answerFirstPartial ? 8 : 0;

  // 2) Q&A / FAQ block (20) — AI engines extract Q&A directly.
  const faqCount = faqPairs.length;
  const faqPts = faqCount >= 3 ? 20 : faqCount === 2 ? 14 : faqCount === 1 ? 7 : 0;

  // 3) Schema breadth & validity (25) — valid JSON-LD the engines can parse.
  const schema = buildProductJsonLd(input);
  const types = schemaTypes(schema);
  // Product is the backbone; FAQPage/Offer/AggregateRating add breadth.
  let schemaPts = 0;
  if (types.includes("Product")) schemaPts += 12;
  if (types.includes("Offer")) schemaPts += 5;
  if (types.includes("FAQPage")) schemaPts += 5;
  if (types.includes("AggregateRating")) schemaPts += 3;
  schemaPts = clamp(schemaPts, 0, 25);

  // 4) Entity / attribute completeness (20) — facts LLMs need to answer "which
  //    product fits X?": type, brand, price, tags/keywords, descriptive depth.
  const entitySignals = [
    !!(input.productType && String(input.productType).trim()),
    !!(input.vendor && String(input.vendor).trim()),
    hasPrice,
    tags.length >= 1,
    descText.length >= 250, // enough descriptive substance to carry attributes
  ];
  const entityFilled = entitySignals.filter(Boolean).length;
  const entityPts = Math.round((entityFilled / entitySignals.length) * 20);

  // 5) Meta quality (10) — concise, length-appropriate title + description.
  const metaTitle = (input.seoTitle || "").trim();
  const metaDesc = (input.seoDescription || "").trim();
  const titleOk = metaTitle.length > 0 && metaTitle.length <= 60;
  const descOk = metaDesc.length > 0 && metaDesc.length <= 160;
  const metaPts = (titleOk ? 5 : metaTitle ? 2 : 0) + (descOk ? 5 : metaDesc ? 2 : 0);

  // 6) Media / alt text (10) — image alt text gives multimodal engines context.
  const hasImages = images.length > 0;
  const hasAlt = hasImages && images.some((i) => i?.altText && i.altText.trim());
  const mediaPts = (hasImages ? 4 : 0) + (hasAlt ? 6 : 0);

  const checks = {
    answerFirst: { pass: answerFirst, partial: answerFirstPartial },
    faqBlock: { pass: faqCount >= 2, count: faqCount },
    schema: { pass: schemaPts >= 12, types },
    entities: { pass: entityFilled >= 4, filled: entityFilled, total: entitySignals.length },
    meta: { pass: titleOk && descOk },
    media: { pass: hasAlt },
  };

  const breakdown = [
    { key: "answerFirst", label: "Answer-first structure", points: answerFirstPts, max: 15 },
    { key: "faqBlock", label: "Q&A / FAQ block", points: faqPts, max: 20 },
    { key: "schema", label: "Structured data (JSON-LD)", points: schemaPts, max: 25 },
    { key: "entities", label: "Entity / attribute completeness", points: entityPts, max: 20 },
    { key: "meta", label: "Meta title & description", points: metaPts, max: 10 },
    { key: "media", label: "Image alt text", points: mediaPts, max: 10 },
  ];

  const score = clamp(
    answerFirstPts + faqPts + schemaPts + entityPts + metaPts + mediaPts,
    0,
    100
  );

  return { score, checks, breakdown };
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

  lines.push("", `_Generated by ContentClaude · ${new Date().toISOString().slice(0, 10)}_`);
  return lines.join("\n") + "\n";
}

function oneLine(s) {
  return stripHtml(String(s || "")).replace(/\s+/g, " ").trim();
}
