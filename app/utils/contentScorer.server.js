// Content quality scorer — server-only

const FILLER_OPENERS = /^\s*<?\s*(whether you|say goodbye|introducing|are you tired|in (a|the) world of|look no further)/i;

/**
 * Score a set of generated content fields (0-100).
 * Returns { score, grade, issues[] }.
 */
export function scoreContent({ description = "", metaTitle = "", metaDescription = "", faq = "" }) {
  let score = 0;
  const issues = [];

  // ── Description (50 pts) ────────────────────────────────────────────────────
  if (description) {
    const plainText = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const words = plainText.split(/\s+/).filter(Boolean);

    if (words.length >= 150) score += 20;
    else if (words.length >= 80) score += 12;
    else if (words.length >= 40) score += 6;
    else issues.push("Description is very short (under 40 words)");

    if (/<(ul|ol|li|strong|em|h[2-6])\b/i.test(description)) score += 15;
    else issues.push("Description lacks HTML structure (no lists or emphasis)");

    if (!FILLER_OPENERS.test(plainText)) score += 15;
    else issues.push("Description starts with a generic opener");
  } else {
    issues.push("Missing product description");
  }

  // ── Meta title (20 pts) ────────────────────────────────────────────────────
  if (metaTitle) {
    score += 10;
    if (metaTitle.length <= 60) score += 10;
    else issues.push(`Meta title is ${metaTitle.length} chars — keep under 60`);
  } else {
    issues.push("Missing meta title");
  }

  // ── Meta description (20 pts) ──────────────────────────────────────────────
  if (metaDescription) {
    score += 10;
    if (metaDescription.length <= 155) score += 10;
    else issues.push(`Meta description is ${metaDescription.length} chars — keep under 155`);
  } else {
    issues.push("Missing meta description");
  }

  // ── FAQ (10 pts) ───────────────────────────────────────────────────────────
  if (faq && faq.trim().length > 50) score += 10;
  else issues.push("FAQ content missing or too short");

  const grade =
    score >= 90 ? "Excellent" :
    score >= 75 ? "Good" :
    score >= 55 ? "Fair" : "Poor";

  return { score, grade, issues };
}
