/**
 * P2.4 — indexability, the pure half.
 *
 * The brief names four things: noindex, canonical mismatch, sitemap
 * membership, redirect chains. Snippet eligibility is Google's stated
 * prerequisite for AI Overviews and AI Mode, and every one of these decides
 * whether a product page can be a snippet at all.
 *
 * Search Console's URL Inspection API would say all four in one call — and
 * needs a Google OAuth connection this app does not have, a verified property
 * the merchant may not have, and a 2,000-inspections-a-day quota. So this
 * reads the storefront the way a crawler does: the sitemap for every product
 * once a day, and a rotating sample of product pages for the rest. What it
 * cannot see (Google's chosen canonical, as opposed to the page's declared
 * one) it does not claim.
 *
 * Three grades, never a verdict (L6):
 *   BLOCKING   the page cannot be indexed as it stands — 404/410, noindex.
 *   DEGRADING  indexed, but worse — absent from the sitemap, a canonical that
 *              points elsewhere, a redirect chain.
 * Null columns mean "not checked yet", and produce nothing. A password-locked
 * storefront is not checked at all: every page is the password page.
 *
 * PURE. Fetching lives in indexability.server.js.
 */
// The same two words catalogueWatch.js GRADE uses; spelled here rather than
// imported so the two pure modules do not import each other in a cycle.
const GRADE = Object.freeze({ BLOCKING: "blocking", DEGRADING: "degrading" });

/** Product pages sampled per shop per daily run. Oldest-checked first. */
export const PAGE_SAMPLE = 20;
/** Child sitemaps read per shop per run (Shopify: ~5,000 products each). */
export const SITEMAP_CHILD_CAP = 10;
/** Redirects followed before the chain is called a chain and stopped. */
export const MAX_HOPS = 5;
/** Only the head matters; a product page can be 300 KB of theme. */
export const HEAD_CAP_CHARS = 200_000;

/** Every <loc> in a sitemap or sitemap index, in order. */
export function parseLocs(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(String(xml ?? "")))) out.push(decodeXml(m[1]));
  return out;
}

function decodeXml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Child sitemaps that hold products, from a sitemap index. */
export function productSitemapUrls(indexXml) {
  return parseLocs(indexXml).filter((u) => /sitemap_products/i.test(u));
}

/** The product handle a storefront URL points at, or null. */
export function handleFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/products\/([^/?#]+)\/?$/);
    return m ? decodeURIComponent(m[1]).toLowerCase() : null;
  } catch {
    return null;
  }
}

/** All product handles a product sitemap (urlset) lists. */
export function handlesFromSitemap(urlsetXml) {
  const set = new Set();
  for (const loc of parseLocs(urlsetXml)) {
    const h = handleFromUrl(loc);
    if (h) set.add(h);
  }
  return set;
}

/** Attributes of one HTML start tag, lower-cased names. Order-independent. */
function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/**
 * What a fetched page says about itself.
 *
 * @param {{status: number|null, headers?: Record<string, string>, html?: string}} page
 * @returns {{noindex: boolean, canonical: string|null}}
 */
export function parsePage({ status, headers = {}, html = "" }) {
  const head = String(html ?? "").slice(0, HEAD_CAP_CHARS);
  const robotsHeader = String(headers?.["x-robots-tag"] ?? "");
  let noindex = /\bnoindex\b/i.test(robotsHeader);
  let canonical = null;
  const tagRe = /<(meta|link)\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(head))) {
    const a = attrs(m[0]);
    const tag = m[1].toLowerCase();
    if (tag === "meta" && /^(robots|googlebot)$/i.test(a.name ?? "") && /\bnoindex\b/i.test(a.content ?? "")) noindex = true;
    if (tag === "link" && /\bcanonical\b/i.test(a.rel ?? "") && a.href && canonical === null) canonical = a.href.trim();
  }
  return { noindex: status === 200 ? noindex : noindex, canonical };
}

/** Same page? Scheme, host, path — ignoring trailing slash, query and hash. */
export function sameUrl(a, b) {
  const norm = (u) => {
    try {
      const x = new URL(u);
      return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, "")}`;
    } catch {
      return null;
    }
  };
  const na = norm(a);
  const nb = norm(b);
  return na !== null && na === nb;
}

/**
 * Findings for one ProductWatch row's indexability columns. Nothing until
 * something was checked; nothing for a draft.
 */
export function indexabilityFindings(row) {
  const f = [];
  if (!row) return f;
  if (String(row.statusShop ?? "").toUpperCase() === "DRAFT") return f;
  const checked = row.pageCheckedAt != null;
  const add = (grade, field, note) => f.push({ surface: null, grade, field, note });

  if (checked && (row.pageStatus === 404 || row.pageStatus === 410)) {
    add(GRADE.BLOCKING, "page", `The product's page answers ${row.pageStatus}. Nothing can index a page that is not there.`);
  }
  if (checked && row.noindex === true) {
    add(
      GRADE.BLOCKING,
      "noindex",
      "The page tells search engines not to index it — a robots meta tag or header. Usually a theme setting, an app, or Shopify's own hide-from-search toggle on the product.",
    );
  }
  if (row.inSitemap === false) {
    add(
      GRADE.DEGRADING,
      "sitemap",
      "Not in your sitemap. Google can still reach it through links, but the sitemap is how it learns a page exists and when it changed.",
    );
  }
  if (checked && row.canonical && row.pageFinalUrl && !sameUrl(row.canonical, row.pageFinalUrl)) {
    add(
      GRADE.DEGRADING,
      "canonical",
      `The page names a different address as the original: ${row.canonical}. Search engines show that address instead of this one.`,
    );
  }
  if (checked && Number(row.pageHops ?? 0) >= 2) {
    add(
      GRADE.DEGRADING,
      "redirects",
      `Reaching this page takes ${row.pageHops} redirects. One is fine; a chain costs crawl time and some of the signal passes are lost at each hop.`,
    );
  }
  return f;
}

/**
 * Counts for the summary and the Home line.
 * @param {Array<object>} rows ProductWatch rows with the indexability columns
 */
export function indexabilitySummary(rows) {
  const s = { checked: 0, sitemapKnown: 0, cannotIndex: 0, notInSitemap: 0, canonicalElsewhere: 0, chains: 0, withFindings: 0 };
  for (const r of rows ?? []) {
    if (r?.pageCheckedAt != null) s.checked++;
    if (r?.inSitemap != null) s.sitemapKnown++;
    const f = indexabilityFindings(r);
    if (f.length) s.withFindings++;
    if (f.some((x) => x.grade === GRADE.BLOCKING)) s.cannotIndex++;
    if (f.some((x) => x.field === "sitemap")) s.notInSitemap++;
    if (f.some((x) => x.field === "canonical")) s.canonicalElsewhere++;
    if (f.some((x) => x.field === "redirects")) s.chains++;
  }
  return s;
}

/** The Home line, or null. Only the blocking count earns a line. */
export function indexabilityLine(s) {
  const n = Number(s?.cannotIndex ?? 0);
  if (!n) return null;
  return `${n} product ${n === 1 ? "page cannot" : "pages cannot"} be indexed by search engines as ${n === 1 ? "it stands" : "they stand"}.`;
}
