/**
 * P3.2 (Phase 8) — Bing Webmaster REST API, the pure half.
 *
 * Verified 2026-09-14 (Bing Webmaster blog, Microsoft Learn IWebmasterApi):
 *   base   https://ssl.bing.com/webmaster/api.svc/json/<Method>
 *   auth   ?apikey=<key> on every request — the key is a query parameter, so
 *          a URL with the key in it is a secret and must never be logged.
 *   GET    GetUserSites · GetUrlSubmissionQuota?siteUrl= · GetUrlInfo?siteUrl=&url=
 *          GetPageQueryStats?siteUrl=&page=
 *   POST   SubmitUrlBatch  body { siteUrl, urlList } (≤500 per call)
 *   shape  { "d": <payload> } — null for submissions
 * SOAP/POX retired 31 Aug 2026; REST only.
 *
 * PURE. Fetching lives in bing.server.js.
 */

export const BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
export const SUBMIT_BATCH_MAX = 500;

/** Build a request URL. The key goes in; the result is a secret. */
export function bingUrl(method, params = {}) {
  const u = new URL(`${BING_BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  return u.toString();
}

/** The same URL with the key replaced, for logs and errors. */
export function redactKey(text, key = null) {
  let s = String(text ?? "").replace(/([?&]apikey=)[^&\s]*/gi, "$1[redacted]");
  // A9 (Phase 12) — and the raw value anywhere in an upstream message.
  if (key && String(key).length >= 8) s = s.split(String(key)).join("[redacted]");
  return s;
}

/** Unwrap Bing's { d: ... } envelope. */
export function unwrap(json) {
  if (json && typeof json === "object" && "d" in json) return json.d;
  return json ?? null;
}

/** Bing's odd date form "/Date(1700000000000)/" → Date, or null. */
export function bingDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const m = String(v).match(/\/Date\((-?\d+)(?:[+-]\d+)?\)\//);
  if (m) {
    const d = new Date(Number(m[1]));
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Sites from GetUserSites → [{ url, verified }] */
export function parseUserSites(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .map((s) => ({ url: String(s?.Url ?? s?.url ?? "").trim(), verified: s?.IsVerified === true || s?.isVerified === true || s?.Status === 1 }))
    .filter((s) => s.url);
}

/** UrlInfo → the two dates the holdout needs, and the status. */
export function parseUrlInfo(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    lastCrawledAt: bingDate(payload.LastCrawledDate),
    discoveredAt: bingDate(payload.DiscoveryDate),
    httpStatus: Number.isFinite(Number(payload.HttpStatus)) ? Number(payload.HttpStatus) : null,
  };
}

/** UrlSubmissionQuota → numbers. */
export function parseQuota(payload) {
  return { daily: Number(payload?.DailyQuota) || 0, monthly: Number(payload?.MonthlyQuota) || 0 };
}

/** Pick the Bing site that is this storefront. Host match, scheme-agnostic. */
export function matchSite(sites, storefrontOrigin) {
  let host;
  try {
    host = new URL(storefrontOrigin).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const norm = (u) => {
    try {
      return new URL(u).host.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const exact = (sites ?? []).find((s) => norm(s.url) === host);
  return exact ?? null;
}

/** A URL belongs to the site Bing verified. */
export function underSite(url, siteUrl) {
  try {
    const a = new URL(url);
    const b = new URL(siteUrl);
    return a.host.toLowerCase().replace(/^www\./, "") === b.host.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
}
