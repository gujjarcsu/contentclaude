/**
 * P2.4 — indexability, with I/O. Reasoning in indexability.js.
 *
 * Runs at the end of the DAILY walk only (never inline from Home — it is up
 * to PAGE_SAMPLE storefront fetches), and only for a storefront that is not
 * password-locked. Two passes:
 *
 *   SITEMAP  /sitemap.xml, then each product child sitemap (capped), to a set
 *            of handles. Every non-draft row in the shop gets inSitemap set
 *            true or false — but only if at least one child parsed, so a
 *            sitemap that would not load leaves the column null, not false.
 *   PAGES    the PAGE_SAMPLE least-recently-checked non-draft rows, each
 *            fetched with redirects followed by hand (so hops are counted),
 *            a 6 s timeout, and the head parsed for robots and canonical.
 *
 * Never throws out of `runIndexability`. Counts only in logs; no URL.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { FETCH_TIMEOUT_MS, storefrontOrigin } from "./crawlerAccess.server.js";
import { PAGE_SAMPLE, SITEMAP_CHILD_CAP, MAX_HOPS, HEAD_CAP_CHARS, productSitemapUrls, handlesFromSitemap, parsePage } from "./indexability.js";

const UA = "Mozilla/5.0 (compatible; NavaalBot/1.0; +https://navaal.ai)";
const CHUNK = 500;

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: ctl.signal, redirect: "follow" });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Follow redirects by hand so the chain length is known. */
async function fetchPage(url) {
  let current = url;
  let hops = 0;
  for (;;) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let r;
    try {
      r = await fetch(current, { headers: { "user-agent": UA, accept: "text/html" }, signal: ctl.signal, redirect: "manual" });
    } catch {
      clearTimeout(t);
      return { status: null, finalUrl: current, hops, headers: {}, html: "" };
    }
    clearTimeout(t);
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc && hops < MAX_HOPS) {
      hops += 1;
      try {
        current = new URL(loc, current).toString();
      } catch {
        return { status: r.status, finalUrl: current, hops, headers: {}, html: "" };
      }
      continue;
    }
    const headers = { "x-robots-tag": r.headers.get("x-robots-tag") ?? "" };
    let html = "";
    if (r.status === 200 && /text\/html/i.test(r.headers.get("content-type") ?? "")) {
      try {
        html = (await r.text()).slice(0, HEAD_CAP_CHARS);
      } catch {
        html = "";
      }
    }
    return { status: r.status, finalUrl: current, hops, headers, html };
  }
}

/** Sitemap pass. Returns how many handles were listed, or null if unreadable. */
export async function checkSitemap(origin, shop) {
  const index = await fetchText(`${origin}/sitemap.xml`);
  if (!index) return null;
  const children = productSitemapUrls(index).slice(0, SITEMAP_CHILD_CAP);
  if (children.length === 0) return null;
  const handles = new Set();
  let parsed = 0;
  for (const child of children) {
    const xml = await fetchText(child);
    if (!xml) continue;
    parsed += 1;
    for (const h of handlesFromSitemap(xml)) handles.add(h);
  }
  if (parsed === 0) return null;

  const rows = await prisma.productWatch.findMany({
    where: { shop, NOT: { statusShop: "DRAFT" } },
    select: { productId: true, handle: true },
  });
  const present = rows.filter((r) => handles.has(String(r.handle).toLowerCase())).map((r) => r.productId);
  const absent = rows.filter((r) => !handles.has(String(r.handle).toLowerCase())).map((r) => r.productId);
  for (let i = 0; i < present.length; i += CHUNK) {
    await prisma.productWatch.updateMany({ where: { shop, productId: { in: present.slice(i, i + CHUNK) } }, data: { inSitemap: true } });
  }
  for (let i = 0; i < absent.length; i += CHUNK) {
    await prisma.productWatch.updateMany({ where: { shop, productId: { in: absent.slice(i, i + CHUNK) } }, data: { inSitemap: false } });
  }
  return { listed: handles.size, present: present.length, absent: absent.length };
}

/** Page pass over the least-recently-checked sample. */
export async function checkPages(origin, shop, { now = new Date(), sample = PAGE_SAMPLE } = {}) {
  // F6 (Phase 9) — products that need attention are checked first, then the
  // least-recently-checked of the rest, up to the plan's nightly sample.
  const base = { shop, NOT: { statusShop: "DRAFT" }, handle: { not: "" } };
  const order = [{ pageCheckedAt: { sort: "asc", nulls: "first" } }];
  const first = await prisma.productWatch.findMany({
    where: { ...base, NOT: [{ statusShop: "DRAFT" }, { attention: "{}" }] },
    orderBy: order,
    take: sample,
    select: { productId: true, handle: true },
  });
  const rest =
    first.length < sample
      ? await prisma.productWatch.findMany({
          where: { ...base, productId: { notIn: first.map((r) => r.productId) } },
          orderBy: order,
          take: sample - first.length,
          select: { productId: true, handle: true },
        })
      : [];
  const rows = [...first, ...rest];
  let checked = 0;
  let noindex = 0;
  let missing = 0;
  for (const r of rows) {
    const url = `${origin}/products/${encodeURIComponent(r.handle)}`;
    const page = await fetchPage(url);
    const parsed = parsePage(page);
    await prisma.productWatch.update({
      where: { shop_productId: { shop, productId: r.productId } },
      data: {
        pageCheckedAt: now,
        pageUrl: url,
        pageFinalUrl: page.finalUrl,
        pageStatus: page.status,
        pageHops: page.hops,
        noindex: page.status === null ? null : parsed.noindex,
        canonical: parsed.canonical,
      },
    });
    checked += 1;
    if (parsed.noindex) noindex += 1;
    if (page.status === 404 || page.status === 410) missing += 1;
  }
  return { checked, noindex, missing };
}

/**
 * Both passes for one shop. Skipped (and said so) while password-locked.
 * @returns {Promise<{ok: boolean, skipped: string|null, sitemap: object|null, pages: object|null}>}
 */
export async function runIndexability(graphql, shop, { now = new Date(), origin = null, passwordProtected = false, sample = PAGE_SAMPLE } = {}) {
  try {
    if (passwordProtected) return { ok: true, skipped: "password", sitemap: null, pages: null };
    const base = origin ?? (await storefrontOrigin(graphql, shop));
    if (!base) return { ok: false, skipped: "no origin", sitemap: null, pages: null };
    const sitemap = await checkSitemap(base, shop);
    const pages = await checkPages(base, shop, { now, sample });
    logger.info({ shop, event: "indexability_ran", sitemap, pages }, "indexability ran");
    return { ok: true, skipped: null, sitemap, pages };
  } catch (err) {
    logger.warn({ shop, err: err?.message, event: "indexability_failed" }, "indexability failed (non-fatal)");
    return { ok: false, skipped: null, sitemap: null, pages: null };
  }
}

/** Rows with the indexability columns, for the summary and the list. */
export async function indexabilityRows(shop) {
  return prisma.productWatch.findMany({
    where: { shop },
    select: {
      productId: true,
      title: true,
      handle: true,
      statusShop: true,
      inSitemap: true,
      pageCheckedAt: true,
      pageUrl: true,
      pageFinalUrl: true,
      pageStatus: true,
      pageHops: true,
      noindex: true,
      canonical: true,
    },
  });
}
