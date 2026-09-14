/**
 * A1 (Phase 8) — every Plan row reads against the locked table, never below.
 *
 * The property that matters: nothing is ever lowered. Proved over every plan
 * name, every status, and a spread of current values including ones above the
 * table (owner-granted) and garbage.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { lockedCreditsFor, rebasedCredits, needsRebase, rebasePlan } from "../../app/utils/planRebase.js";
import { FREE_PLAN, BILLING_PLANS } from "../../app/utils/billing-plans.js";

const NAMES = ["free", "starter", "growth", "pro"];

describe("the locked table is the one in billing-plans.js", () => {
  it("free 100, starter 500, growth 1500, pro 4000", () => {
    expect(lockedCreditsFor("free")).toBe(FREE_PLAN.monthlyCredits);
    expect(lockedCreditsFor("free")).toBe(100);
    expect(lockedCreditsFor("starter")).toBe(500);
    expect(lockedCreditsFor("growth")).toBe(1500);
    expect(lockedCreditsFor("pro")).toBe(4000);
    for (const p of Object.values(BILLING_PLANS)) expect(lockedCreditsFor(p.planName)).toBe(p.monthlyCredits);
  });
});

describe("favourable by construction", () => {
  it("raises a pre-B2 row to the table", () => {
    expect(rebasedCredits({ planName: "free", status: "active", monthlyCredits: 25 })).toBe(100);
    expect(rebasedCredits({ planName: "starter", status: "active", monthlyCredits: 50 })).toBe(500);
    expect(rebasedCredits({ planName: "growth", status: "active", monthlyCredits: 200 })).toBe(1500);
    expect(rebasedCredits({ planName: "pro", status: "active", monthlyCredits: 1000 })).toBe(4000);
  });

  it("NEVER lowers — for every plan, every status, every value tried", () => {
    const values = [0, 1, 25, 50, 99, 100, 101, 200, 500, 1500, 4000, 4001, 9999, NaN, undefined, "25", -5];
    for (const planName of [...NAMES, "unknown", ""]) {
      for (const status of ["active", "cancelled", "frozen", undefined]) {
        for (const v of values) {
          const current = Math.max(0, Number(v) || 0);
          expect(rebasedCredits({ planName, status, monthlyCredits: v })).toBeGreaterThanOrEqual(current);
        }
      }
    }
  });

  it("leaves a row above the table alone, and a non-active row alone", () => {
    expect(rebasedCredits({ planName: "free", status: "active", monthlyCredits: 250 })).toBe(250);
    expect(rebasedCredits({ planName: "free", status: "cancelled", monthlyCredits: 25 })).toBe(25);
    expect(needsRebase({ planName: "free", status: "active", monthlyCredits: 100 })).toBe(false);
    expect(needsRebase({ planName: "free", status: "active", monthlyCredits: 25 })).toBe(true);
  });

  it("plans only raises, with from/to, and skips everything else", () => {
    const plan = rebasePlan([
      { shop: "a", planName: "free", status: "active", monthlyCredits: 25 },
      { shop: "b", planName: "free", status: "active", monthlyCredits: 100 },
      { shop: "c", planName: "pro", status: "cancelled", monthlyCredits: 1000 },
      { shop: "d", planName: "growth", status: "active", monthlyCredits: 200 },
      { shop: "e", planName: "starter", status: "active", monthlyCredits: 800 },
    ]);
    expect(plan).toEqual([
      { shop: "a", planName: "free", from: 25, to: 100 },
      { shop: "d", planName: "growth", from: 200, to: 1500 },
    ]);
    for (const u of plan) expect(u.to).toBeGreaterThan(u.from);
  });
});

describe("wiring — read path and one-shot both use the one definition, and write with lt", () => {
  it("getOrCreatePlan raises on read, with a lt predicate", () => {
    const src = code(readFileSync("app/utils/plans.server.js", "utf8"));
    expect(src).toMatch(/rebasedCredits\(row\)/);
    expect(src).toMatch(/monthlyCredits: \{ lt: want \}/);
  });

  it("the one-shot script writes only with lt and never a bare set", () => {
    const src = code(readFileSync("scripts/plan-rebase--writes-plan-rows.mjs", "utf8"));
    expect(src).toMatch(/rebasePlan\(/);
    expect(src).toMatch(/monthlyCredits: \{ lt: u\.to \}/);
    expect(src).not.toMatch(/data: \{ monthlyCredits: [^u]/);
  });
});
