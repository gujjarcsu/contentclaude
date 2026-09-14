/**
 * Part B — the screen agrees with itself, by construction.
 *
 * The first image on the listing carried, on a 15-product store: Total
 * Products 32 · AI Content Published 30 · 30 products optimized · across 14
 * products sampled. Each number was individually defensible. No merchant could
 * reconcile them, because they came from FOUR populations — every record
 * Shopify holds, every product this app ever touched, non-archived, and
 * non-archived-and-published.
 *
 * This class was "fixed" twice by relabelling one number. A relabel is correct
 * about that number and does nothing for a screen. These assertions are about
 * the SCREEN: one population, joined counts, and the exclusion stated.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { intersectContent, publishedSubtext } from "../../app/utils/catalogueContent.js";
import { greetingName } from "../../app/utils/shopName.js";
import { LIST_SCOPE_QUERY } from "../../app/utils/candidates.js";
import { PRODUCT_STATE } from "../../app/utils/productState.js";

const CANDIDATES = code(readFileSync("app/utils/candidates.server.js", "utf8"));
const HOME = code(readFileSync("app/routes/app._index.jsx", "utf8"));
const PRODUCTS = code(readFileSync("app/routes/app.products.jsx", "utf8"));
const OPTIMIZE = code(readFileSync("app/routes/app.optimize.jsx", "utf8"));
// code(): the docstring above productStateRows says "The CASE is the SAME
// precedence…", and the regex below matched THAT before it matched SQL.
const METRICS = code(readFileSync("app/utils/metrics.server.js", "utf8"));

describe("Total Products is the catalogue a merchant recognises", () => {
  it("counts non-archived products, through the one scope constant", () => {
    // "32" was an unfiltered productsCount — the A1 bug in a fourth place.
    expect(CANDIDATES).toMatch(/total:\s*productsCount\(query:\s*"\$\{LIST_SCOPE_QUERY\}"\)/);
    expect(LIST_SCOPE_QUERY).toBe("-status:archived");
  });

  it("reads the archived count too, so the exclusion is stated rather than silent", () => {
    expect(CANDIDATES).toMatch(/archived:\s*productsCount\(query:/);
    expect(CANDIDATES).toMatch(/const archived = readCount\(r\.data\?\.archived\)/);
    for (const [src, name] of [
      [HOME, "Home"],
      [PRODUCTS, "Products"],
    ]) {
      expect(src, `${name} does not surface the archived count`).toMatch(/archivedProducts/);
      expect(src, `${name} does not say archived products are excluded`).toMatch(/archived not (counted|shown)/);
    }
  });
});

describe("the join — content counted only among the population on screen", () => {
  const rows = [
    { productId: "gid://shopify/Product/1", state: PRODUCT_STATE.PUBLISHED },
    { productId: "gid://shopify/Product/2", state: PRODUCT_STATE.PUBLISHED },
    { productId: "gid://shopify/Product/3", state: PRODUCT_STATE.DRAFT },
    { productId: "gid://shopify/Product/4", state: PRODUCT_STATE.UNVERIFIED },
    { productId: "gid://shopify/Product/5", state: PRODUCT_STATE.REJECTED },
    // Archived long ago, still in our record. This is the "30" on a 15-store.
    { productId: "gid://shopify/Product/9", state: PRODUCT_STATE.PUBLISHED },
  ];

  it("ignores content on products outside the scope", () => {
    const inScope = new Set(["gid://shopify/Product/1", "gid://shopify/Product/2", "gid://shopify/Product/3"]);
    expect(intersectContent(rows, inScope)).toEqual({
      published: 2,
      draft: 1,
      unverified: 0,
      rejected: 0,
      withContent: 3,
    });
  });

  it("withContent equals the sum of the states it counts", () => {
    const inScope = new Set(rows.map((r) => r.productId));
    const r = intersectContent(rows, inScope);
    expect(r.withContent).toBe(r.published + r.draft + r.unverified + r.rejected);
  });

  it("an empty scope yields zeros, never the lifetime record", () => {
    expect(intersectContent(rows, new Set()).withContent).toBe(0);
  });

  it("does not throw on bad input — a count must never break a screen", () => {
    expect(intersectContent(null, new Set()).withContent).toBe(0);
    expect(intersectContent(rows, null).withContent).toBe(0);
  });
});

describe("the three screens read the join, and fall back honestly", () => {
  it.each([
    ["Home", HOME],
    ["Products", PRODUCTS],
    ["Optimize", OPTIMIZE],
  ])("%s calls contentInCatalogue", (_, src) => {
    expect(src).toMatch(/contentInCatalogue\(admin, shop\)/);
  });

  it.each([
    ["Home", HOME],
    ["Products", PRODUCTS],
    ["Optimize", OPTIMIZE],
  ])("%s computes not-optimized from the JOINED withContent, with a fallback", (_, src) => {
    expect(src).toMatch(/catalogue\.ok \? catalogue\.withContent : metrics\.withContent/);
  });

  it("Home and Products keep the lifetime record as `recordPublished`, not as the headline", () => {
    for (const src of [HOME, PRODUCTS]) {
      expect(src).toMatch(/recordPublished = metrics\.publishedProducts/);
      expect(src).toMatch(/publishedSubtext\(/);
    }
  });

  it("'new shop' is decided by the record, not the join", () => {
    // A store whose only content sits on since-archived products is not new.
    expect(HOME).toMatch(/isNewShop = metrics\.publishedProducts === 0 && metrics\.draftProducts === 0/);
  });
});

describe("the words beside the published count explain the gap, when there is one", () => {
  const label = "active and draft products published to your online store";

  it("names the population when record and join agree", () => {
    expect(publishedSubtext({ ok: true, inScope: 14, candidateCount: 14, candidateLabel: label, record: 14 })).toBe(
      `of your 14 ${label}`,
    );
  });

  it("shows BOTH numbers when the record exceeds the join — 30 on a 14-store", () => {
    expect(publishedSubtext({ ok: true, inScope: 14, candidateCount: 14, candidateLabel: label, record: 30 })).toBe(
      `of your 14 ${label} · 30 since you installed`,
    );
  });

  it("falls back to the record's own wording when the join is unavailable", () => {
    expect(publishedSubtext({ ok: false, inScope: 0, candidateCount: 14, candidateLabel: label, record: 30 })).toBe(
      "Products we have published content for",
    );
  });
});

describe("the state rule has ONE definition, in two queries", () => {
  it("both CASE blocks in metrics.server.js are textually identical", () => {
    // productStateRows repeats getContentMetrics' CASE rather than composing
    // it, to keep the hot query untouched. This is what stops the copy forking.
    const cases = [...METRICS.matchAll(/CASE[\s\S]*?END AS state/g)].map((m) =>
      m[0].replace(/\s+/g, " ").trim(),
    );
    expect(cases.length).toBe(2);
    expect(cases[0]).toBe(cases[1]);
  });
});

describe("frame 04 — the greeting trusts Shopify's name", () => {
  const ttv = "navaal-ttv-02.myshopify.com";

  it("greets a store whose name normalises to its handle — Shopify derives the handle FROM the name", () => {
    // Read from the admin on 2026-09-14: the store is called "Navaal TTV 02".
    // A person typed that. It was being rejected as a placeholder.
    expect(greetingName("Navaal TTV 02", null, ttv)).toBe("Navaal TTV 02");
    expect(greetingName("Acme Co", "", "acme-co.myshopify.com")).toBe("Acme Co");
  });

  it("still refuses the RAW handle, which means no name was ever set", () => {
    expect(greetingName("navaal-ttv-02", null, ttv)).toBeNull();
  });

  it("the stored seed is still detected by the normalising heuristic", () => {
    expect(greetingName(null, "Navaal Ttv 02", ttv)).toBeNull();
  });
});
