// SEO utility functions — server-only

/**
 * Parse FAQ text (Q: / A: format) into an array of question/answer pairs.
 */
export function parseFaqPairs(faqText) {
  if (!faqText) return [];
  const pairs = [];
  // Split on lines that start a new Q:
  const blocks = faqText.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const qLine = lines.find((l) => /^Q:/i.test(l));
    const aLines = lines.filter((l) => /^A:/i.test(l));
    if (!qLine || aLines.length === 0) continue;
    const question = qLine.replace(/^Q:\s*/i, "").trim();
    const answer = aLines.map((l) => l.replace(/^A:\s*/i, "")).join(" ").trim();
    if (question && answer) pairs.push({ question, answer });
  }
  return pairs;
}

/**
 * Convert FAQ text to a JSON-LD FAQPage schema object.
 * Returns null when no valid Q&A pairs are found.
 */
export function faqToJsonLd(faqText) {
  const pairs = parseFaqPairs(faqText);
  if (pairs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

/**
 * Calculate SEO completeness score (0-100) for a Shopify product object.
 * product shape: { description, seoTitle, seoDescription, images: [{ altText }] }
 */
export function calculateSeoScore(product) {
  const hasImages = !!(product.images && product.images.length > 0);
  // hasAltText is only meaningful when images exist; if there are no images it
  // is "not applicable" rather than a separate failure.
  const hasAltText = hasImages
    ? !!(product.images.some((img) => img.altText && img.altText.trim()))
    : false; // no images → no alt text possible; scored once via hasImages

  const checks = {
    hasDescription: !!(product.description && product.description.trim().length >= 50),
    hasMetaTitle:   !!(product.seoTitle && product.seoTitle.trim().length > 0),
    hasMetaDesc:    !!(product.seoDescription && product.seoDescription.trim().length > 0),
    hasImages,
    hasAltText,
    // Distinguish cause for the "Issues Found" label:
    // noImages = product has no images at all (alt text not applicable)
    // missingAltText = has images but none have alt text
    noImages:        !hasImages,
    missingAltText:  hasImages && !hasAltText,
  };
  const score =
    (checks.hasDescription ? 30 : 0) +
    (checks.hasMetaTitle   ? 25 : 0) +
    (checks.hasMetaDesc    ? 25 : 0) +
    (checks.hasImages      ? 10 : 0) +
    (checks.hasAltText     ? 10 : 0);
  return { score, checks };
}

/**
 * Detect product type from type string or title and return a custom prompt instruction.
 */
export function getProductTypeInstructions(productType, title) {
  const lower = ((productType || "") + " " + (title || "")).toLowerCase();
  if (/gift\s*card|gift\s*cert/.test(lower)) {
    return "This is a GIFT CARD. Keep the description SHORT (80-120 words). Focus on gifting occasions, flexibility, and ease of use. Do NOT describe physical attributes.";
  }
  if (/subscription|membership/.test(lower)) {
    return "This is a SUBSCRIPTION/MEMBERSHIP product. Focus on ongoing value, what's included, and frequency. Mention flexibility and cancellation ease.";
  }
  if (/bundle|kit\b|\bset\b/.test(lower)) {
    return "This is a BUNDLE/SET. List what's included. Emphasise the value compared to buying individually. Describe how the items work together.";
  }
  if (/digital|download|ebook|e-book/.test(lower)) {
    return "This is a DIGITAL product. Focus on what the buyer receives, format, and instant delivery. No shipping or physical attributes.";
  }
  return "";
}

const LANGUAGE_NAMES = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Chinese",
  ko: "Korean", ar: "Arabic", hi: "Hindi", nl: "Dutch",
};

export function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || "English";
}
