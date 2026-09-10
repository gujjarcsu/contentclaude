/**
 * Group 4.5 — standing commercial claims are content to PRESERVE, not
 * decoration to drop.
 *
 * ── What happened ──────────────────────────────────────────────────────────
 *
 * Observed on the Review screen of a real store:
 *
 *   merchant's meta: "Buy the Agena Cistern by Lukka Bathware in White. Ships in
 *                     2 business days. Free Punchbowl pickup & price match - EBS."
 *   our proposal:    "Shop the Lukka Bathware Agena cistern — dual flush,
 *                     WaterMark certified, WELS rated. Clean square design for
 *                     modern bathrooms. Available at EBS."
 *
 * Better on keywords. Worse commercially. It deleted two-day dispatch, free
 * local pickup and price match, and replaced them with "Available at EBS."
 *
 * For an app sold on search performance, silently removing a merchant's
 * competitive claims is a CLICK-THROUGH REGRESSION presented as an improvement —
 * and the merchant only finds out from their own sales.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * A phrase that recurs across many of a shop's descriptions is a PROMISE, not
 * prose. Shipping terms, price guarantees, certifications, warranty, provenance,
 * trade terms, returns. Carry them through every rewrite; and when a rewrite
 * drops something the merchant had, say what was DROPPED, not only what was
 * added.
 *
 * ── Pure ───────────────────────────────────────────────────────────────────
 *
 * No Prisma, no Shopify, no model. Takes text in and gives findings out, so the
 * gate, the prompt builder and the diff view can all use the same definition —
 * three places that would otherwise each invent their own.
 */

/**
 * The shapes a standing commercial claim takes.
 *
 * Each entry is `[kind, pattern]`. These are deliberately about COMMITMENTS a
 * merchant makes, not adjectives: "premium quality" is prose and may be
 * rewritten freely; "ships in 2 business days" is a promise and may not.
 *
 * Compliance claims are in here too, and they are the reason this errs toward
 * over-detection: dropping "WaterMark certified" or "installation by a licensed
 * plumber is required by law" from a plumbing product is not a style choice.
 */
export const CLAIM_PATTERNS = Object.freeze([
  ["shipping", /\b(ships?|dispatch(?:ed|es)?|delivery|delivered)\s+(?:in|within|next|same)\s+[\w\s]{1,20}(?:day|days|hours|hrs)\b/i],
  ["shipping", /\b(free|flat[- ]rate|express|overnight)\s+(shipping|delivery|postage|freight)\b/i],
  ["pickup", /\b(free\s+)?(local\s+)?(click\s*(and|&)\s*collect|pick[- ]?up|collection)\b/i],
  ["price", /\bprice\s*(match|beat|guarantee|promise)\b/i],
  ["price", /\b(lowest|best)\s+price\s+(guarantee|promise|guaranteed)\b/i],
  ["warranty", /\b(\d+\s*[- ]?\s*(year|yr|month)s?\s+(warranty|guarantee)|lifetime\s+(warranty|guarantee))\b/i],
  ["returns", /\b(\d+\s*[- ]?\s*day\s+)?(returns?|money[- ]back|refund)\s*(policy|guarantee|guaranteed)?\b/i],
  ["certification", /\b(watermark|wels|iso|as\/nzs|astm|ce\s+marked|ul\s+listed|saa|energy\s+star)\b[\w\s/]{0,20}(certified|rated|approved|compliant|listed)?/i],
  ["compliance", /\b(complies?\s+with|compliant\s+with|meets?\s+(the\s+)?(standard|requirement))\b/i],
  ["compliance", /\b(required\s+by\s+law|licensed\s+(plumber|electrician|installer))\b/i],
  ["provenance", /\b(made|manufactured|assembled|designed)\s+in\s+[A-Z][a-z]+/],
  ["provenance", /\b(australian|british|italian|german|japanese|american)\s+(made|owned|designed)\b/i],
  ["trade", /\b(trade\s+(price|pricing|account|counter|discount)|wholesale\s+(price|pricing|account))\b/i],
  ["stock", /\b(in\s+stock|ex\s+stock|stocked\s+locally)\b/i],
]);

/** Strip markup and collapse whitespace. Pure. */
export function plain(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into sentence-ish units, which is the granularity a claim lives at. */
export function sentences(text) {
  return plain(text)
    .split(/(?<=[.!?])\s+|\s*[|•·]\s*/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/**
 * The claims a single piece of copy makes.
 *
 * Returns `[{ kind, text }]` where `text` is the sentence carrying the claim, so
 * a caller can quote the merchant's own words back rather than a category name.
 *
 * @param {string} text
 */
export function claimsIn(text) {
  const found = [];
  for (const s of sentences(text)) {
    // EVERY kind the sentence carries, not just the first. An earlier version
    // stopped at the first match, and a good rewrite that packed shipping,
    // pickup and price match into ONE sentence was then reported as having
    // dropped two of them — a gate crying wolf about copy that kept every
    // promise. Caught by running it against the real before/after pair.
    const kinds = new Set();
    for (const [kind, re] of CLAIM_PATTERNS) {
      if (re.test(s)) kinds.add(kind);
    }
    for (const kind of kinds) found.push({ kind, text: s });
  }
  return found;
}

/** Normalised form used to decide whether a claim survived a rewrite. */
export function claimKey(claim) {
  return `${claim.kind}:${plain(claim.text).toLowerCase().replace(/[^a-z0-9 ]/g, "")}`;
}

/**
 * Claims present in the merchant's copy and MISSING from ours.
 *
 * The comparison is by KIND, not by exact sentence: a rewrite that says
 * "dispatched within two business days" instead of "ships in 2 business days"
 * has kept the promise, and failing it would make the gate useless. Losing the
 * only shipping claim entirely is what this catches.
 *
 * @param {string} before  the merchant's existing copy
 * @param {string} after   what we propose to replace it with
 * @returns {Array<{kind: string, text: string}>}
 */
export function droppedClaims(before, after) {
  const had = claimsIn(before);
  if (had.length === 0) return [];
  const keptKinds = new Set(claimsIn(after).map((c) => c.kind));

  const seen = new Set();
  const dropped = [];
  for (const c of had) {
    if (keptKinds.has(c.kind) || seen.has(c.kind)) continue;
    seen.add(c.kind);
    dropped.push(c);
  }
  return dropped;
}

/**
 * A phrase that recurs across MANY of a shop's descriptions is a promise the
 * shop makes, not prose about one product.
 *
 * This is how the app learns a merchant's standing claims without being told:
 * "Free Punchbowl pickup & price match" appearing on hundreds of products is a
 * policy. Something appearing once is a sentence about that product.
 *
 * @param {string[]} descriptions
 * @param {{minShare?: number, minCount?: number}} [opts]
 *   minShare — the fraction of descriptions a phrase must appear in (0.2 = 20%)
 *   minCount — and an absolute floor, so three products cannot establish a policy
 * @returns {Array<{text: string, count: number, share: number, kind: string|null}>}
 */
export function recurringClaims(descriptions, { minShare = 0.2, minCount = 3 } = {}) {
  const list = (descriptions ?? []).map(plain).filter(Boolean);
  if (list.length < minCount) return [];

  const counts = new Map();
  for (const text of list) {
    // A sentence counts once per description, however often it repeats in it.
    for (const s of new Set(sentences(text).map((x) => x.toLowerCase()))) {
      if (s.length < 12) continue; // too short to be a policy
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }

  const out = [];
  for (const [s, count] of counts) {
    const share = count / list.length;
    if (count < minCount || share < minShare) continue;
    const hit = CLAIM_PATTERNS.find(([, re]) => re.test(s));
    out.push({ text: s, count, share, kind: hit ? hit[0] : null });
  }
  // Recognised commercial claims first, then by how widely they recur.
  return out.sort((a, b) => (b.kind ? 1 : 0) - (a.kind ? 1 : 0) || b.count - a.count).slice(0, 12);
}

/** One sentence a merchant can act on. Pure. Null when nothing was dropped. */
export function describeDropped(dropped) {
  if (!dropped?.length) return null;
  const first = dropped[0];
  const more = dropped.length - 1;
  const tail = more > 0 ? ` (and ${more} other claim${more === 1 ? "" : "s"})` : "";
  return `This removes something your own description promised: "${first.text}"${tail}`;
}
