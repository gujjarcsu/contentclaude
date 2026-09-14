/**
 * P2.2 — eligibility graded per surface, never a verdict.
 *
 * The doctrine these tests hold: a recommended field is never called a
 * disqualification. product_type is cosmetic, GTIN is degrading with the
 * own-brand exemption in the note, and a draft is not graded at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  SURFACE,
  SURFACE_LABEL,
  GRADE,
  EVIDENCE_MIN_CHARS,
  gradeProduct,
  parseFindings,
  homeAttentionLines,
} from "../../app/utils/catalogueWatch.js";

const complete = (over = {}) => ({
  id: "gid://shopify/Product/1",
  title: "Enamel Camp Mug",
  description: "A 350 ml enamel mug with a rolled steel rim, kiln-fired in two coats so it takes knocks without chipping. Dishwasher safe. Made in Portugal.",
  vendor: "Fernwick",
  status: "ACTIVE",
  onlineStoreUrl: "https://fernwick.example/products/enamel-camp-mug",
  productType: "Mugs",
  hasOnlyDefaultVariant: true,
  featuredImage: { url: "https://cdn.example/mug.jpg", altText: "White enamel mug with a navy rim" },
  options: [{ name: "Title" }],
  variants: { nodes: [{ barcode: "5012345678900" }] },
  ...over,
});

const fields = (g, grade, surface) => g.findings.filter((f) => f.grade === grade && (surface === undefined || f.surface === surface)).map((f) => f.field);

describe("a complete product has nothing to say", () => {
  it("no findings, zero counts", () => {
    const g = gradeProduct(complete());
    expect(g.findings).toEqual([]);
    expect(g).toMatchObject({ blocking: 0, degrading: 0, cosmetic: 0 });
  });

  it("a draft is not graded — it is not for sale", () => {
    const g = gradeProduct(complete({ status: "DRAFT", vendor: "", description: "" }));
    expect(g.findings).toEqual([]);
    expect(g.skipped).toBe("draft");
  });
});

describe("blocking: what a surface cannot list without", () => {
  it("no vendor blocks the OpenAI feed (brand is required) and nothing else", () => {
    const g = gradeProduct(complete({ vendor: "" }));
    expect(fields(g, GRADE.BLOCKING, SURFACE.OPENAI)).toEqual(["brand"]);
    expect(fields(g, GRADE.BLOCKING, SURFACE.GOOGLE)).toEqual([]);
    expect(g.blocking).toBe(1);
  });

  it("an empty description blocks OpenAI and degrades Google — not the same grade on both", () => {
    const g = gradeProduct(complete({ description: "" }));
    expect(fields(g, GRADE.BLOCKING, SURFACE.OPENAI)).toEqual(["description"]);
    expect(fields(g, GRADE.DEGRADING, SURFACE.GOOGLE)).toEqual(["description"]);
  });

  it("no image blocks OpenAI (image_link required) and degrades Google", () => {
    const g = gradeProduct(complete({ featuredImage: null }));
    expect(fields(g, GRADE.BLOCKING, SURFACE.OPENAI)).toEqual(["image_link"]);
    expect(fields(g, GRADE.DEGRADING, SURFACE.GOOGLE)).toEqual(["image"]);
    expect(fields(g, GRADE.DEGRADING, SURFACE.OPENAI)).not.toContain("image alt");
  });

  it("an active product off the Online Store channel blocks both — there is no page", () => {
    const g = gradeProduct(complete({ onlineStoreUrl: null }));
    expect(fields(g, GRADE.BLOCKING, SURFACE.OPENAI)).toEqual(["link"]);
    expect(fields(g, GRADE.BLOCKING, SURFACE.GOOGLE)).toEqual(["url"]);
    expect(g.blocking).toBe(2);
  });

  it("no title blocks the feed", () => {
    expect(fields(gradeProduct(complete({ title: "  " })), GRADE.BLOCKING, SURFACE.OPENAI)).toEqual(["title"]);
  });
});

describe("degrading: listed, but worse", () => {
  it(`a description under ${EVIDENCE_MIN_CHARS} characters degrades both surfaces and blocks neither`, () => {
    const g = gradeProduct(complete({ description: "Enamel mug. 350 ml." }));
    expect(g.blocking).toBe(0);
    expect(fields(g, GRADE.DEGRADING, SURFACE.OPENAI)).toEqual(["description"]);
    expect(fields(g, GRADE.DEGRADING, SURFACE.GOOGLE)).toEqual(["description"]);
  });

  it("an image with no alt text degrades OpenAI only", () => {
    const g = gradeProduct(complete({ featuredImage: { url: "https://cdn.example/mug.jpg", altText: "" } }));
    expect(fields(g, GRADE.DEGRADING, SURFACE.OPENAI)).toEqual(["image alt"]);
    expect(g.blocking).toBe(0);
  });

  it("no barcode is DEGRADING with the own-brand exemption stated — never blocking", () => {
    const g = gradeProduct(complete({ variants: { nodes: [{ barcode: null }] } }));
    expect(fields(g, GRADE.DEGRADING, SURFACE.OPENAI)).toEqual(["gtin"]);
    expect(g.blocking).toBe(0);
    const note = g.findings.find((f) => f.field === "gtin").note;
    expect(note).toMatch(/own brand/i);
    expect(note).toMatch(/handmade/i);
  });

  it("a multi-variant product whose only option is still 'Title' is degrading; a single variant called Title is nothing", () => {
    const multi = gradeProduct(complete({ hasOnlyDefaultVariant: false, options: [{ name: "Title" }] }));
    expect(fields(multi, GRADE.DEGRADING, SURFACE.OPENAI)).toEqual(["variant options"]);
    const single = gradeProduct(complete({ hasOnlyDefaultVariant: true, options: [{ name: "Title" }] }));
    expect(single.findings).toEqual([]);
    const named = gradeProduct(complete({ hasOnlyDefaultVariant: false, options: [{ name: "Size" }] }));
    expect(named.findings).toEqual([]);
  });
});

describe("cosmetic: Shopify housekeeping, not a surface's rule", () => {
  it("no product_type is COSMETIC, attributed to no surface, and its note says no surface requires it", () => {
    const g = gradeProduct(complete({ productType: "" }));
    expect(g).toMatchObject({ blocking: 0, degrading: 0, cosmetic: 1 });
    const f = g.findings[0];
    expect(f.surface).toBeNull();
    expect(f.field).toBe("product_type");
    expect(f.note).toMatch(/No AI surface requires it/);
  });
});

describe("the doctrine, mechanically", () => {
  const worst = gradeProduct(
    complete({
      title: "",
      description: "",
      vendor: "",
      onlineStoreUrl: null,
      productType: "",
      featuredImage: null,
      hasOnlyDefaultVariant: false,
      options: [{ name: "Title" }],
      variants: { nodes: [{ barcode: "" }] },
    }),
  );

  it("every finding names a grade from GRADE and a field, and says something", () => {
    expect(worst.findings.length).toBeGreaterThan(5);
    for (const f of worst.findings) {
      expect(Object.values(GRADE)).toContain(f.grade);
      expect(f.field.length).toBeGreaterThan(0);
      expect(f.note.length).toBeGreaterThan(20);
      if (f.surface !== null) expect(Object.keys(SURFACE_LABEL)).toContain(f.surface);
    }
  });

  it("no note ever calls anything a disqualification or ineligible", () => {
    for (const f of worst.findings) expect(f.note).not.toMatch(/disqualif|ineligible/i);
  });

  it("counts add up", () => {
    expect(worst.blocking + worst.degrading + worst.cosmetic).toBe(worst.findings.length);
  });

  it("parseFindings is safe on garbage", () => {
    expect(parseFindings(null)).toEqual([]);
    expect(parseFindings("{")).toEqual([]);
    expect(parseFindings(JSON.stringify(worst.findings))).toEqual(worst.findings);
  });
});

describe("the Home banner's lines", () => {
  it("nothing to say → no lines", () => {
    expect(homeAttentionLines({ needAttention: 0, blocking: 0, crawler: { blocked: [] } })).toEqual([]);
    expect(homeAttentionLines({})).toEqual([]);
  });

  it("a blocked crawler is the first line, then the eligibility count, then what changed", () => {
    const lines = homeAttentionLines({ needAttention: 3, sinceYesterday: 1, blocking: 2, crawler: { blocked: ["OAI-SearchBot"] } });
    expect(lines).toEqual([
      "OAI-SearchBot is blocked from your storefront.",
      "2 products are missing something an AI shopping surface requires.",
      "3 products need attention, 1 since yesterday.",
    ]);
  });

  it("singulars", () => {
    expect(homeAttentionLines({ blocking: 1 })).toEqual(["1 product is missing something an AI shopping surface requires."]);
    expect(homeAttentionLines({ crawler: { blocked: ["bingbot", "Googlebot"] } })).toEqual(["bingbot, Googlebot are blocked from your storefront."]);
  });
});

describe("wiring — the same walk grades, persists, and shows", () => {
  const srv = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
  const page = code(readFileSync("app/routes/app.attention.jsx", "utf8"));

  it("the watch query asks for what grading needs", () => {
    for (const f of ["vendor", "onlineStoreUrl", "status", "hasOnlyDefaultVariant", "barcode", "options(first:"]) {
      expect(srv).toContain(f);
    }
  });

  it("the page is at most 100 products — the widened query must stay under Shopify's 1,000-point cap", () => {
    const m = srv.match(/export const WATCH_PAGE = (\d+);/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeLessThanOrEqual(100);
  });

  it("grades are persisted by the same upsert as the diff", () => {
    expect(srv).toMatch(/gradeProduct\(node\)/);
    expect(srv).toMatch(/blocking: g\.blocking/);
  });

  it("the list page shows the surface and the grade for every finding, and names its method", () => {
    expect(page).toMatch(/SURFACE_LABEL/);
    expect(page).toMatch(/blockingList/);
    expect(page).toMatch(/Method:/);
  });
});
