/**
 * Phase 10 Part A — the first screen's two sentences, pure, so a test can
 * hold them against the numbers the rest of the app shows.
 *
 * N1: the splash said "3 credits of the 100 you have left" while the usage
 * card, one navigation later, said "3 / 100 used · 97 left". Both were true
 * at the instant each was computed; together they read as a contradiction.
 * The splash now states the number the card will show — what is left AFTER
 * the drafts it is about to write — from the same arithmetic the card uses.
 *
 * FR8: a row's score is that product's own. On a uniform catalogue every
 * product can score the same, and then every row equals the store score by
 * arithmetic, not by error; the note says so rather than leaving a reader to
 * conclude the row is lying.
 */

import { enT } from "../i18n/index.js";

/** What the usage card shows as "left": allowance minus spent. One definition. */
export function creditsLeft(monthlyCredits, used) {
  return Math.max(0, (Number(monthlyCredits) || 0) - (Number(used) || 0));
}

/**
 * @param {{targets: number, fresh: number, canStart: number, remaining: number,
 *   monthlyCredits?: number, planName?: string, alreadyDrafted?: number, t?: Function}} p
 *   `t` (D1): the screen's translator; English by default.
 */
export function costSentence({ targets, fresh, canStart, remaining, monthlyCredits = null, planName = "free", alreadyDrafted = 0, t = enT }) {
  if (!targets) return "";
  if (fresh === 0) {
    return t("Your {n, plural, one {# draft is} other {# drafts are}} below — written earlier, no credits charged again. Nothing is published until you approve it.", { n: targets });
  }
  if (canStart <= 0) return t("You have no credits left this month. Your drafts are still here to review and publish.");
  const after = creditsLeft(remaining, canStart);
  const of = Number.isFinite(Number(monthlyCredits)) && monthlyCredits !== null ? t(" of {monthlyCredits}", { monthlyCredits }) : "";
  const plan = planName === "free" ? t(" on the Free plan") : "";
  const reused = alreadyDrafted > 0 ? t(" {m, plural, one {# is} other {# are}} already written and shown at no charge.", { m: alreadyDrafted }) : "";
  return t("Writing {n, plural, one {# draft} other {# drafts}} now — {n, plural, one {# credit} other {# credits}}; {after}{of} left after this{plan}. Nothing is published until you approve it.{reused}", { n: canStart, after, of, plan, reused });
}

/** "All 3 products we scanned score 21 — …" when every target scores the same, else null. */
export function uniformScoreNote(targets, scanned, t = enT) {
  const scores = (targets ?? []).map((x) => Number(x?.scoreBefore)).filter(Number.isFinite);
  if (scores.length < 2) return null;
  if (new Set(scores).size !== 1) return null;
  return t("These {n} products all score {score}: they are missing the same things, so each one's number is the same as the store's. We scanned {scanned} products to pick them.", { n: scores.length, score: scores[0], scanned });
}
