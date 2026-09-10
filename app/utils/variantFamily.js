/**
 * Group 5 — variant families, and why the duplicate gate would have refused
 * legitimate catalogues.
 *
 * ── The failure ────────────────────────────────────────────────────────────
 *
 * A plumbing merchant sells one pull-out hose as SEVEN products, one per finish:
 * base, Brushed Copper, Brushed Gold, Brushed Stainless Steel, Chrome, Gunmetal,
 * Matte Black. That is correct merchandising — a shopper searches for the finish
 * — and their existing descriptions are byte-identical apart from the finish
 * word.
 *
 * SimHash step one removes the product's OWN words (title, vendor, type), which
 * is the step that makes the fingerprint product-agnostic and is load-bearing.
 * But the finish lives in the title. Strip it, and all seven collapse to one
 * fingerprint at Hamming distance 0: a HARD FAIL on every one of them.
 *
 * This is not niche. Finishes, sizes, lengths, capacities, colours, voltages,
 * thread gauges, multipacks — any hardware, plumbing, electrical, apparel,
 * fastener or building-supply catalogue is mostly families. It would have
 * shipped invisibly and reached merchants as "the app won't write my tapware."
 *
 * ── The fix is a different question, not a different threshold ─────────────
 *
 * Raising the threshold breaks the template detection that works. Instead:
 *
 *   ACROSS families — the duplicate check stands exactly as built.
 *   WITHIN a family — near-identical copy is EXPECTED, so the duplicate check
 *     does not run at all. What runs instead is DIFFERENTIATION: does this copy
 *     name the attribute that distinguishes it from its siblings? A Brushed Gold
 *     description that never says "brushed gold" is the real defect, and the one
 *     an SEO specialist actually cares about.
 *
 * ── Pure, and why that matters here ────────────────────────────────────────
 *
 * No Prisma, no Shopify. The comparison window stores only a product id, a
 * fingerprint and a title, so family detection has to work from a TITLE ALONE —
 * which is exactly what `familyKeyOf` is built to do. Tags and options sharpen
 * it when the caller has them.
 */

/**
 * Tag namespaces merchants actually use for variant axes. Seen in the wild as
 * `colour:chrome`, `colour_group:black`, `size:600mm`.
 */
const AXIS_TAG_PREFIXES = [
  "colour",
  "color",
  "colour_group",
  "color_group",
  "size",
  "finish",
  "length",
  "width",
  "height",
  "depth",
  "diameter",
  "capacity",
  "voltage",
  "wattage",
  "material",
  "gauge",
  "pack",
  "variant",
];

/**
 * Attribute words common enough across catalogues to strip from a title stem
 * without a tag to confirm them.
 *
 * Deliberately conservative. Every word here is one that two DIFFERENT products
 * could be distinguished by, so a word wrongly on this list merges two families
 * that should be separate and silently disables the duplicate check between
 * them. Finishes and colours qualify; "pro", "premium" and "deluxe" do not,
 * because those distinguish genuinely different products.
 */
const ATTRIBUTE_WORDS = new Set([
  "black",
  "white",
  "chrome",
  "brushed",
  "matte",
  "matt",
  "gloss",
  "satin",
  "polished",
  "copper",
  "gold",
  "silver",
  "bronze",
  "brass",
  "nickel",
  "gunmetal",
  "graphite",
  "champagne",
  "stainless",
  "steel",
  "galvanised",
  "galvanized",
  "grey",
  "gray",
  "beige",
  "cream",
  "ivory",
  "navy",
  "charcoal",
  "rose",
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "orange",
  "brown",
  "clear",
  "left",
  "right",
  "small",
  "medium",
  "large",
  "xl",
  "xxl",
]);

/** A measurement: 600mm, 1.5m, 12v, 3kg, 500ml, 10pk. */
const MEASUREMENT = /^\d+(?:[.,]\d+)?(?:mm|cm|m|km|ml|l|kg|g|mg|v|w|kw|a|ah|pk|pack|inch|in|ft|deg|k)$/i;

const words = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * The variant values that identify THIS product within its family.
 *
 * Drawn from whatever the caller has: Shopify product options, variant-axis
 * tags, and the title's own attribute words. Returns lowercase terms.
 *
 * @param {{title?: string, tags?: string[], options?: Array<{name?: string, values?: string[]}>}} product
 * @returns {Set<string>}
 */
export function axisTermsFor(product = {}) {
  const terms = new Set();

  for (const opt of product.options ?? []) {
    for (const v of opt?.values ?? []) {
      for (const w of words(v)) if (w.length > 1) terms.add(w);
    }
  }

  for (const tag of product.tags ?? []) {
    const raw = String(tag ?? "");
    const idx = raw.indexOf(":");
    if (idx <= 0) continue;
    const ns = raw.slice(0, idx).trim().toLowerCase();
    if (!AXIS_TAG_PREFIXES.includes(ns)) continue;
    for (const w of words(raw.slice(idx + 1).replace(/-/g, " "))) if (w.length > 1) terms.add(w);
  }

  // The title's own attribute words, so a shop with no tags at all still gets a
  // family. This is the case the comparison window is always in.
  for (const w of words(product.title)) {
    if (ATTRIBUTE_WORDS.has(w) || MEASUREMENT.test(w)) terms.add(w);
  }

  return terms;
}

/**
 * The family a product belongs to: its title with the variant axis removed.
 *
 * Two products share a family when they share this key. Returns "" for a title
 * that is entirely attribute words, which cannot identify a family and must
 * never match another empty one.
 *
 * @param {{title?: string, tags?: string[], options?: Array}} product
 * @returns {string}
 */
export function familyKeyOf(product = {}) {
  const axis = axisTermsFor(product);
  const stem = words(product.title).filter((w) => !axis.has(w) && !MEASUREMENT.test(w) && !ATTRIBUTE_WORDS.has(w));
  // A stem of one word is not a family, it is a coincidence — "Hose" would put
  // every hose in the catalogue in one family and disable the duplicate check
  // across genuinely different products.
  return stem.length >= 2 ? stem.join(" ") : "";
}

/**
 * Are these two products siblings? Empty keys never match, including each other.
 */
export function sameFamily(a, b) {
  const ka = typeof a === "string" ? a : familyKeyOf(a);
  const kb = typeof b === "string" ? b : familyKeyOf(b);
  return !!ka && !!kb && ka === kb;
}

/**
 * Does this copy name what distinguishes the product from its siblings?
 *
 * This is the check that REPLACES the duplicate check inside a family, and it is
 * the one that matters for search: a Brushed Gold product whose description
 * never says "brushed gold" cannot rank for "brushed gold", however unique its
 * fingerprint is.
 *
 * Returns `{ checked: false }` when there is no axis to name — a product with no
 * detectable variant attribute is not failed for omitting one, the same way the
 * language rule declines to judge a locale it cannot assess.
 *
 * @param {string} text        the generated description (plain or HTML)
 * @param {Set<string>|string[]} axisTerms
 */
export function namesItsAttribute(text, axisTerms) {
  const terms = [...(axisTerms ?? [])].map(String).filter((t) => t.length > 1);
  if (terms.length === 0) return { checked: false, ok: true, named: [], missing: [] };

  const haystack = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase();
  const named = terms.filter((t) => haystack.includes(t.toLowerCase()));

  return {
    checked: true,
    named,
    missing: terms.filter((t) => !named.includes(t)),
    // Naming ANY axis term is enough. "brushed gold" satisfies both "brushed"
    // and "gold", and requiring every term would fail copy that reads perfectly
    // well — a gate that fails good writing is a gate that gets switched off.
    ok: named.length > 0,
  };
}
