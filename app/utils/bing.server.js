/**
 * P3.2 (Phase 8) — Bing Webmaster REST API, with I/O. Reasoning in bing.js.
 *
 * The merchant's key is stored exactly like the AI key (secretBox, AES-256-
 * GCM): never logged, never returned to the client, never in an error message
 * — not the key, not a prefix, not a length. Every request URL carries the key
 * as a query parameter, so no request URL is ever logged either; `redactKey`
 * runs over anything that could contain one.
 *
 * Nothing here is called for a shop that has not turned Bing on
 * (`Shop.bingEnabledAt`), and every caller checks REMEDIATION_LOCKED_SHOPS
 * first: a locked store is monitored, never written to — and a URL submission
 * is a write to the merchant's Bing account.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { encrypt, decrypt, isEnabled } from "./secretBox.server.js";
import { bingUrl, redactKey, unwrap, parseUserSites, parseUrlInfo, parseQuota, matchSite, SUBMIT_BATCH_MAX } from "./bing.js";

export const BING_TIMEOUT_MS = 12_000;

async function call(method, { key, params = {}, body = null }) {
  const url = bingUrl(method, { ...params, apikey: key });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), BING_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json; charset=utf-8" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    let json = null;
    try {
      json = await r.json();
    } catch {
      json = null;
    }
    if (!r.ok) {
      const msg = redactKey(String(json?.Message ?? json?.message ?? `HTTP ${r.status}`));
      return { ok: false, status: r.status, reason: msg, data: null };
    }
    return { ok: true, status: r.status, reason: null, data: unwrap(json) };
  } catch (err) {
    return { ok: false, status: null, reason: redactKey(err?.name === "AbortError" ? "timeout" : err?.message ?? "failed"), data: null };
  } finally {
    clearTimeout(t);
  }
}

/** Booleans and timestamps only — the only shape the Settings card may see. */
export async function bingKeyStatus(shop) {
  const row = await prisma.shop.findUnique({
    where: { shop },
    select: { bingKeyCiphertext: true, bingKeyValidatedAt: true, bingSiteUrl: true, bingEnabledAt: true },
  });
  return {
    saved: !!row?.bingKeyCiphertext,
    validatedAt: row?.bingKeyValidatedAt?.toISOString() ?? null,
    siteUrl: row?.bingSiteUrl ?? null,
    enabled: !!row?.bingEnabledAt,
    encryptionAvailable: isEnabled(),
  };
}

/** Decrypt for the duration of one call. The key never leaves this function's scope except into `fn`. */
async function withKey(shop, fn) {
  const row = await prisma.shop.findUnique({ where: { shop }, select: { bingKeyCiphertext: true, bingKeyIv: true, bingKeyTag: true } });
  if (!row?.bingKeyCiphertext) return { ok: false, reason: "no key" };
  let key;
  try {
    key = decrypt({ ciphertext: row.bingKeyCiphertext, iv: row.bingKeyIv, tag: row.bingKeyTag });
  } catch {
    return { ok: false, reason: "key unreadable" };
  }
  return fn(key);
}

/**
 * Validate a pasted key by listing the sites it can see, save it encrypted,
 * and pick the site that is this storefront. Returns sites (URLs only) so the
 * card can show which one matched. The raw key is read from the form, passed
 * here, and never touched again.
 */
export async function saveBingKey(shop, rawKey, { storefrontOrigin = null } = {}) {
  const key = String(rawKey ?? "").trim();
  if (!key) return { ok: false, reason: "Paste your Bing Webmaster API key." };
  if (!isEnabled()) return { ok: false, reason: "Key storage is not configured on this deployment." };
  const r = await call("GetUserSites", { key });
  if (!r.ok) {
    logger.info({ shop, event: "bing_key_rejected", status: r.status }, "bing key rejected");
    return { ok: false, reason: r.status === 401 || r.status === 403 ? "Bing did not accept that key." : `Bing did not answer (${r.reason}).` };
  }
  const sites = parseUserSites(r.data);
  const match = storefrontOrigin ? matchSite(sites, storefrontOrigin) : null;
  const { ciphertext, iv, tag } = encrypt(key);
  await prisma.shop.update({
    where: { shop },
    data: {
      bingKeyCiphertext: ciphertext,
      bingKeyIv: iv,
      bingKeyTag: tag,
      bingKeyValidatedAt: new Date(),
      bingSiteUrl: match?.url ?? null,
    },
  });
  logger.info({ shop, event: "bing_key_saved", sites: sites.length, matched: !!match }, "bing key saved");
  return { ok: true, sites: sites.map((s) => s.url), siteUrl: match?.url ?? null };
}

export async function removeBingKey(shop) {
  await prisma.shop.update({
    where: { shop },
    data: { bingKeyCiphertext: null, bingKeyIv: null, bingKeyTag: null, bingKeyValidatedAt: null, bingSiteUrl: null, bingEnabledAt: null },
  });
  return { ok: true };
}

/** The merchant's switch. Off = nothing is ever submitted or read. */
export async function setBingEnabled(shop, enabled) {
  const row = await prisma.shop.findUnique({ where: { shop }, select: { bingKeyCiphertext: true, bingSiteUrl: true } });
  if (enabled && (!row?.bingKeyCiphertext || !row?.bingSiteUrl)) return { ok: false, reason: "Add a key that can see this store's site first." };
  await prisma.shop.update({ where: { shop }, data: { bingEnabledAt: enabled ? new Date() : null } });
  return { ok: true };
}

/** Submit up to SUBMIT_BATCH_MAX URLs. Returns { ok, submitted } — never the key. */
export async function submitUrls(shop, siteUrl, urls) {
  const list = [...new Set((urls ?? []).filter(Boolean))].slice(0, SUBMIT_BATCH_MAX);
  if (list.length === 0) return { ok: true, submitted: 0 };
  return withKey(shop, async (key) => {
    const r = await call("SubmitUrlBatch", { key, body: { siteUrl, urlList: list } });
    if (!r.ok) {
      logger.warn({ shop, event: "bing_submit_failed", status: r.status, reason: r.reason, count: list.length }, "bing submit failed");
      return { ok: false, submitted: 0, reason: r.reason };
    }
    logger.info({ shop, event: "bing_submitted", count: list.length }, "bing urls submitted");
    return { ok: true, submitted: list.length };
  });
}

/** Bing's index record for one URL: last crawl, discovery, status. */
export async function urlInfo(shop, siteUrl, url) {
  return withKey(shop, async (key) => {
    const r = await call("GetUrlInfo", { key, params: { siteUrl, url } });
    if (!r.ok) return { ok: false, reason: r.reason, info: null };
    return { ok: true, info: parseUrlInfo(r.data) };
  });
}

export async function submissionQuota(shop, siteUrl) {
  return withKey(shop, async (key) => {
    const r = await call("GetUrlSubmissionQuota", { key, params: { siteUrl } });
    return r.ok ? { ok: true, ...parseQuota(r.data) } : { ok: false, reason: r.reason, daily: 0, monthly: 0 };
  });
}

/** Per-page query stats — impressions and clicks with their own positions. */
export async function pageQueryStats(shop, siteUrl, page) {
  return withKey(shop, async (key) => {
    const r = await call("GetPageQueryStats", { key, params: { siteUrl, page } });
    return r.ok ? { ok: true, rows: Array.isArray(r.data) ? r.data : [] } : { ok: false, reason: r.reason, rows: [] };
  });
}
