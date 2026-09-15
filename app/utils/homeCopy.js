/**
 * Phase 12 Part A (A3) — one source of truth for "what changed" on Home.
 *
 * Frame 01 read "Unchanged since September 14, across the 14 products we
 * sampled" directly above "Autopilot optimized 15 new products in the last
 * 24 hours", on a 15-product store. Both were true: the score baseline was
 * stamped on 14 Sep AFTER autopilot had run, and the recap counted a fixed
 * 24-hour window. Two windows, two sentences, one screen, a contradiction.
 *
 * There is one window now: the score card's baseline moment. The autopilot
 * banner counts what autopilot did SINCE that moment and names the same
 * date. When no baseline exists yet, both fall back to the last 24 hours and
 * say so. PURE.
 */

import { enT } from "../i18n/index.js";

export const FALLBACK_WINDOW_MS = 24 * 3600 * 1000;

/** "September 14" — the card's own phrasing, reused by the banner. In the merchant's language (D1). */
export function sinceLabelFor(since, t = enT) {
  if (!since) return null;
  const d = new Date(since);
  if (!Number.isFinite(d.getTime())) return null;
  return t.date(d, { day: "numeric", month: "long" });
}

/**
 * The window every "what changed" sentence on Home uses.
 *
 * @param {{since?: string|null, baselineIsNew?: boolean}|null} score the store-score payload
 * @param {Date} [now]
 * @param {Function} [t] D1 — the screen's translator; English by default.
 * @returns {{since: Date, label: string, kind: "baseline"|"last24h"}}
 */
export function changeWindowFor(score, now = new Date(), t = enT) {
  const sinceIso = score?.since;
  const since = sinceIso ? new Date(sinceIso) : null;
  if (since && Number.isFinite(since.getTime()) && !score?.baselineIsNew) {
    return { since, label: t("since {date}", { date: sinceLabelFor(since, t) }), kind: "baseline" };
  }
  return { since: new Date(now.getTime() - FALLBACK_WINDOW_MS), label: t("in the last 24 hours"), kind: "last24h" };
}

/** The autopilot banner's title, from the same window. Null when there is nothing to say. */
export function autopilotBannerTitle(recap, window, t = enT) {
  const n = Number(recap?.products) || 0;
  if (n <= 0) return null;
  return t("Autopilot optimized {n, plural, one {# new product} other {# new products}} {window}", { n, window: window.label });
}
