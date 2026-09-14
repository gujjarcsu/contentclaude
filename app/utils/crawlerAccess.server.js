/**
 * P2.1 — crawler access, with I/O. Reasoning in crawlerAccess.js.
 *
 * One robots.txt read and six GETs against the storefront's PRIMARY domain
 * (not the myshopify host, which a WAF rule would never be written for), each
 * with a short timeout, once per shop per daily walk. Stored as one
 * CrawlerAccess row per run so a change is a diff between rows, and the
 * interesting row is the one whose blocked set differs from yesterday's.
 *
 * Never throws out of `checkCrawlerAccess`: a storefront that will not answer
 * is recorded as unreachable for every agent, not as blocked — an outage is
 * not a robots rule, and reporting it as one would be a false alarm on the
 * merchant's first bad day.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { shopifyQuery } from "./shopifyQuery.server.js";
import { CRAWLERS, robotsBlocks, classifyAccess, diffAccess, blockedAgents } from "./crawlerAccess.js";

export const FETCH_TIMEOUT_MS = 6_000;
const DOMAIN_QUERY = `query primaryDomain { shop { primaryDomain { url } myshopifyDomain } }`;

async function fetchWithTimeout(url, init = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

/** The storefront's public origin, or null if Shopify will not say. */
export async function storefrontOrigin(graphql, shop) {
  const r = await shopifyQuery(graphql, DOMAIN_QUERY, {}, { shop, label: "primary domain" });
  const url = r.ok ? r.data?.shop?.primaryDomain?.url : null;
  if (url) return String(url).replace(/\/+$/, "");
  const my = r.ok ? r.data?.shop?.myshopifyDomain : null;
  return my ? `https://${my}` : null;
}

/**
 * Check every agent, persist the row, and say what changed since last time.
 *
 * @returns {Promise<{ok: boolean, origin: string|null, robotsSeen: boolean,
 *   results: object, blocked: string[], newlyBlocked: string[], newlyAllowed: string[]}>}
 */
export async function checkCrawlerAccess(graphql, shop, { now = new Date() } = {}) {
  const empty = { ok: false, origin: null, robotsSeen: false, results: {}, blocked: [], newlyBlocked: [], newlyAllowed: [] };
  try {
    const origin = await storefrontOrigin(graphql, shop);
    if (!origin) return empty;

    let robotsText = "";
    let robotsSeen = false;
    try {
      const r = await fetchWithTimeout(`${origin}/robots.txt`, { headers: { "user-agent": "NavaalBot/1.0 (+https://navaal.ai)" } });
      if (r.ok) {
        robotsText = await r.text();
        robotsSeen = true;
      }
    } catch {
      robotsSeen = false;
    }

    const results = {};
    for (const agent of CRAWLERS) {
      const robotsBlocked = robotsSeen ? robotsBlocks(robotsText, agent, "/") : false;
      let status = null;
      try {
        const r = await fetchWithTimeout(`${origin}/`, { method: "GET", headers: { "user-agent": `Mozilla/5.0 (compatible; ${agent}; +https://navaal.ai)` } });
        status = r.status;
      } catch {
        status = null;
      }
      results[agent] = { status, ...classifyAccess({ robotsBlocked, status }) };
    }

    const previous = await prisma.crawlerAccess.findFirst({
      where: { shop },
      orderBy: { checkedAt: "desc" },
      select: { results: true },
    });
    let prevResults = {};
    try {
      prevResults = previous ? JSON.parse(previous.results) : {};
    } catch {
      prevResults = {};
    }
    const blocked = blockedAgents(results);
    const { newlyBlocked, newlyAllowed } = diffAccess(prevResults, results);

    await prisma.crawlerAccess.create({
      data: { shop, checkedAt: now, results: JSON.stringify(results), blocked: blocked.length, robotsSeen },
    });

    if (newlyBlocked.length || newlyAllowed.length) {
      logger.info({ shop, event: "crawler_access_changed", newlyBlocked, newlyAllowed }, "crawler access changed");
    }
    return { ok: true, origin, robotsSeen, results, blocked, newlyBlocked, newlyAllowed };
  } catch (err) {
    logger.warn({ shop, err: err?.message, event: "crawler_access_failed" }, "crawler access check failed (non-fatal)");
    return empty;
  }
}

/** The latest state for a shop, and what changed in the last 24 hours. */
export async function latestCrawlerAccess(shop, { now = new Date() } = {}) {
  try {
    const rows = await prisma.crawlerAccess.findMany({
      where: { shop },
      orderBy: { checkedAt: "desc" },
      take: 2,
      select: { results: true, checkedAt: true, robotsSeen: true },
    });
    if (rows.length === 0) return { available: false, blocked: [], newlyBlocked: [], checkedAt: null };
    const parse = (r) => {
      try {
        return JSON.parse(r.results);
      } catch {
        return {};
      }
    };
    const latest = parse(rows[0]);
    const prev = rows[1] ? parse(rows[1]) : {};
    const recent = now.getTime() - new Date(rows[0].checkedAt).getTime() < 36 * 3600 * 1000;
    return {
      available: true,
      blocked: blockedAgents(latest),
      newlyBlocked: recent ? diffAccess(prev, latest).newlyBlocked : [],
      checkedAt: rows[0].checkedAt.toISOString(),
    };
  } catch {
    return { available: false, blocked: [], newlyBlocked: [], checkedAt: null };
  }
}
