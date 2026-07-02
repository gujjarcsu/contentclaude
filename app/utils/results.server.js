// Results / proof engine — turns the shop's PUBLISHED content into an honest
// before→after story, using data the app already stores (GeneratedContent keeps
// both `originalContent` and `generatedContent`). No fabricated traffic/revenue —
// only measured content deltas + computeRoiSummary's labelled time-saved estimate.

import prisma from "../db.server.js";
import { calculateSeoScore } from "./seo.server.js";
import { computeRoiSummary } from "./roi.server.js";

/**
 * Compute the store's provable results from its published AI content.
 * Scores are CONTENT-only (original text vs AI text), so the delta is honestly
 * attributable to the app — it is framed in the UI as a content-readiness lift,
 * not the full product GEO score shown elsewhere.
 */
export async function computeStoreResults(shop, totalProducts = 0) {
  const rows = await prisma.generatedContent.findMany({
    // Products only — collection content lives in the same table (gid://…/Collection/…)
    // but this page is about products (and keeps the "view product" links valid).
    where: { shop, status: "published", productId: { startsWith: "gid://shopify/Product/" } },
    select: {
      productId: true,
      productTitle: true,
      contentType: true,
      originalContent: true,
      generatedContent: true,
    },
  });

  if (rows.length === 0) {
    return { hasResults: false, summary: null, improvements: [] };
  }

  // Group each product's content types together.
  const byProduct = {};
  for (const r of rows) {
    (byProduct[r.productId] ||= { title: r.productTitle })[r.contentType] = r;
  }

  // We score the CONTENT (original text vs AI text). SEO content scoring is
  // complete from text alone (description + meta), so the SEO before→after is an
  // honest, meaningful delta. GEO score depends heavily on product context
  // (images/price/etc.) that isn't in the stored text, so we do NOT surface a
  // content-only GEO number (it would understate and contradict the full GEO
  // score shown elsewhere). GEO is proven instead by the schema facts below.
  let seoBeforeSum = 0, seoAfterSum = 0, scored = 0;
  let hasFaq = false;
  const improvements = [];

  for (const [productId, c] of Object.entries(byProduct)) {
    const desc = c.description;
    const faq = c.faq;
    if (faq?.generatedContent) hasFaq = true;
    if (!desc) continue; // need a description to compare before/after

    const beforeSeo = calculateSeoScore({
      description: desc.originalContent,
      seoTitle: c.metaTitle?.originalContent || "",
      seoDescription: c.metaDescription?.originalContent || "",
    }).score;
    const afterSeo = calculateSeoScore({
      description: desc.generatedContent,
      seoTitle: c.metaTitle?.generatedContent || "",
      seoDescription: c.metaDescription?.generatedContent || "",
    }).score;

    seoBeforeSum += beforeSeo; seoAfterSum += afterSeo;
    scored++;
    improvements.push({
      productId,
      numericId: productId.replace("gid://shopify/Product/", ""),
      title: c.title || productId,
      seoBefore: beforeSeo,
      seoAfter: afterSeo,
      lift: afterSeo - beforeSeo,
    });
  }

  const optimizedProducts = Object.keys(byProduct).length;
  const contentPieces = rows.length;
  const schemaTypes = ["Product", ...(hasFaq ? ["FAQPage"] : [])];

  const summary = computeRoiSummary({
    seoBefore: scored ? Math.round(seoBeforeSum / scored) : 0,
    seoAfter: scored ? Math.round(seoAfterSum / scored) : 0,
    totalProducts,
    optimizedProducts,
    contentPieces,
    schemaTypes,
  });

  // Show the biggest genuine lifts (a small improvement over already-good content
  // isn't proof); cap and only include products that actually improved.
  improvements.sort((a, b) => b.lift - a.lift);
  return { hasResults: true, summary, improvements: improvements.filter((i) => i.lift > 0).slice(0, 5) };
}
