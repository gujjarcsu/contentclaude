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

/** What the usage card shows as "left": allowance minus spent. One definition. */
export function creditsLeft(monthlyCredits, used) {
  return Math.max(0, (Number(monthlyCredits) || 0) - (Number(used) || 0));
}

/**
 * @param {{targets: number, fresh: number, canStart: number, remaining: number,
 *   monthlyCredits?: number, planName?: string, alreadyDrafted?: number}} p
 */
export function costSentence({ targets, fresh, canStart, remaining, monthlyCredits = null, planName = "free", alreadyDrafted = 0 }) {
  if (!targets) return "";
  if (fresh === 0) {
    return `Your ${targets} draft${targets === 1 ? " is" : "s are"} below — written earlier, no credits charged again. Nothing is published until you approve it.`;
  }
  if (canStart <= 0) return "You have no credits left this month. Your drafts are still here to review and publish.";
  const after = creditsLeft(remaining, canStart);
  const of = Number.isFinite(Number(monthlyCredits)) && monthlyCredits !== null ? ` of ${monthlyCredits}` : "";
  const plan = planName === "free" ? " on the Free plan" : "";
  const reused = alreadyDrafted > 0 ? ` ${alreadyDrafted} ${alreadyDrafted === 1 ? "is" : "are"} already written and shown at no charge.` : "";
  return `Writing ${canStart} draft${canStart === 1 ? "" : "s"} now — ${canStart} credit${canStart === 1 ? "" : "s"}; ${after}${of} left after this${plan}. Nothing is published until you approve it.${reused}`;
}

/** "All 3 products we scanned score 21 — …" when every target scores the same, else null. */
export function uniformScoreNote(targets, scanned) {
  const scores = (targets ?? []).map((t) => Number(t?.scoreBefore)).filter(Number.isFinite);
  if (scores.length < 2) return null;
  if (new Set(scores).size !== 1) return null;
  return `These ${scores.length} products all score ${scores[0]}: they are missing the same things, so each one's number is the same as the store's. We scanned ${scanned} products to pick them.`;
}
