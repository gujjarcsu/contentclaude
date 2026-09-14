/**
 * P2.6 — bulk remediation, with review. The pure half.
 *
 * "Finding without fixing is a lead magnet." The daily walk (P2.2) names
 * what each surface asks for and a product lacks; this turns the findings
 * that CAN be fixed from inside the app into a reviewed, bulk action, and
 * says plainly which cannot and why.
 *
 * ── What is fixable here, and what it costs ────────────────────────────────
 *
 *   alt text       generated, 0 credits (B1 — free per credit, capped per
 *                  product), reviewed on the Review page before publish
 *   descriptions   generated, 1 credit each, same review
 *   brand/vendor   one name applied to the products the merchant ticks — no
 *                  AI, 0 credits; verified in Shopify's reply
 *   option names   "Title" → Size / Colour / … inferred from the option's
 *                  values, editable per row, applied with productOptionUpdate
 *   barcodes       typed by the merchant per single-variant product, or the
 *                  product marked own-brand/handmade so the finding stops.
 *                  We never invent a GTIN.
 *
 * ── What is NOT fixable here, stated ───────────────────────────────────────
 *
 * Verified against the Admin schema 2026-09-14: publishing to the Online
 * Store channel needs write_publications; a URL redirect needs
 * write_online_store_navigation; reading shop policies needs
 * read_legal_policies. This app requests write_products and write_content
 * and nothing else, and a scope change is the owner's decision, not a
 * side-effect of a feature. Availability is supplied by Shopify itself.
 *
 * ── The lock ───────────────────────────────────────────────────────────────
 *
 * REMEDIATION_LOCKED_SHOPS (comma-separated shop domains, set by the owner
 * as a secret) names stores that are monitored but never written to from
 * here. Every write path checks it first and refuses with a plain reason.
 *
 * PURE. No I/O.
 */

export const FIX = Object.freeze({
  ALT_TEXT: "alt_text",
  DESCRIPTION: "description",
  VENDOR: "vendor",
  OPTION_NAME: "option_name",
  GTIN_EXEMPT: "gtin_exempt",
  BARCODE: "barcode",
});

/** What each fix is, what it costs, and how it is done. Merchant-facing. */
export const FIX_LABEL = Object.freeze({
  [FIX.ALT_TEXT]: {
    title: "Write alt text",
    credits: 0,
    contentType: "altText",
    how: "Generated from each image and its product, then waits on the Review page. Nothing is published until you approve it. Alt text costs no credits.",
  },
  [FIX.DESCRIPTION]: {
    title: "Write descriptions",
    credits: 1,
    contentType: "description",
    how: "Generated from the product's own data and your brand voice, then waits on the Review page. One credit per product; nothing is published until you approve it.",
  },
  [FIX.VENDOR]: {
    title: "Set the brand",
    credits: 0,
    how: "The OpenAI feed requires a brand and reads Shopify's vendor field. One name, applied to every product you tick, and checked in Shopify's reply. No AI, no credits.",
  },
  [FIX.OPTION_NAME]: {
    title: "Name the option",
    credits: 0,
    how: "Variants whose option is still called “Title”. We suggest a name from the values (S, M, L reads as Size; Red, Blue as Colour); you can change it per row. Applied with Shopify's option update, no credits.",
  },
  [FIX.GTIN_EXEMPT]: {
    title: "No barcode by design",
    credits: 0,
    how: "Your own brand or handmade goods have no GTIN, and the feed does not expect one. Ticking a product records that and the finding stops. Nothing is written to Shopify.",
  },
  [FIX.BARCODE]: {
    title: "Add a barcode",
    credits: 0,
    how: "For products that do have a GTIN. Type it per product; we write it to the product's variant and check Shopify's reply. We never invent one.",
  },
});

/** The fixes the brief names that this app cannot make, and exactly why. */
export const SKIPPED = Object.freeze([
  {
    what: "Availability",
    why: "Shopify supplies availability to every feed from your inventory. There is nothing to add here.",
  },
  {
    what: "Online Store channel",
    why: "Publishing a product to the Online Store needs the write_publications scope, which this app does not request. In Shopify admin, open the product and tick Online Store under Sales channels.",
  },
  {
    what: "Canonical address and redirects",
    why: "On Shopify the canonical is set by your theme, not per product. After a handle change the right fix is a URL redirect, and creating one needs write_online_store_navigation, which this app does not request. Shopify offers to create the redirect when you change a handle.",
  },
  {
    what: "Policy pages",
    why: "Reading your shop policies needs the read_legal_policies scope, which this app does not request. Settings, then Policies, in Shopify admin.",
  },
]);

const SIZE_TOKENS = new Set(["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "small", "medium", "large", "extra large", "one size", "os"]);
const SIZE_UNIT = /^\d+(\.\d+)?\s*(ml|l|cl|g|kg|mg|cm|mm|m|in|inch|inches|"|ft|oz|lb|lbs)\b/i;
const COLOUR_TOKENS = new Set([
  "red", "blue", "green", "black", "white", "grey", "gray", "navy", "pink", "purple", "orange", "yellow", "brown", "beige", "cream",
  "ivory", "silver", "gold", "bronze", "copper", "teal", "turquoise", "maroon", "burgundy", "olive", "khaki", "tan", "charcoal",
  "natural", "clear", "multi", "multicolour", "multicolor", "rose", "lilac", "lavender", "mint", "coral", "peach", "mustard",
]);
const MATERIAL_TOKENS = new Set(["cotton", "linen", "wool", "silk", "leather", "oak", "walnut", "steel", "brass", "ceramic", "glass", "bamboo", "plastic", "canvas", "denim", "velvet"]);

/**
 * A name for an option still called "Title", from its values. Null when the
 * values do not say — the merchant types one.
 * @param {string[]} values
 * @returns {"Size"|"Colour"|"Material"|null}
 */
export function inferOptionName(values) {
  const vals = (values ?? []).map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean);
  if (vals.length < 2) return null;
  const all = (pred) => vals.every(pred);
  if (all((v) => SIZE_TOKENS.has(v) || SIZE_UNIT.test(v) || /^\d+(\.\d+)?$/.test(v))) return "Size";
  if (all((v) => COLOUR_TOKENS.has(v) || v.split(/[\s/-]+/).some((w) => COLOUR_TOKENS.has(w)))) return "Colour";
  if (all((v) => MATERIAL_TOKENS.has(v))) return "Material";
  return null;
}

/** The brand to propose: the name the merchant typed into Brand Voice, else the shop's name. */
export function proposeVendor({ brandStoreName, shopName }) {
  const b = String(brandStoreName ?? "").trim();
  if (b) return b;
  const s = String(shopName ?? "").trim();
  return s || "";
}

/** REMEDIATION_LOCKED_SHOPS → a Set of lower-cased shop domains. */
export function parseLockedShops(env) {
  return new Set(
    String(env ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isLockedShop(shop, locked) {
  return locked instanceof Set && locked.has(String(shop ?? "").trim().toLowerCase());
}

/** A stored findings list with one (surface, field) removed, plus fresh counts. */
export function withoutFinding(findings, { surface, field }) {
  const kept = (Array.isArray(findings) ? findings : []).filter((f) => !((f.surface ?? null) === (surface ?? null) && f.field === field));
  const counts = { blocking: 0, degrading: 0, cosmetic: 0 };
  for (const f of kept) counts[f.grade] = (counts[f.grade] ?? 0) + 1;
  return { findings: kept, ...counts };
}

/** A valid GTIN-8/12/13/14: digits only, with a correct check digit. */
export function isValidGtin(s) {
  const d = String(s ?? "").replace(/\s+/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  // Weights 3,1,3,1… from the rightmost payload digit.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Which products each fix applies to, from ProductWatch rows with their
 * stored findings. Drafts are not listed; the walk never graded them.
 *
 * @param {Array<{productId: string, title: string, handle: string, grade: string|null,
 *   gtinExempt?: boolean, hasAlt?: boolean, statusShop?: string|null}>} rows
 * @param {(json: string|null) => Array<object>} parseFindings
 */
export function candidatesFromRows(rows, parseFindings) {
  const out = { [FIX.ALT_TEXT]: [], [FIX.DESCRIPTION]: [], [FIX.VENDOR]: [], [FIX.OPTION_NAME]: [], [FIX.GTIN_EXEMPT]: [], [FIX.BARCODE]: [] };
  for (const r of rows ?? []) {
    if (String(r?.statusShop ?? "").toUpperCase() === "DRAFT") continue;
    const f = parseFindings(r.grade);
    const has = (field, surface = "openai") => f.some((x) => x.field === field && (x.surface ?? null) === surface);
    const item = { productId: r.productId, title: r.title, handle: r.handle };
    if (has("image alt")) out[FIX.ALT_TEXT].push(item);
    if (has("description")) out[FIX.DESCRIPTION].push(item);
    if (has("brand")) out[FIX.VENDOR].push(item);
    if (has("variant options")) out[FIX.OPTION_NAME].push(item);
    if (has("gtin") && !r.gtinExempt) {
      out[FIX.GTIN_EXEMPT].push(item);
      out[FIX.BARCODE].push(item);
    }
  }
  return out;
}
