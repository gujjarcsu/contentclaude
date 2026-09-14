#!/usr/bin/env node
/**
 * Phase 10 Part C (backlog F2) — the navaal-shape-* catalogues, as Shopify
 * product-import CSVs. LOCAL ONLY. Writes files under tools/proof/fixtures/
 * shapes/; touches no store, no database, no API.
 *
 * Why CSV and not the Admin API: Shopify's CSV import publishes to the Online
 * Store from its own `Published` column, and creates variants with barcodes
 * from plain rows. Doing the same through the API needs `write_publications`,
 * a scope this app deliberately does not hold (Phase 7 decision). The ttv
 * stores were built from a CSV the same way, so the path is the one CW
 * already uses: Products → Import → this file.
 *
 * The rows come from the SAME fixtures the matrix runs
 * (tests/fixtures/storeShapes.js), so a store built from a file here is the
 * fixture made real — the point of F2.
 *
 *   node scripts/shape-csv.mjs            # writes the five files
 *   node scripts/shape-csv.mjs --check    # exits 1 if any file is stale
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { SHAPES } from "../tests/fixtures/storeShapes.js";

const OUT = "tools/proof/fixtures/shapes";
const IMAGE = "https://cdn.shopify.com/s/files/1/0668/9069/4759/files/stoneware-mug-400ml.png"; // one of our own dev-store files

export const HEADER = [
  "Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published",
  "Option1 Name", "Option1 Value",
  "Variant SKU", "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy", "Variant Fulfillment Service",
  "Variant Price", "Variant Requires Shipping", "Variant Taxable", "Variant Barcode",
  "Image Src", "Image Position", "Image Alt Text", "SEO Title", "SEO Description", "Status",
];

/** The five stores and what each imports. `published` is the Online Store column. */
export const STORES = Object.freeze({
  "navaal-shape-drafts": { file: "alldraft.csv", products: SHAPES.ALL_DRAFT, published: false, note: "20 drafts, none on the Online Store" },
  "navaal-shape-variants": { file: "variants.csv", products: [...SHAPES.VARIANT_HEAVY_BARCODES, ...SHAPES.ONE_PRODUCT_100_VARIANTS], published: true, note: "6 × 7-variant products with barcodes from variant 3; 1 × 100 variants with the only barcode on variant 60" },
  "navaal-shape-fr": { file: "fr.csv", products: SHAPES.NON_ENGLISH, published: true, note: "8 French products" },
  "navaal-shape-b2b": { file: "b2b.csv", products: SHAPES.B2B_ONLY, published: false, note: "12 active trade-only products, not on the Online Store" },
  "navaal-shape-cap": { file: "cap.csv", products: SHAPES.ABOVE_PLAN_CAP, published: true, note: "150 products — above the Free cap of 100" },
});

const q = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const numericId = (gid) => String(gid).split("/").pop();

/** One product → one row per variant, Shopify's import shape. */
export function rowsFor(p, { published }) {
  const handle = `${slug(p.title)}-${numericId(p.id)}`;
  const variants = p.variants?.length ? p.variants : [{ title: "Default Title", price: "24.00", barcode: "" }];
  const optionName = p.options?.[0]?.name ?? "Title";
  const body = p.description ? `<p>${p.description}</p>` : "";
  return variants.map((v, i) =>
    i === 0
      ? [handle, p.title, body, p.vendor, p.productType, (p.tags ?? []).join(", "), published ? "TRUE" : "FALSE", optionName, v.title ?? "Default Title", `${handle}-${i + 1}`, "shopify", 10, "deny", "manual", v.price ?? "24.00", "TRUE", "TRUE", v.barcode ?? "", IMAGE, 1, "", p.seoTitle ?? "", p.seoDescription ?? "", String(p.status).toLowerCase()]
      : [handle, "", "", "", "", "", "", "", v.title, `${handle}-${i + 1}`, "shopify", 10, "deny", "manual", v.price ?? "24.00", "TRUE", "TRUE", v.barcode ?? "", "", "", "", "", "", ""],
  );
}

export function csvFor(store) {
  const spec = STORES[store];
  const lines = [HEADER.join(",")];
  for (const p of spec.products) for (const r of rowsFor(p, spec)) lines.push(r.map(q).join(","));
  return lines.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("shape-csv.mjs")) {
  const check = process.argv.includes("--check");
  mkdirSync(OUT, { recursive: true });
  let stale = 0;
  for (const [store, spec] of Object.entries(STORES)) {
    const path = `${OUT}/${spec.file}`;
    const next = csvFor(store);
    if (check) {
      const cur = existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : "";
      if (cur !== next) {
        stale += 1;
        console.log(`STALE ${path}`);
      }
      continue;
    }
    writeFileSync(path, next);
    console.log(`${store}: ${path} — ${next.split("\n").length - 2} rows (${spec.note})`);
  }
  if (check) {
    console.log(stale ? `${stale} stale file(s) — run node scripts/shape-csv.mjs` : "all five CSVs match the fixtures");
    process.exit(stale ? 1 : 0);
  }
}
