/**
 * Phase 14 item 1 — the write lock, at the choke point.
 *
 * Before today `REMEDIATION_LOCKED_SHOPS` was enforced by `assertWritable()` at
 * five call sites, all inside `remediation.server.js`. The four other paths that
 * write a merchant's catalogue — Review, the product page, a bulk job and
 * autopilot — imported neither `assertWritable` nor `isRemediationLocked`, so a
 * locked shop could still be published to. The owner had just locked a store
 * holding a client's real catalogue, which is what made this worth a phase.
 *
 * These tests drive the guard where it now lives: on the graphql callable. Each
 * one fails on the old code, because on the old code the mutation is simply
 * forwarded to Shopify.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const LOCKED_SHOP = "ebs-bathroom-and-plumbing-supplies-3.myshopify.com";
const OTHER_LOCKED = "r20bcm-2d.myshopify.com";
const FREE_SHOP = "navaal-qa-fresh.myshopify.com";

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// The module reads the secret once at load, like every other secret this app
// reads, so the env must be set before the import.
process.env.REMEDIATION_LOCKED_SHOPS = `askebs.myshopify.com, ${OTHER_LOCKED} ,${LOCKED_SHOP.toUpperCase()}`;

const {
  guardShopWrites,
  isRemediationLocked,
  isLockedResult,
  assertWritable,
  RemediationLocked,
  LOCKED_ERROR_CODE,
} = await import("../../app/utils/writeLock.server.js");
const { isMutationDocument, FIX_ERRORS } = await import("../../app/utils/remediation.js");

const PRODUCT_UPDATE = `mutation updateProduct($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`;
const PRODUCTS_READ = `query getProducts($cursor: String) {
  products(first: 50, after: $cursor) { edges { node { id title } } }
}`;

describe("isMutationDocument — the whole decision the guard makes", () => {
  it("is true for every mutation this app sends", () => {
    const sources = [
      "app/utils/remediation.server.js",
      "app/routes/app.review.jsx",
      "app/routes/app.products_.$id.jsx",
      "app/routes/app.blog.jsx",
      "app/routes/app.collections.jsx",
      "app/utils/adminGraphql.server.js",
      "app/utils/seo.server.js",
      "app/utils/bulkProcessor.server.js",
    ];
    const found = [];
    for (const f of sources) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/`(mutation [\s\S]*?)`/g)) found.push([f, m[1]]);
    }
    // If this drops to zero the test has stopped testing anything.
    expect(found.length).toBeGreaterThanOrEqual(8);
    for (const [file, doc] of found) {
      expect(isMutationDocument(doc), `${file}: ${doc.slice(0, 40)}`).toBe(true);
    }
  });

  it("is false for reads, including a read whose text contains the word", () => {
    expect(isMutationDocument(PRODUCTS_READ)).toBe(false);
    expect(isMutationDocument("{ shop { name } }")).toBe(false);
    expect(isMutationDocument(`query f($q: String = "mutation") { shop { name } }`)).toBe(false);
    expect(isMutationDocument(`query f {\n  # a mutation would go here\n  shop { name }\n}`)).toBe(false);
    expect(isMutationDocument(`query f($s: String = """a mutation"""){ shop { name } }`)).toBe(false);
    expect(isMutationDocument("query mutations { shop { name } }")).toBe(false);
    expect(isMutationDocument(null)).toBe(false);
  });
});

describe("the lock names the shops the owner locked", () => {
  it("matches case-insensitively and ignores spacing, and leaves everyone else alone", () => {
    expect(isRemediationLocked(LOCKED_SHOP)).toBe(true);
    expect(isRemediationLocked(OTHER_LOCKED)).toBe(true);
    expect(isRemediationLocked("askebs.myshopify.com")).toBe(true);
    expect(isRemediationLocked(FREE_SHOP)).toBe(false);
  });

  it("assertWritable still throws for the remediation paths, with the merchant-safe sentence", () => {
    expect(() => assertWritable(LOCKED_SHOP)).toThrow(RemediationLocked);
    expect(() => assertWritable(LOCKED_SHOP)).toThrow(FIX_ERRORS.monitoredOnly);
    expect(() => assertWritable(FREE_SHOP)).not.toThrow();
  });
});

describe("guardShopWrites — a locked shop cannot be written to, through any door", () => {
  let upstream;
  beforeEach(() => {
    upstream = vi.fn(async () => ({ status: 200, json: async () => ({ data: { productUpdate: { product: { id: "gid://shopify/Product/1" } } } }) }));
  });

  it("refuses the mutation WITHOUT calling Shopify, and says why", async () => {
    const graphql = guardShopWrites(upstream, LOCKED_SHOP);
    const res = await graphql(PRODUCT_UPDATE, { variables: { product: { id: "gid://shopify/Product/1" } } });
    expect(upstream).not.toHaveBeenCalled();
    const json = await res.json();
    expect(isLockedResult(json)).toBe(true);
    expect(json.errors[0].message).toBe(FIX_ERRORS.monitoredOnly);
    expect(json.errors[0].extensions.code).toBe(LOCKED_ERROR_CODE);
    expect(json.data).toBeNull();
  });

  it("LETS THE AUDIT RUN — a read on a locked shop reaches Shopify untouched", async () => {
    const graphql = guardShopWrites(upstream, LOCKED_SHOP);
    await graphql(PRODUCTS_READ, { variables: { cursor: null } });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe(PRODUCTS_READ);
  });

  it("is a no-op for every other shop — the same function object, so no cost on the merchant path", () => {
    expect(guardShopWrites(upstream, FREE_SHOP)).toBe(upstream);
    expect(guardShopWrites(upstream, undefined)).toBe(upstream);
  });
});

describe("the four surfaces that used to bypass the lock", () => {
  // Each drives the real shared helper with a guarded callable, which is what
  // the routes and the worker now hold.
  it("Review and Products publish: publishProductWithRetry reports a failed publish, not a success", async () => {
    const { publishProductWithRetry } = await import("../../app/utils/adminGraphql.server.js");
    const upstream = vi.fn();
    const graphql = guardShopWrites(upstream, LOCKED_SHOP);
    const out = await publishProductWithRetry(graphql, "gid://shopify/Product/1", { id: "gid://shopify/Product/1", descriptionHtml: "<p>x</p>" });
    expect(out.ok).toBe(false);
    expect(out.error).toBe(FIX_ERRORS.monitoredOnly);
    expect(upstream).not.toHaveBeenCalled();
    // and it does not burn the retry budget on a refusal that cannot change
    expect(out.throttled).toBeFalsy();
  });

  it("the product page and the blog: readMutationResult reports not-ok with the sentence", async () => {
    const { readMutationResult } = await import("../../app/utils/adminGraphql.server.js");
    const graphql = guardShopWrites(vi.fn(), LOCKED_SHOP);
    const res = await graphql(PRODUCT_UPDATE, {});
    const out = await readMutationResult(res, "productUpdate");
    expect(out.ok).toBe(false);
    expect(out.errorMessages).toContain(FIX_ERRORS.monitoredOnly);
  });

  it("a bulk job and autopilot: the worker's factory is wrapped, so neither can write", () => {
    const src = readFileSync("app/utils/bulkProcessor.server.js", "utf8");
    expect(src).toMatch(/import \{ guardShopWrites \} from "\.\/writeLock\.server\.js"/);
    // the fetch-backed callable is returned THROUGH the guard, not beside it
    expect(src).toMatch(/return guardShopWrites\(\s*\(query, opts = \{\}\) =>/);
    expect(src).toMatch(/session\.shop,\s*\);/);
  });

  it("remediation keeps its own earlier check as well", () => {
    const src = readFileSync("app/utils/remediation.server.js", "utf8");
    for (const w of ["applyVendor", "applyOptionNames", "applyBarcodes", "setGtinExempt", "startContentJob"]) {
      expect(src, w).toMatch(new RegExp(`export async function ${w}\\([^)]*\\) \\{\\s*assertWritable\\(shop\\);`));
    }
  });
});

describe("the doors themselves", () => {
  const shopifyServer = readFileSync("app/shopify.server.js", "utf8");

  it("both request-path factories are wrapped in shopify.server.js", () => {
    expect(shopifyServer).toMatch(/import \{ guardShopWrites \} from "\.\/utils\/writeLock\.server\.js"/);
    // authenticate.admin — every route
    expect(shopifyServer).toMatch(/shopify\.authenticate\.admin = async \(request\) => \{[\s\S]*?return guardedAdminContext\(ctx\);/);
    // unauthenticated.admin — llms.txt
    expect(shopifyServer).toMatch(/shopify\.unauthenticated\.admin = async/);
    expect(shopifyServer).toMatch(/guardShopWrites\(ctx\.admin\.graphql\.bind\(ctx\.admin\)/);
  });

  it("there is no FOURTH door: every graphql callable comes from one of the three", () => {
    // A new way of reaching Shopify would need a new client factory. This test
    // is the tripwire for that, and names the three that exist.
    const files = [
      "app/routes/app.review.jsx",
      "app/routes/app.products.jsx",
      "app/routes/app.products_.$id.jsx",
      "app/routes/app.blog.jsx",
      "app/routes/app.collections.jsx",
      "app/utils/seo.server.js",
      "app/utils/llms.server.js",
      "app/utils/bulkProcessor.server.js",
      "app/utils/quickStart.server.js",
      "app/utils/catalogGaps.server.js",
      "app/utils/shopName.server.js",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // No file may build its own admin fetch to the GraphQL endpoint except the
      // worker's factory, which is itself guarded (asserted above).
      const rawEndpoints = [...src.matchAll(/admin\/api\/\$\{[^}]*\}\/graphql\.json/g)];
      if (f === "app/utils/bulkProcessor.server.js") continue; // guarded factory + a read-only product fetch
      expect(rawEndpoints, `${f} builds its own Shopify endpoint`).toHaveLength(0);
    }
  });
});

afterEach(() => vi.clearAllMocks());
