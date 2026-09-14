/**
 * P3.1 (Phase 8) — the Proof card's lines, pure.
 *
 * @param {{enabled: boolean, lockConfigured: boolean, latest: null|{status: string, summary: object, startedAt: string}}} p
 */
import { verdictSentence, CENSOR_DAYS } from "./crawlHoldout.js";

export function proofCardLines(p) {
  if (!p?.enabled) return [];
  if (!p.lockConfigured) return ["Measurement is switched on; nothing is submitted until the operator finishes configuring this deployment."];
  if (!p.latest) return ["Nothing to measure yet. The next time you publish content for two or more products, a batch starts that night: half submitted to Bing, half withheld."];
  const s = p.latest.summary;
  if (p.latest.status !== "reported") {
    return [`Batch running — day ${s.dayOf} of ${CENSOR_DAYS}: ${s.submit.crawled} of ${s.submit.n} submitted pages crawled, ${s.hold.crawled} of ${s.hold.n} withheld pages crawled.`];
  }
  return [verdictSentence(s)];
}
