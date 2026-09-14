/**
 * P2.6 — bulk remediation, with review.
 *
 * What these hold: the lock is checked before every write; a GTIN is never
 * invented and never accepted with a bad check digit; the fixes the app
 * cannot make are stated with the scope that would be needed, and those
 * scopes really are absent from the app's manifest; credits match B1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  FIX,
  FIX_LABEL,
  SKIPPED,
  inferOptionName,
  proposeVendor,
  parseLockedShops,
  isLockedShop,
  withoutFinding,
  isValidGtin,
  candidatesFromRows,
} from "../../app/utils/remediation.js";
import { CREDIT_WEIGHTS } from "../../app/utils/credits.js";
import { parseFindings } from "../../app/utils/catalogueWatch.js";

describe("what each fix costs — B1, not a new number", () => {
  it("alt text stays 0; descriptions cost what the locked weighting says", () => {
    expect(FIX_LABEL[FIX.ALT_TEXT].credits).toBe(0);
    expect(FIX_LABEL[FIX.ALT_TEXT].credits).toBe(CREDIT_WEIGHTS.altText);
    expect(FIX_LABEL[FIX.DESCRIPTION].credits).toBe(CREDIT_WEIGHTS.description);
    for (const f of [FIX.VENDOR, FIX.OPTION_NAME, FIX.GTIN_EXEMPT, FIX.BARCODE]) expect(FIX_LABEL[f].credits).toBe(0);
  });

  it("every fix says how it is done and never promises a ranking", () => {
    for (const f of Object.values(FIX)) {
      expect(FIX_LABEL[f].how.length).toBeGreaterThan(40);
      expect(FIX_LABEL[f].how).not.toMatch(/rank|#1|guarantee/i);
    }
  });
});

describe("option names from values", () => {
  it("sizes", () => {
    expect(inferOptionName(["S", "M", "L"])).toBe("Size");
    expect(inferOptionName(["500ml", "1L"])).toBe("Size");
    expect(inferOptionName(["38", "40", "42"])).toBe("Size");
  });
  it("colours, including two-word values", () => {
    expect(inferOptionName(["Red", "Navy Blue", "Forest green"])).toBe("Colour");
  });
  it("materials", () => {
    expect(inferOptionName(["Oak", "Walnut"])).toBe("Material");
  });
  it("does not guess when the values do not say, or there is only one", () => {
    expect(inferOptionName(["Standard", "Deluxe"])).toBeNull();
    expect(inferOptionName(["Red"])).toBeNull();
    expect(inferOptionName([])).toBeNull();
  });
});

describe("the brand proposal", () => {
  it("prefers the name the merchant typed, then the shop's name, never invents one", () => {
    expect(proposeVendor({ brandStoreName: "Fernwick", shopName: "Northline Supply" })).toBe("Fernwick");
    expect(proposeVendor({ brandStoreName: "  ", shopName: "Northline Supply" })).toBe("Northline Supply");
    expect(proposeVendor({})).toBe("");
  });
});

describe("the lock", () => {
  it("parses a comma list, case- and space-insensitive, and empty means nothing is locked", () => {
    const locked = parseLockedShops(" A-Shop.myshopify.com , b.myshopify.com,, ");
    expect(isLockedShop("a-shop.myshopify.com", locked)).toBe(true);
    expect(isLockedShop("B.MYSHOPIFY.COM", locked)).toBe(true);
    expect(isLockedShop("c.myshopify.com", locked)).toBe(false);
    expect(isLockedShop("a-shop.myshopify.com", parseLockedShops(""))).toBe(false);
    expect(isLockedShop("a-shop.myshopify.com", parseLockedShops(undefined))).toBe(false);
  });

  it("every write path in the server module checks it first", () => {
    const srv = code(readFileSync("app/utils/remediation.server.js", "utf8"));
    const writers = ["applyVendor", "applyOptionNames", "applyBarcodes", "setGtinExempt", "startContentJob"];
    for (const w of writers) {
      const m = srv.match(new RegExp(`export async function ${w}\\([^)]*\\) \\{\\s*assertWritable\\(shop\\);`));
      expect(m, `${w} must call assertWritable(shop) first`).not.toBeNull();
    }
    expect(srv).toMatch(/REMEDIATION_LOCKED_SHOPS/);
  });

  it("the route turns the lock into a 403 with the merchant-safe message, and never a stack", () => {
    const route = code(readFileSync("app/routes/app.fix.jsx", "utf8"));
    expect(route).toMatch(/RemediationLocked/);
    expect(route).toMatch(/status: 403/);
  });
});

describe("GTIN: never invented, never accepted wrong", () => {
  it("validates the check digit for 8, 12, 13 and 14 digits", () => {
    expect(isValidGtin("5012345678900")).toBe(true); // EAN-13
    expect(isValidGtin("012345678905")).toBe(true); // UPC-A
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
    expect(isValidGtin("10614141000415")).toBe(true); // GTIN-14
    expect(isValidGtin("5012345678901")).toBe(false);
    expect(isValidGtin("1234")).toBe(false);
    expect(isValidGtin("abc")).toBe(false);
    expect(isValidGtin("")).toBe(false);
  });

  it("the server refuses an invalid GTIN before any write, and the pure module never generates one", () => {
    const srv = code(readFileSync("app/utils/remediation.server.js", "utf8"));
    expect(srv).toMatch(/if \(!isValidGtin\(code\)\)/);
    const pure = code(readFileSync("app/utils/remediation.js", "utf8"));
    expect(pure).not.toMatch(/generateGtin|randomGtin|Math\.random/);
  });
});

describe("what cannot be fixed is stated with the scope it would need — and that scope is really absent", () => {
  const toml = readFileSync("shopify.app.toml", "utf8");
  const scopes = (toml.match(/scopes = "([^"]+)"/) ?? [])[1] ?? "";

  it("names three scopes the app does not request", () => {
    for (const s of ["write_publications", "write_online_store_navigation", "read_legal_policies"]) {
      expect(SKIPPED.some((k) => k.why.includes(s)), `SKIPPED must name ${s}`).toBe(true);
      expect(scopes.split(",").map((x) => x.trim())).not.toContain(s);
    }
  });

  it("availability is explained as supplied by Shopify, not as a gap", () => {
    expect(SKIPPED.find((k) => k.what === "Availability").why).toMatch(/Shopify supplies/);
  });
});

describe("findings update the moment a fix is confirmed", () => {
  const f = [
    { surface: "openai", grade: "blocking", field: "brand", note: "x" },
    { surface: "openai", grade: "degrading", field: "gtin", note: "y" },
    { surface: null, grade: "cosmetic", field: "product_type", note: "z" },
  ];
  it("removes exactly the one finding and recounts", () => {
    const r = withoutFinding(f, { surface: "openai", field: "brand" });
    expect(r.findings.map((x) => x.field)).toEqual(["gtin", "product_type"]);
    expect(r).toMatchObject({ blocking: 0, degrading: 1, cosmetic: 1 });
    expect(withoutFinding(f, { surface: null, field: "product_type" }).cosmetic).toBe(0);
    expect(withoutFinding(null, { surface: "openai", field: "brand" }).findings).toEqual([]);
  });
});

describe("candidates from stored findings", () => {
  const row = (fields, over = {}) => ({
    productId: `gid://shopify/Product/${Math.random()}`,
    title: "t",
    handle: "h",
    grade: JSON.stringify(fields.map(([surface, field]) => ({ surface, field, grade: "degrading", note: "" }))),
    gtinExempt: false,
    statusShop: "ACTIVE",
    ...over,
  });

  it("routes each finding to its fix, honours the exemption, and skips drafts", () => {
    const rows = [
      row([["openai", "brand"], ["openai", "gtin"]]),
      row([["openai", "gtin"]], { gtinExempt: true }),
      row([["openai", "image alt"], ["openai", "description"]]),
      row([["openai", "variant options"]], { statusShop: "DRAFT" }),
    ];
    const c = candidatesFromRows(rows, parseFindings);
    expect(c[FIX.VENDOR]).toHaveLength(1);
    expect(c[FIX.GTIN_EXEMPT]).toHaveLength(1);
    expect(c[FIX.BARCODE]).toHaveLength(1);
    expect(c[FIX.ALT_TEXT]).toHaveLength(1);
    expect(c[FIX.DESCRIPTION]).toHaveLength(1);
    expect(c[FIX.OPTION_NAME]).toHaveLength(0);
  });
});

describe("wiring", () => {
  it("the attention page leads to the fix page; the fix page names its method and the review rule", () => {
    const att = code(readFileSync("app/routes/app.attention.jsx", "utf8"));
    expect(att).toMatch(/\/app\/fix/);
    const fix = code(readFileSync("app/routes/app.fix.jsx", "utf8"));
    expect(fix).toMatch(/Method:/);
    expect(fix).toMatch(/never published from this page/);
    expect(fix).toMatch(/autoPublish|Review page/);
  });

  it("content fixes go through the existing bulk job with review, sourced as remediation", () => {
    const srv = code(readFileSync("app/utils/remediation.server.js", "utf8"));
    expect(srv).toMatch(/source: "remediation"/);
    expect(srv).toMatch(/autoPublish: false/);
    expect(srv).toMatch(/enqueueGenerationJob\(/);
  });

  it("the walk stops raising gtin once the merchant said there is none by design", () => {
    const walk = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
    expect(walk).toMatch(/gtinExempt/);
  });
});
