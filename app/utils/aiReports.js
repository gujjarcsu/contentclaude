/**
 * P3.3 (Phase 8) — the two AI-visibility reports that have no API, taught.
 *
 * 10-MARKET.md §6, verified: Google's generative-AI performance report in
 * Search Console (impressions only, AI Overviews + AI Mode, worldwide since
 * 31 Aug 2026) has no API — UI export only. Bing Webmaster Tools' AI
 * Performance (total citations, cited pages, grounding queries, citation
 * share against all sites) has no API — confirmed by Microsoft, Feb 2026.
 *
 * We teach the merchant to read them. We never scrape them — a test walks
 * app/ for any fetch of either console. What the merchant reads, they may
 * type in here; it is stored dated and shown back as THEIR reading, never
 * as ours, and never trended into a claim.
 *
 * PURE.
 */

import { T, enT } from "../i18n/index.js";

export const AI_REPORTS = Object.freeze([
  {
    key: "google_ai",
    title: T("Google — how often your pages appear in AI Overviews and AI Mode"),
    where: T("Search Console, then Performance, then the AI features filter (Google calls the report \"generative AI\"). It shows impressions only: no clicks, no queries."),
    url: "https://search.google.com/search-console/performance/search-analytics",
    steps: [
      T("Open Search Console for your storefront's property."),
      T("Open Performance and switch the search-appearance filter to the AI / generative-AI view."),
      T("Set the date range to the last 28 days."),
      T("Read the total impressions, then the Pages tab for which product pages appear."),
    ],
    fields: [
      { key: "impressions28d", label: T("AI impressions, last 28 days"), short: T("ai impressions"), kind: "int" },
      { key: "pages", label: T("Product pages that appeared"), short: T("product pages that appeared"), kind: "int" },
    ],
    caveat: T("Impressions only. Google does not show clicks or queries for AI features, and no app can read this report — there is no API. A single reading is one observation, not a trend."),
  },
  {
    key: "bing_ai",
    title: T("Bing — how often AI answers cite your pages, and your share against everyone else"),
    where: T("Bing Webmaster Tools, then the AI Performance report (public preview). It shows total citations, cited pages, the grounding queries, and your citation share against all sites."),
    url: "https://www.bing.com/webmasters/",
    steps: [
      T("Open Bing Webmaster Tools for your verified site."),
      T("Open the AI Performance report."),
      T("Set the date range to the last 28 days."),
      T("Read total citations, cited pages, and citation share; the grounding queries tell you what people asked."),
    ],
    fields: [
      { key: "citations28d", label: T("Citations, last 28 days"), short: T("citations"), kind: "int" },
      { key: "citedPages", label: T("Cited pages"), short: T("cited pages"), kind: "int" },
      { key: "sharePct", label: T("Citation share (%)"), short: T("citation share"), kind: "pct" },
    ],
    caveat: T("The richest free AI-citation data there is, and it has no API — Microsoft confirmed that in February 2026. We teach it; we never scrape it. Your reading is yours and is shown as such."),
  },
]);

export const AI_REPORT_KEYS = Object.freeze(AI_REPORTS.map((r) => r.key));

/** Parse the stored JSON safely. */
export function parseReadings(json) {
  try {
    const v = JSON.parse(json || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Validate one report's typed values. Returns { ok, values } or { ok: false, reason }. `t` (D1): the request's translator. */
export function validateReading(reportKey, raw, t = enT) {
  const report = AI_REPORTS.find((r) => r.key === reportKey);
  if (!report) return { ok: false, reason: t("Unknown report.") };
  const values = {};
  for (const f of report.fields) {
    const s = String(raw?.[f.key] ?? "").trim().replace(/,/g, "");
    if (s === "") continue;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: t("{label}: enter a number.", { label: t(f.label) }) };
    if (f.kind === "int" && !Number.isInteger(n)) return { ok: false, reason: t("{label}: enter a whole number.", { label: t(f.label) }) };
    if (f.kind === "pct" && n > 100) return { ok: false, reason: t("{label}: a percentage, 0 to 100.", { label: t(f.label) }) };
    values[f.key] = n;
  }
  if (Object.keys(values).length === 0) return { ok: false, reason: t("Enter at least one number from the report.") };
  return { ok: true, values };
}

/** Merge one reading into the stored map, dated. */
export function withReading(readings, reportKey, values, now = new Date()) {
  return { ...(readings ?? {}), [reportKey]: { values, readAt: now.toISOString() } };
}

/** "Your reading, 14 Sep 2026: 1,204 AI impressions · 31 pages" or null. `t` (D1): the screen's translator. */
export function readingSentence(reportKey, readings, t = enT) {
  const r = readings?.[reportKey];
  const report = AI_REPORTS.find((x) => x.key === reportKey);
  if (!r?.values || !report) return null;
  const parts = report.fields.filter((f) => r.values[f.key] !== undefined).map((f) => `${f.kind === "pct" ? `${r.values[f.key]}%` : t.number(Number(r.values[f.key]))} ${t(f.short)}`);
  const when = r.readAt ? new Date(r.readAt).toLocaleDateString(t.locale) : "";
  return t("Your reading{when}: {parts}. One observation, typed by you — not a trend, not a claim.", { when: when ? `, ${when}` : "", parts: parts.join(" · ") });
}
