/**
 * P2.4 — indexability read from the storefront, graded, never guessed.
 *
 * Null means "not checked", never "fine" — that rule is what most of these
 * hold. And nothing here claims what only Search Console could say: the
 * canonical compared is the page's DECLARED one, against where the fetch
 * landed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  PAGE_SAMPLE,
  MAX_HOPS,
  parseLocs,
  productSitemapUrls,
  handleFromUrl,
  handlesFromSitemap,
  parsePage,
  sameUrl,
  indexabilityFindings,
  indexabilitySummary,
  indexabilityLine,
} from "../../app/utils/indexability.js";
import { homeAttentionLines } from "../../app/utils/catalogueWatch.js";

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://shop.example/sitemap_products_1.xml?from=1&amp;to=999</loc></sitemap>
  <sitemap><loc>https://shop.example/sitemap_pages_1.xml</loc></sitemap>
  <sitemap><loc>https://shop.example/sitemap_collections_1.xml</loc></sitemap>
</sitemapindex>`;

const URLSET = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.example/</loc></url>
  <url><loc>https://shop.example/products/enamel-camp-mug</loc><lastmod>2026-09-01</lastmod></url>
  <url><loc>https://shop.example/products/Wool-Throw</loc></url>
  <url><loc>https://shop.example/collections/all</loc></url>
</urlset>`;

describe("sitemaps, the Shopify shape", () => {
  it("reads every loc, decoding entities", () => {
    expect(parseLocs(INDEX)[0]).toBe("https://shop.example/sitemap_products_1.xml?from=1&to=999");
    expect(parseLocs("")).toEqual([]);
  });

  it("keeps only product child sitemaps", () => {
    expect(productSitemapUrls(INDEX)).toEqual(["https://shop.example/sitemap_products_1.xml?from=1&to=999"]);
  });

  it("turns product URLs into handles, lower-cased, and ignores everything else", () => {
    expect(handleFromUrl("https://shop.example/products/enamel-camp-mug")).toBe("enamel-camp-mug");
    expect(handleFromUrl("https://shop.example/en-ca/products/enamel-camp-mug/")).toBe("enamel-camp-mug");
    expect(handleFromUrl("https://shop.example/collections/all")).toBeNull();
    expect([...handlesFromSitemap(URLSET)]).toEqual(["enamel-camp-mug", "wool-throw"]);
  });
});

describe("what a page says about itself", () => {
  it("finds noindex in a meta tag whatever the attribute order, and in the header", () => {
    expect(parsePage({ status: 200, html: `<head><meta name="robots" content="noindex, follow"></head>` }).noindex).toBe(true);
    expect(parsePage({ status: 200, html: `<head><meta content='NOINDEX' name='googlebot'></head>` }).noindex).toBe(true);
    expect(parsePage({ status: 200, html: `<head><meta name="robots" content="index, follow"></head>` }).noindex).toBe(false);
    expect(parsePage({ status: 200, headers: { "x-robots-tag": "noindex" }, html: "" }).noindex).toBe(true);
    expect(parsePage({ status: 200, html: `<meta name="description" content="please noindex me">` }).noindex).toBe(false);
  });

  it("takes the first canonical link, either attribute order", () => {
    expect(parsePage({ status: 200, html: `<link rel="canonical" href="https://shop.example/products/a">` }).canonical).toBe("https://shop.example/products/a");
    expect(parsePage({ status: 200, html: `<link href='https://shop.example/products/b' rel='canonical'>` }).canonical).toBe("https://shop.example/products/b");
    expect(parsePage({ status: 200, html: `<link rel="stylesheet" href="/x.css">` }).canonical).toBeNull();
  });

  it("sameUrl ignores trailing slash, query and hash, not host or path", () => {
    expect(sameUrl("https://shop.example/products/a/", "https://shop.example/products/a?variant=1#x")).toBe(true);
    expect(sameUrl("https://shop.example/products/a", "https://shop.example/products/b")).toBe(false);
    expect(sameUrl("https://shop.example/products/a", "https://other.example/products/a")).toBe(false);
    expect(sameUrl("not a url", "https://shop.example/")).toBe(false);
  });
});

describe("findings — null is 'not checked', never 'fine'", () => {
  const checked = (over = {}) => ({
    statusShop: "ACTIVE",
    inSitemap: true,
    pageCheckedAt: new Date("2026-09-14"),
    pageUrl: "https://shop.example/products/a",
    pageFinalUrl: "https://shop.example/products/a",
    pageStatus: 200,
    pageHops: 0,
    noindex: false,
    canonical: "https://shop.example/products/a",
    ...over,
  });
  const fields = (f) => f.map((x) => `${x.grade}:${x.field}`);

  it("an unchecked row says nothing", () => {
    expect(indexabilityFindings({ statusShop: "ACTIVE" })).toEqual([]);
    expect(indexabilityFindings({ statusShop: "ACTIVE", inSitemap: null, pageCheckedAt: null, noindex: null })).toEqual([]);
  });

  it("a clean checked row says nothing", () => {
    expect(indexabilityFindings(checked())).toEqual([]);
  });

  it("a draft is never graded, whatever its columns say", () => {
    expect(indexabilityFindings(checked({ statusShop: "DRAFT", noindex: true, inSitemap: false }))).toEqual([]);
  });

  it("noindex and a 404 are BLOCKING", () => {
    expect(fields(indexabilityFindings(checked({ noindex: true })))).toEqual(["blocking:noindex"]);
    expect(fields(indexabilityFindings(checked({ pageStatus: 404 })))).toEqual(["blocking:page"]);
    expect(fields(indexabilityFindings(checked({ pageStatus: 410 })))).toEqual(["blocking:page"]);
  });

  it("absent from the sitemap is DEGRADING, and needs no page check", () => {
    expect(fields(indexabilityFindings({ statusShop: "ACTIVE", inSitemap: false }))).toEqual(["degrading:sitemap"]);
  });

  it("a canonical pointing elsewhere is DEGRADING and names the address; the same page with a query is not", () => {
    const f = indexabilityFindings(checked({ canonical: "https://shop.example/products/b" }));
    expect(fields(f)).toEqual(["degrading:canonical"]);
    expect(f[0].note).toContain("https://shop.example/products/b");
    expect(indexabilityFindings(checked({ canonical: "https://shop.example/products/a?variant=2" }))).toEqual([]);
  });

  it("one redirect is fine; two is a chain", () => {
    expect(indexabilityFindings(checked({ pageHops: 1 }))).toEqual([]);
    expect(fields(indexabilityFindings(checked({ pageHops: 2 })))).toEqual(["degrading:redirects"]);
    expect(MAX_HOPS).toBeGreaterThanOrEqual(3);
  });

  it("every finding has a grade, a field and a note, and none is a verdict word", () => {
    const worst = indexabilityFindings(checked({ noindex: true, inSitemap: false, canonical: "https://x.example/", pageHops: 3 }));
    expect(worst).toHaveLength(4);
    for (const x of worst) {
      expect(["blocking", "degrading"]).toContain(x.grade);
      expect(x.note.length).toBeGreaterThan(20);
      expect(x.note).not.toMatch(/disqualif|ineligible/i);
    }
  });

  it("the summary counts what it says it counts, and only blocking earns a Home line", () => {
    const rows = [checked(), checked({ noindex: true }), checked({ inSitemap: false }), { statusShop: "ACTIVE" }];
    const s = indexabilitySummary(rows);
    expect(s).toMatchObject({ checked: 3, sitemapKnown: 3, cannotIndex: 1, notInSitemap: 1, withFindings: 2 });
    expect(indexabilityLine(s)).toBe("1 product page cannot be indexed by search engines as it stands.");
    expect(indexabilityLine({ cannotIndex: 2 })).toBe("2 product pages cannot be indexed by search engines as they stand.");
    expect(indexabilityLine({ cannotIndex: 0 })).toBeNull();
    const lines = homeAttentionLines({ needAttention: 0, blocking: 0, crawler: { blocked: [] }, indexability: s });
    expect(lines).toEqual(["1 product page cannot be indexed by search engines as it stands."]);
  });
});

describe("wiring — daily only, never inline, never on a locked storefront", () => {
  const srv = code(readFileSync("app/utils/indexability.server.js", "utf8"));
  const watch = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
  const page = code(readFileSync("app/routes/app.attention.jsx", "utf8"));

  it("follows redirects by hand so hops are counted, with a timeout on every fetch", () => {
    expect(srv).toMatch(/redirect: "manual"/);
    expect(srv).toMatch(/AbortController/);
    expect(srv).not.toMatch(/searchconsole\.googleapis\.com/);
  });

  it("is skipped while the storefront is password-locked", () => {
    expect(srv).toMatch(/skipped: "password"/);
  });

  it("runs from the daily walk with the sample bounded, and the walk stores the product status it needs", () => {
    expect(watch).toMatch(/runIndexability\(/);
    expect(watch).toMatch(/statusShop: /);
    expect(PAGE_SAMPLE).toBeLessThanOrEqual(25);
  });

  it("the page lists indexability findings and names the method", () => {
    expect(page).toMatch(/indexabilityList/);
    expect(page).toMatch(/Can search engines index the pages\?/);
    expect(page).toMatch(/not from Search\s+Console/);
  });
});
