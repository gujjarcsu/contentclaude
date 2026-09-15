/**
 * Phase 11 Part B — who a shop is, explicitly, and the funnel over real
 * shops only.
 *
 * The first funnel reading said 11 real shops; the ledger said 3 ever. The
 * pattern that excluded four naming conventions counted the owner's own
 * store, an old test store and Shopify's reviewer and demo stores as
 * merchants. Held here: the stored classification wins; our own handle is
 * ours whatever the row says and can never be real; a new install is
 * unclassified and is counted as nothing; the classifier's parser refuses
 * what it should; the column exists with the right default; and the funnel
 * no longer knows a pattern at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { SHOP_KINDS, OURS_PATTERN, kindOf, isRealShop, tallyKinds, parseKindAssignments } from "../../app/utils/shopKind.js";

const src = (p) => code(readFileSync(p, "utf8"));

describe("kindOf", () => {
  it("the stored classification wins for real and shopify; unclassified and unknown values fall through", () => {
    expect(kindOf({ shop: "m.myshopify.com", kind: "real" })).toBe("real");
    expect(kindOf({ shop: "m.myshopify.com", kind: "SHOPIFY" })).toBe("shopify");
    expect(kindOf({ shop: "m.myshopify.com", kind: "unclassified" })).toBe("unclassified");
    expect(kindOf({ shop: "m.myshopify.com", kind: "merchant" })).toBe("unclassified"); // not one of the four
    expect(kindOf({ shop: "m.myshopify.com" })).toBe("unclassified");
    expect(kindOf(null)).toBe("unclassified");
  });

  it("our own handle is ours whatever the row says — a dev store can never be counted as a merchant", () => {
    for (const s of ["navaal-ttv-02.myshopify.com", "navaal-qa-fresh.myshopify.com", "navaal-shape-cap.myshopify.com", "navaal-test-2.myshopify.com", "contentpilot-dev2.myshopify.com", "contentpilot-dev.myshopify.com", "contentpilot-test.myshopify.com"]) {
      expect(kindOf({ shop: s, kind: "real" }), s).toBe("ours");
      expect(kindOf({ shop: s }), s).toBe("ours");
      expect(isRealShop({ shop: s, kind: "real" }), s).toBe(false);
    }
    expect(OURS_PATTERN.test("navaal-shapes.myshopify.com")).toBe(false);
    expect(OURS_PATTERN.test("ttv-02.myshopify.com")).toBe(false);
  });

  it("tallyKinds counts every row under exactly one kind", () => {
    const rows = [{ shop: "a.myshopify.com", kind: "real" }, { shop: "navaal-ttv-02.myshopify.com" }, { shop: "r.myshopify.com", kind: "shopify" }, { shop: "n.myshopify.com" }];
    expect(tallyKinds(rows)).toEqual({ ours: 1, shopify: 1, real: 1, unclassified: 1 });
    expect(SHOP_KINDS).toEqual(["ours", "shopify", "real", "unclassified"]);
  });
});

describe("parseKindAssignments — the classifier's input", () => {
  it("accepts domain=kind pairs separated by space, comma or newline, lower-cased", () => {
    const { assignments, refused } = parseKindAssignments("A.myshopify.com=REAL, b.myshopify.com=shopify\nc.myshopify.com=ours");
    expect(assignments).toEqual([
      { shop: "a.myshopify.com", kind: "real" },
      { shop: "b.myshopify.com", kind: "shopify" },
      { shop: "c.myshopify.com", kind: "ours" },
    ]);
    expect(refused).toEqual([]);
  });

  it("refuses a non-myshopify domain, an unknown kind, a malformed pair, and 'real' on one of our handles — and still returns the rest", () => {
    const { assignments, refused } = parseKindAssignments("evil.com=real x.myshopify.com=merchant nothing navaal-ttv-02.myshopify.com=real ok.myshopify.com=real");
    expect(assignments).toEqual([{ shop: "ok.myshopify.com", kind: "real" }]);
    expect(refused.map((r) => r.reason)).toEqual([
      "not a myshopify domain",
      "kind must be one of ours, shopify, real, unclassified",
      "expected domain=kind",
      "one of our own handles can never be classified real",
    ]);
    expect(parseKindAssignments("")).toEqual({ assignments: [], refused: [] });
  });
});

describe("the column, the funnel and the script", () => {
  it("Shop.kind exists, defaults to unclassified, and the migration is additive with that default", () => {
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/^\s*kind\s+String\s+@default\("unclassified"\)/m);
    const sql = readFileSync("prisma/migrations/20260915120000_shop_kind/migration.sql", "utf8");
    expect(sql).toMatch(/ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'unclassified'/);
    expect(sql).not.toMatch(/UPDATE|DROP/i);
  });

  it("the funnel reads the kind and knows no pattern; the classifier script refuses through the shared parser", () => {
    const f = src("app/utils/funnel.js");
    expect(f).toMatch(/from "\.\/shopKind\.js"/);
    expect(f).toMatch(/kind: true/);
    expect(f).not.toMatch(/TEST_SHOP_PATTERN|isTestShop|myshopify\.com\$/);
    const s = src("scripts/shop-kind--writes-classification.mjs");
    expect(s).toMatch(/parseKindAssignments\(text\)/);
    expect(s).toMatch(/updateMany\(\{ where: \{ shop \}, data: \{ kind \} \}\)/);
    expect(s).not.toMatch(/accessToken|deleteMany/);
  });
});
