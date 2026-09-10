/**
 * Group 12 — the store-shape fixture matrix.
 *
 * 1,258 tests, five completed phases and four caught false-greens did not find
 * one of the twenty-nine defects that a single real catalogue surfaced in ninety
 * minutes. The conclusion is not "write more tests". It is that the remaining
 * risk lives in STORE SHAPE, and every fixture in this repo was one shape:
 *
 *     17 products · no pre-existing content · no variant families · one language
 *     · B2C · on a plan bigger than the catalogue
 *
 * Every defect in Phase A is a shape this repo had never constructed. So the
 * shapes are built here, once, and named — a test that says
 * `MAJORITY_ARCHIVED` states which merchant it is protecting, and a shape with
 * no test against it is a defect not yet found.
 *
 * These are deliberately plain data. Nothing here imports Prisma, Shopify or a
 * route, so any test at any layer can use them.
 */

/** Shopify product statuses as the Admin API spells them. */
const ACTIVE = "ACTIVE";
const DRAFT = "DRAFT";
const ARCHIVED = "ARCHIVED";

/**
 * Build one product. Defaults describe the shape this repo always assumed:
 * active, published to the online store, with the merchant's own description.
 */
export function product(i, over = {}) {
  return {
    id: `gid://shopify/Product/${1000 + i}`,
    title: `Product ${i}`,
    handle: `product-${i}`,
    status: ACTIVE,
    publishedOnOnlineStore: true,
    description: `A description for product ${i} that a human being wrote.`,
    productType: "Widget",
    vendor: "Acme",
    tags: [],
    ...over,
  };
}

/** `n` products, each passed through `over(i)` for per-item variation. */
export function catalogue(n, over = () => ({})) {
  return Array.from({ length: n }, (_, i) => product(i, over(i)));
}

// ── Catalogue size ────────────────────────────────────────────────────────
// The sizes that change behaviour, not round numbers for their own sake:
// 0 and 1 are the empty/degenerate states; 5 is smaller than any page; 250 is
// Shopify's page ceiling exactly; 3,000 crosses several pages; 50,000 and
// 500,000 cross Shopify's count-precision ceiling, where `productsCount`
// returns AT_LEAST instead of an exact number.
export const SIZES = Object.freeze({
  EMPTY: 0,
  SINGLE: 1,
  TINY: 5,
  ONE_PAGE: 250,
  MULTI_PAGE: 3_000,
  LARGE: 50_000,
  HUGE: 500_000,
});

// ── Status mix ────────────────────────────────────────────────────────────

export const ALL_ACTIVE = catalogue(20);

/** A store being built. Every product is a draft; none has a public page. */
export const ALL_DRAFT = catalogue(20, () => ({ status: DRAFT, publishedOnOnlineStore: false }));

/**
 * The real shape that produced the defect: 3,148 products of which 1,350 are
 * active, 280 draft and 1,518 archived — proportions preserved at 1/100 scale.
 */
export const MAJORITY_ARCHIVED = [
  ...catalogue(14).map((p) => ({ ...p })),
  ...catalogue(3, () => ({ status: DRAFT, publishedOnOnlineStore: false })).map((p, i) => ({
    ...p,
    id: `gid://shopify/Product/${2000 + i}`,
  })),
  ...catalogue(15, () => ({ status: ARCHIVED, publishedOnOnlineStore: false })).map((p, i) => ({
    ...p,
    id: `gid://shopify/Product/${3000 + i}`,
  })),
];

// ── Channel ───────────────────────────────────────────────────────────────

/**
 * ACTIVE but not on the online store: POS-only, marketplace-only, wholesale.
 * These have no public page at any status and are not SEO candidates at all —
 * the axis the app ignored entirely.
 */
export const ACTIVE_NOT_PUBLISHED = catalogue(10, () => ({ publishedOnOnlineStore: false }));

/** Half on the online store, half elsewhere — the multi-channel merchant. */
export const MULTI_CHANNEL = catalogue(20, (i) => ({ publishedOnOnlineStore: i % 2 === 0 }));

/** A trade-only catalogue: active, priced, and deliberately not public. */
export const B2B_ONLY = catalogue(12, () => ({
  publishedOnOnlineStore: false,
  tags: ["wholesale", "trade-only"],
}));

// ── Existing content ──────────────────────────────────────────────────────

/** Nothing written by anyone. The only shape this repo used to test. */
export const NO_CONTENT = catalogue(20, () => ({ description: "" }));

/** Whitespace and empty markup, which is not content but is not "" either. */
export const BLANK_MARKUP_CONTENT = catalogue(6, () => ({ description: "<p>&nbsp;</p>  <br>" }));

/**
 * Thin templated boilerplate — the same sentence with the name swapped. Real,
 * and taken from the shape of an actual accessories range.
 */
export const THIN_TEMPLATED = catalogue(8, (i) => ({
  title: `NOBLE ${["ROBE HOOK", "TOWEL BAR", "TOILET ROLL HOLDER", "SOAP DISH"][i % 4]} CHROME`,
  description:
    `The NOBLE ${["ROBE HOOK", "TOWEL BAR", "TOILET ROLL HOLDER", "SOAP DISH"][i % 4]} CHROME is a ` +
    "quality accessories product, supplied by a specialist merchant. Designed for lasting performance.",
}));

/** Excellent hand-written copy carrying standing commercial claims. */
export const HAND_WRITTEN = catalogue(10, (i) => ({
  description:
    `Product ${i} is manufactured to WaterMark certification and carries a 25-year warranty. ` +
    "Ships in 2 business days. Free local pickup and price match.",
}));

/** Some fields written, others empty — the partial case nobody tests. */
export const PARTIAL_BY_FIELD = catalogue(9, (i) => ({
  description: i % 3 === 0 ? "" : `Real copy for product ${i}.`,
  seoTitle: i % 3 === 1 ? "" : `SEO title ${i}`,
  seoDescription: i % 3 === 2 ? "" : `SEO description ${i}`,
}));

// ── Structure: variant families ───────────────────────────────────────────

/**
 * The shape that would have made the duplicate gate refuse a legitimate
 * catalogue: one hose sold as seven products, one per finish, with descriptions
 * that are byte-identical apart from the finish word.
 *
 * Correct merchandising, and every hardware, plumbing, electrical, apparel,
 * fastener and building-supply catalogue is mostly this.
 */
export const FINISH_FAMILY_NAMES = Object.freeze([
  "",
  "Brushed Copper",
  "Brushed Gold",
  "Brushed Stainless Steel",
  "Chrome",
  "Gunmetal",
  "Matte Black",
]);

export const VARIANT_FAMILY = FINISH_FAMILY_NAMES.map((finish, i) => ({
  ...product(i, {
    id: `gid://shopify/Product/${4000 + i}`,
    title: finish ? `Pull Out Kitchen Mixer Hose ${finish}` : "Pull Out Kitchen Mixer Hose",
    productType: "Tapware",
    tags: finish ? [`colour:${finish.toLowerCase().replace(/ /g, "-")}`] : [],
    description:
      "Replacement pull out hose for kitchen mixers. Braided construction, standard thread, " +
      "suitable for most pull out kitchen tapware. Australian standards compliant.",
  }),
}));

/** 40 sizes of the same fastener: legitimately near-identical, not templated. */
export const FASTENER_SIZES = Array.from({ length: 40 }, (_, i) => {
  const mm = 10 + i * 5;
  return product(i, {
    id: `gid://shopify/Product/${5000 + i}`,
    title: `Hex Head Bolt M8 x ${mm}mm Galvanised`,
    productType: "Fasteners",
    tags: [`size:${mm}mm`],
    description:
      `Hex head bolt, M8 thread, ${mm}mm length, hot dip galvanised to AS/NZS 4680. ` +
      "Sold individually. Suitable for structural and general fixing applications.",
  });
});

// ── Locale ────────────────────────────────────────────────────────────────

export const NON_ENGLISH = catalogue(8, (i) => ({
  title: `Mitigeur de cuisine ${i}`,
  description:
    `Mitigeur de cuisine ${i} en laiton massif, finition chromée. Garantie 25 ans. ` +
    "Livraison sous 2 jours ouvrés.",
}));

/** A catalogue whose copy carries claims that are legally required to survive. */
export const COMPLIANCE_CLAIMS = catalogue(6, (i) => ({
  description:
    `Model ${i}. WaterMark certified WMKA12345. WELS rated 5 star, 6.0 litres per minute. ` +
    "Complies with AS/NZS 3718. Installation by a licensed plumber is required by law.",
}));

/**
 * Every shape above, named, so a test can iterate the matrix and a report can
 * say which cells were proved and which were not.
 */
export const SHAPES = Object.freeze({
  ALL_ACTIVE,
  ALL_DRAFT,
  MAJORITY_ARCHIVED,
  ACTIVE_NOT_PUBLISHED,
  MULTI_CHANNEL,
  B2B_ONLY,
  NO_CONTENT,
  BLANK_MARKUP_CONTENT,
  THIN_TEMPLATED,
  HAND_WRITTEN,
  PARTIAL_BY_FIELD,
  VARIANT_FAMILY,
  FASTENER_SIZES,
  NON_ENGLISH,
  COMPLIANCE_CLAIMS,
});
