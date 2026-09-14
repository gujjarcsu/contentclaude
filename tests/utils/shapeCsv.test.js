/**
 * Phase 10 Part C (F2) — the navaal-shape-* import files are the fixtures
 * made real, and they say what the matrix says.
 *
 * Each CSV is regenerated from tests/fixtures/storeShapes.js by
 * scripts/shape-csv.mjs. This holds: the committed files match the
 * generator (so a fixture change cannot leave a stale store file), the
 * Status and Published columns carry the shape (drafts are drafts and off
 * the Online Store; B2B is active and off it), the variant file puts the
 * first barcode on variant 3 and the 100-variant product's only barcode on
 * variant 60, and the French file keeps its accents.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STORES, HEADER, csvFor } from "../../scripts/shape-csv.mjs";

const DIR = "tools/proof/fixtures/shapes";

/** A small RFC-4180 reader — enough for these files. */
function parse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const load = (store) => parse(readFileSync(`${DIR}/${STORES[store].file}`, "utf8"));
const firstRows = (rows) => rows.filter((r) => r.Title !== "");

describe("the committed files are the generator's output", () => {
  for (const store of Object.keys(STORES)) {
    it(`${store} → ${STORES[store].file}`, () => {
      const file = readFileSync(`${DIR}/${STORES[store].file}`, "utf8").replace(/\r\n/g, "\n");
      expect(file).toBe(csvFor(store));
      expect(file.split("\n")[0]).toBe(HEADER.join(","));
    });
  }
});

describe("each file carries its shape", () => {
  it("navaal-shape-drafts: 20 products, every one a draft and off the Online Store", () => {
    const rows = firstRows(load("navaal-shape-drafts"));
    expect(rows).toHaveLength(20);
    expect(rows.every((r) => r.Status === "draft" && r.Published === "FALSE")).toBe(true);
    expect(rows.every((r) => r["Body (HTML)"].length > 0)).toBe(true); // drafts with real copy: nothing to Generate, nothing to grade
  });

  it("navaal-shape-b2b: 12 active products, none on the Online Store, tagged as trade", () => {
    const rows = firstRows(load("navaal-shape-b2b"));
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.Status === "active" && r.Published === "FALSE")).toBe(true);
    expect(rows.every((r) => /wholesale/.test(r.Tags))).toBe(true);
  });

  it("navaal-shape-fr: 8 active French products, accents intact, on the Online Store", () => {
    const rows = firstRows(load("navaal-shape-fr"));
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.Status === "active" && r.Published === "TRUE")).toBe(true);
    expect(rows[0].Title).toMatch(/^Mitigeur de cuisine/);
    expect(rows[0]["Body (HTML)"]).toMatch(/finition chromée|Garantie 25 ans/);
    expect(rows.map((r) => r.Handle)).toEqual([...new Set(rows.map((r) => r.Handle))]); // slugs strip the accents but stay unique
  });

  it("navaal-shape-cap: 150 active products on the Online Store — above the Free cap of 100", () => {
    const rows = firstRows(load("navaal-shape-cap"));
    expect(rows).toHaveLength(150);
    expect(rows.every((r) => r.Status === "active" && r.Published === "TRUE")).toBe(true);
    expect(new Set(rows.map((r) => r.Handle)).size).toBe(150);
  });

  it("navaal-shape-variants: 6 × 7 variants with barcodes from variant 3, and 1 × 100 with the only barcode on variant 60", () => {
    const all = load("navaal-shape-variants");
    const byHandle = new Map();
    for (const r of all) (byHandle.get(r.Handle) ?? byHandle.set(r.Handle, []).get(r.Handle)).push(r);
    expect(byHandle.size).toBe(7);
    const sizes = [...byHandle.values()].map((v) => v.length).sort((a, b) => a - b);
    expect(sizes).toEqual([7, 7, 7, 7, 7, 7, 100]);
    for (const variants of byHandle.values()) {
      expect(variants[0]["Option1 Name"]).toBe("Size");
      expect(variants[0]["Variant Barcode"]).toBe(""); // the first variant never has one — F3's shape
      const firstWith = variants.findIndex((v) => v["Variant Barcode"] !== "");
      if (variants.length === 100) expect(firstWith).toBe(59); // variant 60, past the walk's sample of 50
      else expect(firstWith).toBeGreaterThanOrEqual(2); // variant 3 or later
      expect(new Set(variants.map((v) => v["Variant SKU"])).size).toBe(variants.length);
    }
    expect(all.filter((r) => r.Title !== "").every((r) => r.Status === "active" && r.Published === "TRUE")).toBe(true);
  });

  it("every product row has an image, so the walk's findings are the shape's, not 'no image' everywhere", () => {
    for (const store of Object.keys(STORES)) {
      expect(firstRows(load(store)).every((r) => /^https:\/\/cdn\.shopify\.com\//.test(r["Image Src"])), store).toBe(true);
    }
  });
});
