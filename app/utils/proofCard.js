/**
 * P3.1 (Phase 8) — the Proof card's lines, pure.
 *
 * @param {{enabled: boolean, lockConfigured: boolean, latest: null|{status: string, summary: object, startedAt: string}}} p
 * @param {Function} [t] D1 — the screen's translator; English by default.
 */
import { verdictSentence, plainSentence, CENSOR_DAYS } from "./crawlHoldout.js";
import { enT } from "../i18n/index.js";

export function proofCardLines(p, t = enT) {
  if (!p?.enabled) return [];
  if (!p.lockConfigured) return [t("Measurement is switched on; nothing is submitted until the operator finishes configuring this deployment.")];
  if (!p.latest) return [t("Nothing to measure yet. The next time you publish content for two or more products, a batch starts that night: half submitted to Bing, half withheld.")];
  const s = p.latest.summary;
  if (p.latest.status !== "reported") {
    return [t("Batch running — day {dayOf} of {days}: {c1} of {n1} submitted pages crawled, {c2} of {n2} withheld pages crawled.", { dayOf: s.dayOf, days: CENSOR_DAYS, c1: s.submit.crawled, n1: s.submit.n, c2: s.hold.crawled, n2: s.hold.n })];
  }
  return [plainSentence(s, t), verdictSentence(s, t)];
}
