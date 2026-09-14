/**
 * P3.1 (Phase 8) — the crawl-time holdout. What these hold: the split is
 * seeded and reproducible; both arms are always shown; the interval is shown
 * and never the point estimate alone; below MIN_PER_ARM there is no verdict;
 * uncrawled pages are censored and the sentence says so.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  MIN_PER_ARM,
  CENSOR_DAYS,
  rng,
  seededShuffle,
  splitArms,
  hoursToCrawl,
  observedHours,
  median,
  bootstrapDifference,
  summariseExperiment,
  verdictSentence,
  formatHours,
} from "../../app/utils/crawlHoldout.js";

const urls = Array.from({ length: 12 }, (_, i) => `https://s.example/products/p${i}`);

describe("the randomisation is the product", () => {
  it("the same seed gives the same split; a different seed gives a different one", () => {
    const a = splitArms(urls, 42);
    const b = splitArms(urls, 42);
    const c = splitArms(urls, 43);
    expect(a).toEqual(b);
    expect(a.submit).not.toEqual(c.submit);
  });

  it("arms differ in size by at most one, cover every URL once, and ignore order and duplicates", () => {
    const a = splitArms([...urls, urls[0]], 7);
    expect(a.submit.length + a.hold.length).toBe(urls.length);
    expect(Math.abs(a.submit.length - a.hold.length)).toBeLessThanOrEqual(1);
    expect(new Set([...a.submit, ...a.hold]).size).toBe(urls.length);
    expect(splitArms([...urls].reverse(), 7)).toEqual(a);
  });

  it("rng is deterministic and in [0, 1)", () => {
    const r1 = rng(9);
    const r2 = rng(9);
    for (let i = 0; i < 50; i++) {
      const v = r1();
      expect(v).toBe(r2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededShuffle([1, 2, 3, 4, 5], 1)).toEqual(seededShuffle([1, 2, 3, 4, 5], 1));
  });
});

describe("times and censoring", () => {
  const t0 = new Date("2026-09-14T00:00:00Z");
  it("hours from change to first crawl; null until crawled", () => {
    expect(hoursToCrawl({ changedAt: t0, firstCrawledAt: new Date("2026-09-14T06:00:00Z") })).toBe(6);
    expect(hoursToCrawl({ changedAt: t0, firstCrawledAt: null })).toBeNull();
  });
  it("an uncrawled page is observed at elapsed time, capped at CENSOR_DAYS, and marked censored", () => {
    const o = observedHours({ changedAt: t0, firstCrawledAt: null }, new Date("2026-09-16T00:00:00Z"));
    expect(o).toEqual({ hours: 48, censored: true });
    const late = observedHours({ changedAt: t0, firstCrawledAt: null }, new Date("2026-10-30T00:00:00Z"));
    expect(late.hours).toBe(CENSOR_DAYS * 24);
  });
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("the result — both arms, the interval, never a point estimate alone", () => {
  const t0 = new Date("2026-09-14T00:00:00Z");
  const row = (arm, hours) => ({ arm, changedAt: t0, firstCrawledAt: hours === null ? null : new Date(t0.getTime() + hours * 3600e3) });
  const now = new Date("2026-09-17T00:00:00Z");

  it("with enough pages per arm, a clear speed-up gives an interval above zero and a favourable read", () => {
    const rows = [
      ...[2, 3, 4, 5, 6, 3].map((h) => row("submit", h)),
      ...[40, 50, 60, 45, 55, 70].map((h) => row("hold", h)),
    ];
    const s = summariseExperiment(rows, { seed: 5, now });
    expect(s.enough).toBe(true);
    expect(s.submit.medianHours).toBeLessThan(s.hold.medianHours);
    expect(s.lo).toBeGreaterThan(0);
    expect(s.favourable).toBe(true);
    expect(s.complete).toBe(true);
    const v = verdictSentence(s);
    expect(v).toMatch(/Submitted pages: median/);
    expect(v).toMatch(/Withheld pages: median/);
    expect(v).toMatch(/95% interval/);
    expect(v).toMatch(/entirely above zero/);
  });

  it("below MIN_PER_ARM there is no verdict and the sentence says why", () => {
    const rows = [...[2, 3].map((h) => row("submit", h)), ...[40, 50].map((h) => row("hold", h))];
    const s = summariseExperiment(rows, { seed: 1, now });
    expect(s.enough).toBe(false);
    expect(s.favourable).toBe(false);
    expect(s.lo).toBeNull();
    expect(verdictSentence(s)).toMatch(new RegExp(`Too few pages to conclude: 2 submitted, 2 held \\(${MIN_PER_ARM} each is the minimum\\)`));
  });

  it("no difference gives an interval that includes zero, and the sentence says no difference", () => {
    const rows = [...[10, 12, 11, 13, 12, 10].map((h) => row("submit", h)), ...[11, 12, 10, 13, 12, 11].map((h) => row("hold", h))];
    const s = summariseExperiment(rows, { seed: 3, now });
    expect(s.enough).toBe(true);
    expect(s.lo).toBeLessThanOrEqual(0);
    expect(s.hi).toBeGreaterThanOrEqual(0);
    expect(s.favourable).toBe(false);
    expect(verdictSentence(s)).toMatch(/includes zero/);
  });

  it("uncrawled pages keep the batch running until day CENSOR_DAYS, then count at CENSOR_DAYS and are named", () => {
    const rows = [...[2, 3, 4, 5, 6].map((h) => row("submit", h)), ...[40, 50, 60, 45, null].map((h) => row("hold", h))];
    const early = summariseExperiment(rows, { seed: 2, now: new Date("2026-09-16T00:00:00Z") });
    expect(early.complete).toBe(false);
    expect(early.hold.censored).toBe(1);
    const late = summariseExperiment(rows, { seed: 2, now: new Date("2026-09-30T00:00:00Z") });
    expect(late.complete).toBe(true);
    expect(verdictSentence(late)).toMatch(new RegExp(`not crawled by day ${CENSOR_DAYS} are counted at ${CENSOR_DAYS} days`));
  });

  it("the bootstrap is seeded — the interval on the screen is reproducible", () => {
    const a = [2, 3, 4, 5, 6];
    const b = [40, 50, 60, 45, 55];
    expect(bootstrapDifference(a, b, 11)).toEqual(bootstrapDifference(a, b, 11));
    expect(bootstrapDifference([], b, 11)).toEqual({ diff: null, lo: null, hi: null });
  });

  it("formats hours for a person", () => {
    expect(formatHours(0.5)).toBe("30 min");
    expect(formatHours(6)).toBe("6 h");
    expect(formatHours(72)).toBe("3.0 d");
    expect(formatHours(null)).toBe("—");
  });
});

describe("wiring — merchant-switched, lock-gated, never a locked shop, method on the screen", () => {
  const srv = code(readFileSync("app/utils/crawlHoldout.server.js", "utf8"));
  const page = code(readFileSync("app/routes/app.proof.jsx", "utf8"));

  it("runs only for shops with bingEnabledAt, skips locked shops, refuses while the lock is unset", () => {
    expect(srv).toMatch(/bingEnabledAt: \{ not: null \}/);
    expect(srv).toMatch(/isRemediationLocked\(shop\)/);
    expect(srv).toMatch(/if \(!lockConfigured\(\)\)/);
  });

  it("stamps provedResultAt first-writer-wins only when both arms reached the minimum", () => {
    expect(srv).toMatch(/if \(s\.enough\) \{\s*await prisma\.shop\.updateMany\(\{ where: \{ shop: exp\.shop, provedResultAt: null \}/);
  });

  it("the Proof page shows both arms, the interval, the seed, and names the method — including why not IndexNow", () => {
    expect(page).toMatch(/Submitted — median time to first crawl/);
    expect(page).toMatch(/Withheld — median time to first crawl/);
    expect(page).toMatch(/95% interval on the difference/);
    expect(page).toMatch(/seed \$\{e\.seed\}/);
    expect(page).toMatch(/Method:/);
    expect(page).toMatch(/cannot host\s+an IndexNow key file at its root/);
    expect(page).toMatch(/nothing here is a ranking claim/i);
  });

  it("the scheduler runs the holdout and the weekly report from the minute tick", () => {
    const sch = code(readFileSync("app/utils/scheduler.server.js", "utf8"));
    expect(sch).toMatch(/maybeRunCrawlHoldout\(\)/);
    expect(sch).toMatch(/maybeSendWeeklyReports\(\)/);
  });
});
