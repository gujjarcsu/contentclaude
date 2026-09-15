/**
 * Phase 11 Part D — every scheduled job proves it can fire.
 *
 * sydneyParts() returned no weekday, so the P3.6 weekly report compared
 * `undefined !== 1` forever and would never have sent. It was found by
 * accident while wiring the funnel digest. This is the class: a simulated
 * clock advances minute by minute through a full week — and through the
 * week Sydney moves from AEST to AEDT — and every job the scheduler ticks is
 * asked at every minute. Each must fire exactly as often as it claims, at the
 * hour it claims, and never at any other. A job that cannot be shown to fire
 * in a simulated week does not ship.
 *
 * The runners are injected, so no job does its work here; the day/week
 * claims go through an in-memory Redis with real NX semantics, so a job that
 * claims twice or never is caught too.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";

const { store } = vi.hoisted(() => ({ store: new Map() }));
const redis = {
  set: async (k, v, ...args) => {
    if (args.includes("NX") && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  },
  get: async (k) => store.get(k) ?? null,
  del: async (k) => (store.delete(k) ? 1 : 0),
};
const anyModel = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : async () => []) });
vi.mock("../../app/db.server.js", () => ({ default: new Proxy({}, { get: (_t, k) => (k === "then" || typeof k === "symbol" ? undefined : anyModel) }) }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../app/utils/cache.server.js", () => ({ getRedis: async () => redis, getCache: vi.fn(async (_k, fn) => fn()), setCache: vi.fn(), invalidateCache: vi.fn() }));
vi.mock("../../app/utils/notify.server.js", () => ({
  OPERATOR_EMAIL: "hello@navaal.ai",
  sendOperatorEmail: vi.fn(async () => ({ sent: true })),
  sendEmailTo: vi.fn(async () => ({ sent: true })),
}));

const { maybeSendDigest, maybeRunBackup, sydneyParts } = await import("../../app/utils/scheduler.server.js");
const { maybeRunCatalogueWatch, WATCH_HOUR_SYDNEY } = await import("../../app/utils/catalogueWatch.server.js");
const { maybeRunCrawlHoldout, HOLDOUT_HOUR_SYDNEY } = await import("../../app/utils/crawlHoldout.server.js");
const { maybeSendWeeklyReports, REPORT_DAY_SYDNEY, REPORT_HOUR_SYDNEY } = await import("../../app/utils/weeklyReport.server.js");
const { maybeSendFunnelDigest, FUNNEL_DAY_SYDNEY, FUNNEL_HOUR_SYDNEY, FUNNEL_MINUTE_MIN } = await import("../../app/utils/funnel.server.js");

const src = (p) => code(readFileSync(p, "utf8"));

/** Every job the scheduler ticks, with the hour it claims. */
const JOBS = [
  { name: "daily digest", hour: 7, perWeek: 7, fire: (now) => maybeSendDigest({ now, build: async () => ({ subject: "s", text: "t" }) }), fired: (r) => r.sent === true },
  { name: "nightly backup", hour: 3, perWeek: 7, fire: (now) => maybeRunBackup({ now, run: async () => ({ ok: true }) }), fired: (r) => r.ran === true },
  { name: "catalogue walk (crawler diff + indexability sample ride inside it)", hour: WATCH_HOUR_SYDNEY, perWeek: 7, fire: (now) => maybeRunCatalogueWatch({ now, run: async () => ({ shops: 0 }) }), fired: (r) => r.ran === true },
  { name: "crawl-time holdout", hour: HOLDOUT_HOUR_SYDNEY, perWeek: 7, fire: (now) => maybeRunCrawlHoldout({ now, run: async () => ({}) }), fired: (r) => r.ran === true },
  { name: "weekly report", hour: REPORT_HOUR_SYDNEY, weekday: REPORT_DAY_SYDNEY, perWeek: 1, fire: (now) => maybeSendWeeklyReports({ now, run: async () => ({ sent: 0 }) }), fired: (r) => r.ran === true },
  { name: "funnel digest", hour: FUNNEL_HOUR_SYDNEY, weekday: FUNNEL_DAY_SYDNEY, minuteMin: FUNNEL_MINUTE_MIN, perWeek: 1, fire: (now) => maybeSendFunnelDigest({ now, run: async () => ({ sent: true }) }), fired: (r) => r.ran === true },
];

/** Tick every minute of a week from `startUtc`, recording when each job fires. */
async function simulateWeek(startUtc) {
  const firings = Object.fromEntries(JOBS.map((j) => [j.name, []]));
  const start = new Date(startUtc).getTime();
  for (let m = 0; m < 7 * 24 * 60; m++) {
    const now = new Date(start + m * 60_000);
    for (const job of JOBS) {
      const r = await job.fire(now);
      if (job.fired(r)) firings[job.name].push({ at: now.toISOString(), ...sydneyParts(now) });
    }
  }
  return firings;
}

describe("a simulated week: every scheduled job fires as often as it claims, at the hour it claims", () => {
  // Monday 14 Sep 2026 00:00 AEST (UTC+10) — a plain week.
  // Monday 5 Oct 2026 00:00 AEDT (UTC+11) — the week after Sydney's clocks move (04 Oct 02:00 → 03:00).
  const WEEKS = [
    { label: "AEST, 14–20 Sep 2026", startUtc: "2026-09-13T14:00:00Z" },
    { label: "AEDT, 5–11 Oct 2026, after the clocks moved", startUtc: "2026-10-04T13:00:00Z" },
  ];

  for (const week of WEEKS) {
    it(week.label, async () => {
      store.clear();
      const firings = await simulateWeek(week.startUtc);
      for (const job of JOBS) {
        const f = firings[job.name];
        expect(f.length, `${job.name} should fire ${job.perWeek}× in the week, fired at ${JSON.stringify(f.map((x) => x.at))}`).toBe(job.perWeek);
        for (const x of f) {
          expect(x.hour, `${job.name} fired at Sydney hour ${x.hour}, claims ${job.hour}`).toBe(job.hour);
          if (job.weekday !== undefined) expect(x.weekday, `${job.name} fired on weekday ${x.weekday}, claims ${job.weekday}`).toBe(job.weekday);
          if (job.minuteMin !== undefined) expect(x.minute).toBeGreaterThanOrEqual(job.minuteMin);
        }
        // daily jobs: one per calendar day, no day skipped
        if (job.perWeek === 7) expect(new Set(f.map((x) => x.day)).size).toBe(7);
      }
    }, 120_000);
  }

  it("the weekday the report needs is the weekday sydneyParts returns — the P3.6 bug, held", () => {
    expect(sydneyParts(new Date("2026-09-20T23:00:00Z"))).toMatchObject({ day: "2026-09-21", hour: 9, weekday: 1 }); // Monday 09:00 AEST
    expect(sydneyParts(new Date("2026-10-11T22:00:00Z"))).toMatchObject({ day: "2026-10-12", hour: 9, weekday: 1 }); // Monday 09:00 AEDT
    expect(src("app/utils/weeklyReport.server.js")).toMatch(/const \{ day, hour, weekday \} = sydneyParts\(now\)/);
  });
});

describe("the scheduler actually ticks every job in that list, and the walk carries the two daily reads", () => {
  it("every maybe* is called from the minute tick", () => {
    const s = src("app/utils/scheduler.server.js");
    for (const call of ["maybeSendDigest()", "maybeRunBackup()", "m.maybeRunCatalogueWatch()", "m.maybeRunCrawlHoldout()", "m.maybeSendWeeklyReports()", "m.maybeSendFunnelDigest()"]) {
      expect(s, call).toContain(call);
    }
    expect(s).toMatch(/setInterval\(\(\) => \{[\s\S]*?\}, 60_000\)/);
    expect(s).toMatch(/sweepUnfinishedWebhookWork\(\)/);
  });

  it("the daily crawler diff and the indexability sample run inside the nightly walk", () => {
    const s = src("app/utils/catalogueWatch.server.js");
    expect(s).toMatch(/checkCrawlerAccess\(/);
    expect(s).toMatch(/runIndexability\(/);
    expect(s).toMatch(/reconcileInstallState\(\{ now \}\)/); // Phase 11 Part A rides the same walk
  });

  it("no job in the list is missing from the simulation", () => {
    const names = JOBS.map((j) => j.name);
    for (const n of ["daily digest", "nightly backup", "catalogue walk", "crawl-time holdout", "weekly report", "funnel digest"]) {
      expect(names.some((x) => x.startsWith(n)), n).toBe(true);
    }
  });
});
