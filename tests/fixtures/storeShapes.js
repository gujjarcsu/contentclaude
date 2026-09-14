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


// ── Phase 10 Part C — the cells the first matrix never built ──────────────
//
// F1 asked for every axis in 05-EVIDENCE.md §4. The shapes above cover status,
// channel, content and locale. These add the rest: the empty store (FR0), the
// variant families whose barcodes live on a later variant (F3's exact shape),
// one product with a hundred variants, multipacks, a catalogue above the Free
// cap, and the plan and API axes as CONTEXTS a phase runs under rather than
// catalogues. Two adapters map a fixture product to the node shape each real
// function reads, so the matrix drives the real code, not a copy of it.

/** FR0 — a store with nothing in it. Untested by CW; the worst screen the self-audit found. */
export const EMPTY_STORE = Object.freeze([]);

/**
 * F3's shape: a multi-variant product whose FIRST variant has no barcode and
 * whose later ones do. Before Phase 9 the walk read variant 1 only and graded
 * every such product "no barcode". `barcodeAt` says which variant carries it.
 */
export function variantProduct(i, { variants = 7, barcodeAt = 3, option = "Size" } = {}) {
  return product(i, {
    id: `gid://shopify/Product/${6000 + i}`,
    title: `Trade Work Boot ${i}`,
    productType: "Footwear",
    hasOnlyDefaultVariant: false,
    options: [{ name: option }],
    variants: Array.from({ length: variants }, (_, v) => ({
      id: `gid://shopify/ProductVariant/${(6000 + i) * 1000 + v}`,
      title: `${option} ${v + 1}`,
      price: "129.00",
      barcode: v >= barcodeAt ? `93${String((6000 + i) * 1000 + v).padStart(11, "0")}` : "",
    })),
  });
}

export const VARIANT_HEAVY_BARCODES = Array.from({ length: 6 }, (_, i) => variantProduct(i, { barcodeAt: 2 + (i % 3) }));

/** One product, 100 sizes, the only barcode on variant 60 — past the walk's sample. */
export const ONE_PRODUCT_100_VARIANTS = [variantProduct(99, { variants: 100, barcodeAt: 59 })]; // its own id and title, so a CSV that carries both families has no handle collision

/** Multipacks: the same SKU sold as x1, x3, x6 — near-identical copy, legitimately. */
export const MULTIPACKS = [1, 3, 6, 12].map((n, i) =>
  product(i, {
    id: `gid://shopify/Product/${7000 + i}`,
    title: `Cable Tie 300mm Black — pack of ${n}`,
    productType: "Fixings",
    tags: [`pack:${n}`],
    description: `Pack of ${n} nylon cable ties, 300mm x 4.8mm, black, UV stabilised. Tensile strength 22kg.`,
  }),
);

/** A catalogue larger than the Free plan will act on (FREE_PLAN.productLimit is 100). */
export const ABOVE_PLAN_CAP = catalogue(150);

/** Products carrying Shopify Translations — the app reads the primary locale only. */
export const MULTI_LOCALE = catalogue(4, (i) => ({
  title: `Kitchen Mixer ${i}`,
  translations: [
    { locale: "fr", key: "title", value: `Mitigeur de cuisine ${i}` },
    { locale: "de", key: "title", value: `Küchenarmatur ${i}` },
  ],
}));

/** The plan axis: the same catalogue under each plan state a merchant can be in. */
export const PLAN_CONTEXTS = Object.freeze({
  FREE_WITH_QUOTA: { planName: "free", monthlyCredits: 100, used: 0 },
  FREE_EXHAUSTED: { planName: "free", monthlyCredits: 100, used: 100 },
  MID_TIER: { planName: "starter", monthlyCredits: 500, used: 120 },
  ABOVE_ANY_PLAN: { planName: "growth", monthlyCredits: 1500, used: 0, catalogue: 20_000 },
  BYO_KEY: { planName: "pro", monthlyCredits: 4000, used: 0, byok: true },
});

/** Shopify's Count payloads at each catalogue size — AT_LEAST past the precision ceiling. */
export const COUNT_PAYLOADS = Object.freeze({
  EMPTY: { count: 0, precision: "EXACT" },
  SINGLE: { count: 1, precision: "EXACT" },
  TINY: { count: 5, precision: "EXACT" },
  ONE_PAGE: { count: 250, precision: "EXACT" },
  MULTI_PAGE: { count: 3_000, precision: "EXACT" },
  LARGE: { count: 10_000, precision: "AT_LEAST" },
  HUGE: { count: 10_000, precision: "AT_LEAST" },
});

/** What the first-run scan selects (SCORED_PRODUCT_FIELDS), from a fixture product. */
export function toScanNode(p) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    productType: p.productType,
    vendor: p.vendor,
    tags: p.tags,
    seo: { title: p.seoTitle ?? "", description: p.seoDescription ?? "" },
    featuredMedia: p.imageUrl === "" ? null : { preview: { image: { url: p.imageUrl ?? `https://cdn.example/${p.handle}.jpg` } } },
    media: { edges: [] },
    variants: { edges: (p.variants ?? [{ price: "10.00" }]).slice(0, 3).map((v) => ({ node: { price: v.price } })) },
  };
}

/** What the catalogue walk selects (WATCH_FIELDS), from a fixture product. */
export function toWalkNode(p) {
  const variants = p.variants ?? [{ barcode: "" }];
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    vendor: p.vendor,
    status: p.status,
    productType: p.productType,
    onlineStoreUrl: p.publishedOnOnlineStore ? `https://example.myshopify.com/products/${p.handle}` : null,
    hasOnlyDefaultVariant: p.hasOnlyDefaultVariant ?? true,
    options: p.options ?? [],
    featuredMedia: p.imageUrl === "" ? null : { preview: { image: { url: p.imageUrl ?? `https://cdn.example/${p.handle}.jpg`, altText: p.imageAlt ?? "" } } },
    variants: { nodes: [{ barcode: variants[0]?.barcode ?? "" }] },
  };
}

/** F3's second look: every barcode up to the walk's sample, as fetchVariantBarcodes returns them. */
export function variantBarcodesOf(p, sample = 50) {
  return (p.variants ?? []).slice(0, sample).map((v) => v.barcode ?? "");
}

/**
 * Every shape above, named, so a test can iterate the matrix and a report can
 * say which cells were proved and which were not.
 */
export const SHAPES = Object.freeze({
  EMPTY_STORE,
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
  VARIANT_HEAVY_BARCODES,
  ONE_PRODUCT_100_VARIANTS,
  MULTIPACKS,
  ABOVE_PLAN_CAP,
  MULTI_LOCALE,
});
