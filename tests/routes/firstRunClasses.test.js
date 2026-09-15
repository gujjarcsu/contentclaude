/**
 * Phase 8 Part A — the fifteen confusions CW counted on a clean install
 * (FR0–FR14 in docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md),
 * fixed as classes and held here as classes:
 *
 *   A2  the name is read per session; a first visit is never "back"
 *   A3  every writer of GeneratedContent clears every content-derived cache
 *   A4  one unit — credits — on every screen a merchant reads
 *   A5  buttons do what they say; the Free primary does what Free can do
 *   A6  spent credits never display as 0%; the product row shows its own score
 *   A7  "Live" is gone; published content on a non-active product says so
 *
 * The gate for this work is CW's second count, not this file. This file is
 * what stops the count going back up.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "../helpers/code.js";
import { quotaPct } from "../../app/utils/quota.js";
import { PRODUCT_STATE_LABEL } from "../../app/utils/productState.js";

const src = (p) => code(readFileSync(p, "utf8"));
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
};

describe("A2 — the name comes from Shopify, per session; a first visit is not 'back'", () => {
  it("the live-name cache is keyed by session and short-lived, not the install's one-hour value", () => {
    const s = src("app/utils/shopName.server.js");
    expect(s).toMatch(/sessionId/);
    expect(s).toMatch(/SHOP_NAME_TTL_SECONDS = 120/);
    expect(s).not.toMatch(/SHOP_NAME_TTL_SECONDS = 3600/);
  });

  it("Home passes the session id and greets a first visit with Welcome, not Welcome back", () => {
    const h = src("app/routes/app._index.jsx");
    expect(h).toMatch(/getLiveShopName\(admin, shop, \{ sessionId: session\?\.id/);
    expect(h).toMatch(/firstVisit \? "Welcome" : "Welcome back"/);
    expect(h).toMatch(/FIRST_VISIT_MS = 24 \* 3600 \* 1000/);
    expect(h).not.toMatch(/`Welcome back, \$\{storeName\}!`/);
  });
});

describe("A3 — one invalidator, called by every writer", () => {
  it("every file that writes GeneratedContent calls invalidateContentCaches", () => {
    const writers = walk("app").filter((p) => /generatedContent\.(upsert|create|createMany|update|updateMany|delete|deleteMany)\(/.test(src(p)));
    expect(writers.length).toBeGreaterThanOrEqual(4);
    const offenders = writers.filter((p) => !/invalidateContentCaches\(/.test(src(p)) && !/app\.collections\.jsx$/.test(p));
    expect(offenders, "writers without invalidateContentCaches").toEqual([]);
  });

  it("the invalidator clears the store scan, the catalogue join and the gaps cache", () => {
    const s = src("app/utils/storeScanCache.server.js");
    expect(s).toMatch(/export async function invalidateContentCaches/);
    expect(s).toMatch(/invalidateStoreScan\(shop\)/);
    expect(s).toMatch(/invalidateCatalogGaps\(shop\)/);
    expect(s).toMatch(/catalogueContentKey\(shop\)/);
  });

  it("the first-run writer is one of them, and no longer clears only the gaps", () => {
    const q = src("app/utils/quickStart.server.js");
    expect(q).toMatch(/await invalidateContentCaches\(shop\)/);
    expect(q).not.toMatch(/invalidateCatalogGaps/);
  });
});

describe("A4 — one unit: credits", () => {
  const files = [...walk("app/routes"), ...walk("app/components")];

  it("no merchant-visible string or JSX text says 'generation(s)' — 12-OFFER §1 forbids mixing the units", () => {
    const hits = [];
    for (const p of files) {
      const s = src(p);
      // quoted strings and template literals
      for (const m of s.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
        if (/\bgenerations?\b/i.test(m[2]) && !/generation(Job|Queue|_)/.test(m[2])) hits.push(`${p}: ${m[2].slice(0, 60)}`);
      }
      // JSX text between tags
      for (const m of s.matchAll(/>([^<>{}]*\bgenerations?\b[^<>{}]*)</gi)) hits.push(`${p}: ${m[1].trim().slice(0, 60)}`);
    }
    expect(hits).toEqual([]);
  });

  it("the usage card is labelled Monthly credits on every screen that has one", () => {
    for (const p of ["app/routes/app._index.jsx", "app/routes/app.products.jsx", "app/routes/app.plans.jsx", "app/routes/app.blog.jsx"]) {
      expect(src(p), p).toMatch(/Monthly credits/);
      expect(src(p), p).not.toMatch(/Monthly Usage|Monthly Generations/);
    }
  });

  it("the first screen says credits, and never re-announces a charge for a draft that already exists", () => {
    const s = src("app/components/StartState.jsx");
    expect(src("app/utils/startCopy.js")).toMatch(/no credits charged again/);
    expect(s).toMatch(/draftedIds/);
    expect(s).not.toMatch(/allowanceWord/);
    expect(src("app/utils/quickStart.server.js")).toMatch(/export async function recentDraftIds/);
  });
});

describe("A5 — buttons do what they say", () => {
  const p = src("app/routes/app.products.jsx");

  it("a row's Review button opens Review", () => {
    expect(p).toMatch(/navigate\(rowActionLabel\(id, description\) === "Review" \? `\/app\/review\?product=\$\{numericId\}` : `\/app\/products\/\$\{numericId\}`\)/);
    expect(p).toMatch(/e\?\.stopPropagation\?\.\(\);/); // FR13, third time: the click must not bubble into the row
  });

  it("on Free the primary writes drafts through the per-product path; the bulk run is a secondary that names what it needs", () => {
    expect(p).toMatch(/Write the next \{quickBatch\} draft/);
    expect(p).toMatch(/actionType === "quickBatch"/);
    expect(p).toMatch(/runQuickStartOne\(\{ admin, shop, productId, mode: "generate" \}\)/);
    expect(p).toMatch(/needs Starter/);
    expect(p).not.toMatch(/`Optimize store \(\$\{notOptimized\}\) · Starter`/);
  });

  it("an empty store does not dead-end: Shopify opens in a new tab and there is a way back in", () => {
    const s = src("app/components/StartState.jsx");
    expect(s).toMatch(/url: "shopify:\/\/admin\/products\/new",\s*target: "_blank"/);
    expect(s).toMatch(/secondaryAction=\{\{ content: "I've added one — check again", onAction: onRetry \}\}/);
    expect(s).not.toMatch(/target: "_top"/);
  });
});

describe("A6 — the score, labelled and not scary", () => {
  it("the headline is labelled GEO, framed as a start, and Traditional SEO is said to be excluded", () => {
    const s = src("app/components/StartState.jsx");
    expect(s).toMatch(/Your AI-search \(GEO\) score/);
    expect(s).toMatch(/Most stores start here/);
    expect(s).toMatch(/AI search \(GEO\) — the score above/);
    expect(s).toMatch(/Traditional SEO — for comparison, not part of the score/);
    expect(s).not.toMatch(/Your store scores \{scan\.storeScore\}\/100/);
  });

  it("a product row shows its own score, labelled as the product's", () => {
    expect(src("app/components/StartState.jsx")).toMatch(/This product: \{scoreBefore\}\/100/);
  });

  it("spent credits never display as 0%", () => {
    expect(quotaPct(19, 4000)).toBe(1);
    expect(quotaPct(1, 100000)).toBe(1);
    expect(quotaPct(0, 4000)).toBe(0);
    expect(quotaPct(3, 100)).toBe(3);
    expect(quotaPct(4000, 4000)).toBe(100);
  });
});

describe("A7 — Live means live on the storefront", () => {
  it("the content-state label no longer says Live", () => {
    for (const v of Object.values(PRODUCT_STATE_LABEL)) expect(v).not.toMatch(/\bLive\b/);
    expect(PRODUCT_STATE_LABEL.published).toBe("Published");
  });

  it("the Products badge adds the product's own Shopify status when it is not active", () => {
    const p = src("app/routes/app.products.jsx");
    expect(p).toMatch(/statusById\[productId\]/);
    expect(p).toMatch(/not on your storefront/);
  });
});
