/**
 * P2.5 — Google's "Search generative AI control", as the one check no app can
 * make.
 *
 * Google shipped a switch in Search Console (Settings → Search generative AI,
 * worldwide 31 Aug 2026) that excludes a site from AI Overviews, AI Mode and
 * AI in Discover. A merchant, an agency or a previous developer may have set
 * it. The brief said verify before building whether an app can read it.
 *
 * VERIFIED 2026-09-14: it cannot. The Search Console API v1 reference index
 * lists searchanalytics.query, sitemaps.{delete,get,list,submit},
 * sites.{add,delete,get,list} and urlInspection.index.inspect — and nothing
 * else. No site-settings resource, nothing AI-related. Google's own rollout
 * announcement mentions no API or export for the control. Our market file
 * (10-MARKET.md) had it right.
 *
 * So, per the brief — "do not build a gate on an unverified API" — this is a
 * one-question guided check the merchant answers. The answer is stored with
 * its date, labelled as theirs everywhere it is shown, and asked again after
 * GSC_RECHECK_DAYS. Nothing here is read from Google, and a test asserts that
 * nothing in app/ tries to.
 *
 * PURE.
 */

import { T, enT } from "../i18n/index.js";

export const GSC_ANSWER = Object.freeze({
  DEFAULT: "default", // the switch is off — the store is included (Google's default)
  EXCLUDED: "excluded", // the switch is on — the store is excluded from AI features
  NO_GSC: "no_gsc", // the merchant has no Search Console property
});
export const GSC_ANSWERS = Object.freeze(Object.values(GSC_ANSWER));

/** Where the switch lives. Lands on the property picker if none is selected. */
export const GSC_SETTINGS_URL = "https://search.google.com/search-console/settings";

/** After this long the answer is shown as worth re-checking, not as wrong. */
export const GSC_RECHECK_DAYS = 90;

export const GSC_LABEL = Object.freeze({
  [GSC_ANSWER.DEFAULT]: T("Included in Google's AI features"),
  [GSC_ANSWER.EXCLUDED]: T("Excluded from Google's AI features"),
  [GSC_ANSWER.NO_GSC]: T("No Search Console property"),
});

export const GSC_TONE = Object.freeze({
  [GSC_ANSWER.DEFAULT]: "success",
  [GSC_ANSWER.EXCLUDED]: "critical",
  [GSC_ANSWER.NO_GSC]: "info",
});

export function isGscAnswer(v) {
  return GSC_ANSWERS.includes(v);
}

/**
 * The state Home and the attention page read.
 *
 * @param {{answer?: string|null, answeredAt?: Date|string|null}} row
 * @param {Date} [now]
 * @returns {{answer: string|null, answeredAt: string|null, excluded: boolean, stale: boolean, days: number|null}}
 */
export function gscState({ answer = null, answeredAt = null } = {}, now = new Date()) {
  const a = isGscAnswer(answer) ? answer : null;
  const at = a && answeredAt ? new Date(answeredAt) : null;
  const days = at && Number.isFinite(at.getTime()) ? Math.floor((now.getTime() - at.getTime()) / 86_400_000) : null;
  return {
    answer: a,
    answeredAt: at && Number.isFinite(at.getTime()) ? at.toISOString() : null,
    excluded: a === GSC_ANSWER.EXCLUDED,
    stale: days !== null && days >= GSC_RECHECK_DAYS,
    days,
  };
}

/** The Home line, or null. Says whose answer it is, because it is not ours. */
export function gscLine(state, t = enT) {
  if (!state?.excluded) return null;
  return t("Your store is excluded from Google's AI features — your answer after checking Search Console.");
}
