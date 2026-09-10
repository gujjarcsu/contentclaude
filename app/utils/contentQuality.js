/**
 * Phase 4 item 4.1 — the quality gate. Nothing is saved before this runs.
 *
 * The scorer already existed and produced a number. A number is not a gate: it
 * was computed, stored, and never used to stop anything. This is the part that
 * refuses.
 *
 * Everything here is PURE — no database, no Shopify — so the rules can be
 * tested exhaustively and so the gate can run in the worker, in a route action
 * and in a component without three copies of the rules. (See productState.js
 * for what happens when a shared rule is not importable.)
 *
 * ── The duplicate check, which is the hard one ─────────────────────────────
 *
 * This is the rule most likely to be quietly skipped, and it is the one that
 * stops the app producing five hundred near-identical descriptions — exactly
 * what a merchant leaves a one-star review about.
 *
 * The naive version does not work. Exact hashing catches nothing, because two
 * descriptions always differ by at least the product name. Comparing every new
 * description against every previous one is O(N²) — 12.5 million comparisons on
 * a 5,000-product run.
 *
 * So: **SimHash over product-agnostic shingles.**
 *
 *   1. Normalise the text, then REMOVE the product's own words (its title,
 *      vendor and type). This is the load-bearing step. Two descriptions of
 *      different products written from the same template differ mainly by those
 *      words; strip them and genuine template-duplication collapses to an
 *      identical fingerprint, while two genuinely different descriptions stay
 *      far apart. Without it the check would flag nothing, because every
 *      description contains its own product name.
 *   2. Take overlapping 3-word shingles and hash each to 64 bits.
 *   3. Sum the bits with weights and take the sign — a 64-bit fingerprint where
 *      near-identical text differs in only a few bit positions.
 *   4. Compare by Hamming distance against a BOUNDED set of recent
 *      fingerprints. 16 bytes per stored description, not the description.
 *
 * The threshold is deliberately loose. Products in one shop SHOULD share a
 * brand voice, and a gate that fires on shared tone would block every honest
 * description. It fires on text that is the same text.
 *
 * Where this is weaker than it looks, stated plainly: SimHash is a heuristic.
 * It will not catch a description that has been paraphrased throughout, and it
 * compares against a bounded window of recent descriptions rather than the
 * whole catalogue. It catches the failure that actually happens — a run
 * emitting the same paragraphs over and over — and it is not a plagiarism
 * detector.
 */

/** Below this, content is not saved as a clean draft. Out of 100. */
export const QUALITY_THRESHOLD = 60;
/** Hamming distance at or under this, out of 64 bits, is "the same text". */
/**
 * Group 5.4 — TWO numbers, because the two failures deserve different treatment.
 *
 * Measured on this codebase's own fixtures: verbatim template reuse with the
 * name swapped scores 0; the same template with one phrase reworded scores 11;
 * a genuinely different product in the same brand voice scores 26.
 *
 * A single threshold cannot serve those. At 6 the paraphrase passes silently; at
 * 14 it is caught but the false-positive margin against 26 narrows badly, and a
 * gate that blocks honest content is a gate the merchant switches off.
 *
 *   HARD FAIL 0-6   verbatim reuse. Regenerate once, keep the better, save with
 *                   a note if it still fails. Autopilot never publishes it.
 *   WARN      7-16  paraphrase territory. The draft SAVES and can be published
 *                   manually, so it can never be the reason the gate is turned
 *                   off — but it carries a note naming what it resembles, and
 *                   AUTOPILOT DOES NOT PUBLISH IT. Autopilot is the only path
 *                   where nobody is reading, and the only one where near
 *                   duplicate content reaches a live storefront unseen.
 *   PASS      >16   untouched.
 *
 * This matters more here than in a general content app: this IS an SEO app, and
 * near-duplicate product descriptions are precisely what Google treats as thin
 * content. Shipping a merchant 500 paraphrased-identical descriptions would be
 * us causing the harm we were hired to prevent.
 */
export const DUPLICATE_MAX_DISTANCE = 6;
export const DUPLICATE_WARN_DISTANCE = 16;

/** What the duplicate check concluded. */
export const DUPLICATE_VERDICT = Object.freeze({
  FAIL: "fail",
  WARN: "warn",
  PASS: "pass",
});
/** How many recent fingerprints a new description is compared against. */
export const DUPLICATE_WINDOW = 200;

/** Shopify truncates beyond these; Google shows less. Hard limits, not advice. */
export const META_TITLE_MAX = 70;
export const META_DESCRIPTION_MAX = 160;
export const META_TITLE_MIN = 15;
export const META_DESCRIPTION_MIN = 70;

import { familyKeyOf, axisTermsFor, namesItsAttribute } from "./variantFamily.js";

/** Text a model leaves behind when it has not actually written anything. */
const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /\[(product|insert|your|brand|name|todo|tbd)[^\]]*\]/i,
  /\{\{[^}]+\}\}/,
  /\bTODO\b|\bTBD\b|\bFIXME\b/,
  /\b(insert|add) (your |the )?(product |brand )?(name|description|details) here\b/i,
  /\bas an ai\b|\bi'm sorry, (but )?i\b|\bi cannot\b|\bas a language model\b/i,
  /\bxxx+\b|\bplaceholder\b|\bsample text\b/i,
];

/** Words common enough that their absence from English prose is a real signal. */
const EN_STOPWORDS = [
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "this",
  "that",
  "from",
  "are",
  "our",
  "its",
  "it",
  "a",
  "to",
  "of",
  "in",
  "on",
  "is",
];

export function plainText(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// ── SimHash ────────────────────────────────────────────────────────────────

/** 64-bit FNV-1a, as a BigInt. Pure. */
function hash64(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < str.length; i += 1) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h;
}

/**
 * The words of a description with the product's OWN words removed.
 *
 * The load-bearing step. Without it every fingerprint is dominated by the
 * product name and no two descriptions ever look alike, so the check would
 * silently pass everything — the exact failure mode worth avoiding here.
 * Pure.
 */
export function productAgnosticTokens(text, product = {}) {
  const own = new Set(
    [product.title, product.vendor, product.productType]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
  return plainText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !own.has(w) && !/^\d+$/.test(w));
}

/**
 * A 64-bit SimHash of the product-agnostic text, as a hex string.
 * Returns null for text too short to fingerprint meaningfully. Pure.
 */
export function simhash(text, product = {}) {
  const words = productAgnosticTokens(text, product);
  if (words.length < 12) return null; // too short to say anything about

  const shingles = [];
  for (let i = 0; i + 2 < words.length; i += 1) shingles.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  if (shingles.length === 0) return null;

  const bits = new Array(64).fill(0);
  for (const s of shingles) {
    const h = hash64(s);
    for (let b = 0; b < 64; b += 1) {
      bits[b] += (h >> BigInt(b)) & 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let b = 0; b < 64; b += 1) if (bits[b] > 0) out |= 1n << BigInt(b);
  return out.toString(16).padStart(16, "0");
}

/** Bits that differ between two hex fingerprints. 64 when either is missing. Pure. */
export function hammingDistance(a, b) {
  if (!a || !b) return 64;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    x &= x - 1n;
    n += 1;
  }
  return n;
}

/**
 * Is this description effectively the same text as one we already wrote?
 * @param {string|null} fingerprint
 * @param {Array<{productId?: string, simhash: string}>} recent
 * @returns {{duplicate: boolean, of?: string, distance?: number}}
 */
export function findDuplicate(fingerprint, recent = [], { familyKey = "" } = {}) {
  if (!fingerprint) return { duplicate: false, verdict: DUPLICATE_VERDICT.PASS, skippedFamily: 0 };

  let best = null;
  let skippedFamily = 0;

  for (const r of recent) {
    if (!r?.simhash) continue;

    // Group 5.3 — SIBLINGS ARE NOT COMPARED AT ALL.
    //
    // A merchant selling one hose in seven finishes has seven products whose
    // descriptions are byte-identical apart from the finish word — correct
    // merchandising. SimHash strips the product's own words, so the finish (which
    // lives in the title) disappears and all seven collapse to distance 0: a hard
    // fail on a legitimate catalogue. Within a family, near-identical copy is
    // EXPECTED, so the question is not "is this a duplicate" but "does it name
    // what makes it different" — which `namesItsAttribute` answers separately.
    if (familyKey && r.familyKey && r.familyKey === familyKey) {
      skippedFamily += 1;
      continue;
    }

    const d = hammingDistance(fingerprint, r.simhash);
    if (best === null || d < best.distance) best = { of: r.productId ?? null, distance: d };
  }

  if (best && best.distance <= DUPLICATE_MAX_DISTANCE) {
    return { duplicate: true, verdict: DUPLICATE_VERDICT.FAIL, skippedFamily, ...best };
  }
  if (best && best.distance <= DUPLICATE_WARN_DISTANCE) {
    // Saves, but never auto-publishes. `duplicate` stays FALSE so this does not
    // land in hardFailures and block the draft.
    return { duplicate: false, verdict: DUPLICATE_VERDICT.WARN, skippedFamily, ...best };
  }
  return { duplicate: false, verdict: DUPLICATE_VERDICT.PASS, skippedFamily, ...(best ?? {}) };
}

// ── The hard rules ─────────────────────────────────────────────────────────

/** Links that leave the merchant's own storefront. Pure. */
export function externalLinks(html, shopDomain = "") {
  const text = String(html ?? "");
  const urls = [...text.matchAll(/https?:\/\/([^\s"'<>)]+)/gi)].map((m) => m[1].toLowerCase());
  const own = String(shopDomain || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const ownRoots = new Set([own, own.replace(/\.myshopify\.com$/, "")].filter(Boolean));
  return urls.filter((u) => {
    const host = u.split("/")[0];
    if (!host) return false;
    for (const root of ownRoots) if (root && (host === root || host.endsWith(`.${root}`))) return false;
    return true;
  });
}

/** Placeholder or refusal text a model left behind. Pure. */
export function placeholdersIn(text) {
  const t = plainText(text);
  return PLACEHOLDER_PATTERNS.filter((re) => re.test(t)).map((re) => String(re));
}

/**
 * Does the text look like the shop's language? Pure.
 *
 * Only enforced for English locales, using stopword frequency. For any other
 * locale this returns `{ checked: false }` and the gate does not judge it —
 * shipping a check that cannot actually tell French from Spanish, and failing
 * merchants on it, would be worse than admitting the limit.
 */
export function languageLooksRight(text, locale = "en") {
  const loc = String(locale || "en").toLowerCase();
  if (!loc.startsWith("en")) return { checked: false, ok: true };
  const words = plainText(text)
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean);
  if (words.length < 20) return { checked: false, ok: true };
  const hits = words.filter((w) => EN_STOPWORDS.includes(w)).length;
  // English prose runs 20-40% stopwords. Under 5% is not English.
  return { checked: true, ok: hits / words.length >= 0.05, ratio: hits / words.length };
}

/**
 * Run every rule. Pure.
 *
 * @returns {{pass: boolean, score: number, reasons: string[], hardFailures: string[],
 *   duplicateOf: string|null, languageChecked: boolean}}
 */
export function assessContent({
  description = "",
  metaTitle = "",
  metaDescription = "",
  faq = "",
  product = {},
  shopDomain = "",
  locale = "en",
  recent = [],
  score = null,
  fingerprint = undefined,
} = {}) {
  // Group 5 — computed once here from whatever the caller knows about the
  // product (title always; tags and options when it has them).
  const familyKey = familyKeyOf(product);
  const axisTerms = axisTermsFor(product);
  const reasons = [];
  const hardFailures = [];

  // ── meta lengths ─────────────────────────────────────────────────────────
  if (metaTitle && metaTitle.length > META_TITLE_MAX) {
    hardFailures.push(
      `The page title is ${metaTitle.length} characters — Shopify will cut it at ${META_TITLE_MAX}.`,
    );
  }
  if (metaTitle && metaTitle.trim().length < META_TITLE_MIN) {
    hardFailures.push("The page title is too short to be useful in search results.");
  }
  if (metaDescription && metaDescription.length > META_DESCRIPTION_MAX) {
    hardFailures.push(
      `The search description is ${metaDescription.length} characters — search engines will cut it at ${META_DESCRIPTION_MAX}.`,
    );
  }
  if (metaDescription && metaDescription.trim().length < META_DESCRIPTION_MIN) {
    hardFailures.push("The search description is too short to say anything useful.");
  }

  // ── links off the merchant's own storefront ──────────────────────────────
  const external = externalLinks(`${description} ${faq}`, shopDomain);
  if (external.length > 0) {
    hardFailures.push(`It links to ${external[0].split("/")[0]}, which is not your store.`);
  }

  // ── placeholder / refusal text ───────────────────────────────────────────
  if (placeholdersIn(`${description} ${metaTitle} ${metaDescription} ${faq}`).length > 0) {
    hardFailures.push("It contains placeholder text rather than real copy.");
  }

  // ── language ─────────────────────────────────────────────────────────────
  const lang = languageLooksRight(description, locale);
  if (lang.checked && !lang.ok) {
    hardFailures.push("It does not read as English, which is your store's language.");
  }

  // ── duplicate ────────────────────────────────────────────────────────────
  const fp = fingerprint === undefined ? simhash(description, product) : fingerprint;
  const dup = findDuplicate(fp, recent, { familyKey });
  if (dup.duplicate) {
    hardFailures.push("It is almost the same as a description already written for another product.");
  } else if (dup.verdict === DUPLICATE_VERDICT.WARN) {
    // A WARN does not block the draft — that is the point of the band. It is a
    // reason the merchant should read before publishing, and a hard stop for
    // autopilot, which publishes with nobody looking.
    reasons.push("It closely resembles a description already written for another product.");
  }

  // ── does it name what makes it different from its siblings? ─────────────
  // Inside a family this REPLACES the duplicate check. A Brushed Gold product
  // whose description never says "brushed gold" cannot rank for it, however
  // unique its fingerprint is — and that is the defect an SEO specialist cares
  // about. Only asked when the product HAS siblings in the window: a lone
  // product is not failed for omitting an attribute nothing contrasts it with.
  const hasSiblings = dup.skippedFamily > 0;
  const diff = hasSiblings ? namesItsAttribute(description, axisTerms) : { checked: false, ok: true };
  if (diff.checked && !diff.ok) {
    reasons.push(
      `It never mentions ${diff.missing.slice(0, 2).join(" or ")}, which is what makes this product different from the others in its range.`,
    );
  }

  // ── the score ────────────────────────────────────────────────────────────
  const numericScore = Number.isFinite(score) ? score : null;
  if (numericScore != null && numericScore < QUALITY_THRESHOLD) {
    reasons.push(`Quality score ${numericScore} is below ${QUALITY_THRESHOLD}.`);
  }

  return {
    pass: hardFailures.length === 0 && (numericScore == null || numericScore >= QUALITY_THRESHOLD),
    score: numericScore,
    fingerprint: fp,
    reasons: [...hardFailures, ...reasons],
    hardFailures,
    duplicateOf: dup.of ?? null,
    duplicateDistance: Number.isFinite(dup.distance) ? dup.distance : null,
    duplicateVerdict: dup.verdict,
    /** Group 5.4 — saves, but autopilot must not publish it. */
    warnOnly: dup.verdict === DUPLICATE_VERDICT.WARN,
    familyKey,
    familySiblingsSkipped: dup.skippedFamily ?? 0,
    differentiationChecked: !!diff.checked,
    differentiationOk: diff.ok !== false,
    languageChecked: lang.checked,
  };
}

/**
 * One sentence a merchant can act on, from an assessment. Pure.
 *
 * Group 5.4 — this used to return null for anything that PASSED, which was fine
 * when passing meant "nothing to say". The WARN band changed that: a draft in
 * 7-16 passes deliberately (it saves, and the merchant can publish it) but there
 * IS something to say about it, and saying it is the whole point of the band.
 *
 * So the test is now "are there reasons", not "did it fail". A failing
 * assessment always has reasons, so nothing about the old behaviour moved.
 */
export function describeAssessment(assessment) {
  if (!assessment || !assessment.reasons?.length) return null;
  const first = assessment.reasons[0];
  const more = assessment.reasons.length - 1;
  return more > 0 ? `${first} (and ${more} other issue${more === 1 ? "" : "s"})` : first;
}
