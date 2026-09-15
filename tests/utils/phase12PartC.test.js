/**
 * Phase 12 Part C (C1) — the first result a merchant can see, in one plain
 * sentence: both arms, the interval and the direction, never the point
 * estimate alone, never a verdict under MIN_PER_ARM. The Proof screen leads
 * with it, the Proof card and the weekly report carry it, the statistician's
 * line follows it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { plainSentence, verdictSentence, MIN_PER_ARM } from "../../app/utils/crawlHoldout.js";
import { proofCardLines } from "../../app/utils/proofCard.js";

const src = (p) => code(readFileSync(p, "utf8"));
const summary = (over = {}) => ({
  enough: true,
  submit: { n: 8, crawled: 8, medianHours: 20, censored: 0 },
  hold: { n: 8, crawled: 7, medianHours: 51, censored: 1 },
  diffHours: 31,
  lo: 9,
  hi: 52,
  favourable: true,
  ...over,
});

describe("plainSentence", () => {
  it("the favourable case is the brief's sentence: median sooner, and the honest range", () => {
    expect(plainSentence(summary())).toBe("Pages we submitted were crawled a median 31 hours sooner than pages we didn't — with this few pages the honest range is 9 to 52 hours.");
  });

  it("never the point estimate alone: the range is in every sentence that has a verdict", () => {
    for (const s of [summary(), summary({ favourable: false, diffHours: -6, lo: -20, hi: -2 }), summary({ favourable: false, diffHours: 4, lo: -3, hi: 11 })]) {
      const t = plainSentence(s);
      expect(t).toMatch(/range (is|runs from) .+ to .+/);
    }
  });

  it("the unfavourable and the undecided cases say so in words", () => {
    expect(plainSentence(summary({ favourable: false, diffHours: -6, lo: -20, hi: -2 }))).toBe("Pages we submitted were crawled a median 6 hours LATER than pages we didn't — with this few pages the honest range is 2 to 20 hours later (both sides slower). Rare, and worth knowing.");
    expect(plainSentence(summary({ favourable: false, diffHours: 4, lo: -3, hi: 11 }))).toBe("We cannot tell the two halves apart this batch: submitted pages were crawled a median 4 hours sooner, but with this few pages the honest range runs from 3 hours later to 11 hours sooner, which includes no difference at all.");
  });

  it("no verdict under the minimum per arm, and it says how many are needed", () => {
    const t = plainSentence(summary({ enough: false, submit: { n: 3, crawled: 3, medianHours: 10, censored: 0 }, hold: { n: 2, crawled: 2, medianHours: 40, censored: 0 } }));
    expect(t).toBe(`Not enough pages yet to say anything honest: 3 submitted and 2 withheld, and we need ${MIN_PER_ARM} of each. The next batch of changed pages adds to it.`);
    expect(t).not.toMatch(/sooner|later/);
    expect(plainSentence(null)).toBe("");
  });

  it("with forty or more pages the 'this few pages' qualifier drops", () => {
    expect(plainSentence(summary({ submit: { n: 20, crawled: 20, medianHours: 20, censored: 0 }, hold: { n: 20, crawled: 20, medianHours: 51, censored: 0 } }))).toMatch(/— the honest range is 9 to 52 hours\.$/);
  });
});

describe("where it is spoken", () => {
  it("the Proof screen leads with it and keeps the statistician's line under it; the card and the weekly report carry both", () => {
    const proof = src("app/routes/app.proof.jsx");
    expect(proof.indexOf("{plainSentence(s)}")).toBeGreaterThan(0);
    expect(proof.indexOf("{plainSentence(s)}")).toBeLessThan(proof.indexOf("{verdictSentence(s)}"));
    expect(proof).toMatch(/<Badge>\{`seed \$\{e\.seed\}`\}<\/Badge>/); // the seed stays on the screen
    expect(proofCardLines({ enabled: true, lockConfigured: true, latest: { status: "reported", summary: summary(), startedAt: "2026-09-15T00:00:00Z" } })[0]).toMatch(/^Pages we submitted were crawled a median 31 hours sooner/);
    expect(proofCardLines({ enabled: true, lockConfigured: true, latest: { status: "reported", summary: summary(), startedAt: "2026-09-15T00:00:00Z" } })[1]).toBe(verdictSentence(summary()));
    const weekly = src("app/utils/weeklyReport.server.js");
    expect(weekly.indexOf("lines.push(plainSentence(e.summary));")).toBeLessThan(weekly.indexOf("lines.push(verdictSentence(e.summary));"));
  });
});
