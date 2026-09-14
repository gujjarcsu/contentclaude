/**
 * B2 — the LOCKED pricing table.
 *
 * `14-PRICING.md` was approved by the owner in full on 2026-09-14 and recorded
 * in `04-DECISIONS.md` §PRICING. This is the single source of truth for what the
 * app bills, what the plans page shows and what the listing says, and these
 * assertions exist so the three cannot drift apart quietly.
 *
 * The diagnosis behind it, in one number: we charged **14.99¢ per credit**
 * against a category charging 0.45¢–5.00¢ — three times dearer than the most
 * expensive competitor and thirty-three times the cheapest — while W1 measured
 * that the market's actual problem is content, which is the thing we ration.
 * Prices did not move. Allowances multiplied 4–7.5×.
 */
import { describe, it, expect } from "vitest";
import { FREE_PLAN, BILLING_PLANS, ALL_BILLING_PLAN_KEYS } from "../../app/utils/billing-plans.js";

/** The worst cost per credit after weighting — 14-PRICING.md §2.1. MEASURED. */
const WORST_COST_PER_CREDIT = 0.0115;

describe("the locked table, exactly as approved", () => {
  it.each([
    ["free", 0, 100, 100],
    ["starter", 9.99, 500, 1000],
    ["growth", 29.99, 1500, 5000],
    ["pro", 79.99, 4000, null],
  ])("%s: $%s, %i credits, %s products", (name, amount, credits, products) => {
    const plan = name === "free" ? FREE_PLAN : BILLING_PLANS[name];
    expect(plan.amount).toBe(amount);
    expect(plan.monthlyCredits).toBe(credits);
    expect(plan.productLimit).toBe(products);
  });

  it("annual is 20% off — not the 16.7% that '2 months free' actually means", () => {
    // Every competitor displays 17%. A merchant who checks "2 months free" and
    // finds 16.7% will not believe the next number we show them.
    for (const key of ["starter", "growth", "pro"]) {
      const p = BILLING_PLANS[key];
      const discount = 1 - p.annualAmount / (p.amount * 12);
      expect(discount, `${key} annual discount`).toBeCloseTo(0.2, 4);
    }
    expect(BILLING_PLANS.starter.annualAmount).toBe(95.9);
    expect(BILLING_PLANS.growth.annualAmount).toBe(287.9);
    expect(BILLING_PLANS.pro.annualAmount).toBe(767.9);
  });

  it("bulk generation starts at STARTER — it is the conversion mechanism", () => {
    // 14-PRICING.md §4: Free no, Starter yes, Growth yes, Pro yes. The code
    // gated it at Growth, three times further away than the pricing was designed
    // around. §5 is explicit: 100 free credits is genuinely useful for trying the
    // product and genuinely insufficient for the job, because without bulk a
    // 500-product store would have to click 500 times. "The thing you pay for is
    // the thing that saves the time."
    expect(FREE_PLAN.entitlements.bulkJobs).toBe(false);
    expect(BILLING_PLANS.starter.entitlements.bulkJobs).toBe(true);
    expect(BILLING_PLANS.growth.entitlements.bulkJobs).toBe(true);
    expect(BILLING_PLANS.pro.entitlements.bulkJobs).toBe(true);
  });

  it("every paid tier is a uniform 2.00¢ per credit", () => {
    // 14-PRICING.md §4.1. No tier punishes a merchant for being small: the
    // ladder is about capability and scale, never a worse unit price.
    for (const key of ["starter", "growth", "pro"]) {
      const p = BILLING_PLANS[key];
      const perCredit = (p.amount / p.monthlyCredits) * 100;
      expect(perCredit, `${key} ¢/credit`).toBeCloseTo(2.0, 2);
    }
  });
});

describe("the cap rule — credits ≤ price × 0.60 ÷ $0.0115", () => {
  // This is what guarantees ≥40% gross margin even if a merchant pays once,
  // burns the entire allowance in month one and cancels. It is the only
  // scenario where generous caps can hurt, and the rule makes it survivable
  // rather than merely unlikely.
  it.each(["starter", "growth", "pro"])("%s stays under its ceiling", (key) => {
    const p = BILLING_PLANS[key];
    const ceiling = (p.amount * 0.6) / WORST_COST_PER_CREDIT;
    expect(p.monthlyCredits, `${key} exceeds the cap rule ceiling of ${Math.floor(ceiling)}`).toBeLessThanOrEqual(
      ceiling,
    );
  });

  it("burn-and-churn keeps money on every paid plan", () => {
    for (const key of ["starter", "growth", "pro"]) {
      const p = BILLING_PLANS[key];
      const fullBurn = p.monthlyCredits * WORST_COST_PER_CREDIT;
      expect(p.amount - fullBurn, `${key} loses money on a full burn`).toBeGreaterThan(0);
      expect((p.amount - fullBurn) / p.amount, `${key} margin`).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("the free tier has a bounded worst case", () => {
    // 100 credits at the worst per-credit cost. The PRODUCT cap is what bounds
    // the unmetered alt text on top of this — without it the free tier has no
    // ceiling at all.
    const worst = FREE_PLAN.monthlyCredits * WORST_COST_PER_CREDIT;
    expect(worst).toBeLessThan(2.0);
    expect(FREE_PLAN.productLimit).toBe(100);
  });
});

describe("both axes exist on every plan", () => {
  it("each plan declares credits AND a product limit", () => {
    for (const [name, p] of [["free", FREE_PLAN], ...Object.entries(BILLING_PLANS)]) {
      expect(Number.isFinite(p.monthlyCredits), `${name} has no monthlyCredits`).toBe(true);
      expect("productLimit" in p, `${name} has no productLimit`).toBe(true);
    }
  });

  it("only Pro is unlimited on products", () => {
    expect(BILLING_PLANS.pro.productLimit).toBeNull();
    for (const key of ["starter", "growth"]) {
      expect(Number.isFinite(BILLING_PLANS[key].productLimit)).toBe(true);
    }
  });

  it("nothing anywhere still says monthlyLimit", async () => {
    // The rename exists so nothing can read a CREDIT budget as a GENERATION
    // count. An alias left behind would defeat it.
    const { readFileSync, readdirSync } = await import("node:fs");
    const walk = (d) =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
      );
    const files = walk("app")
      .filter((f) => /\.(js|jsx)$/.test(f))
      // schemaColumns.generated.js is EXEMPT and must be: it lists the columns
      // that exist in the DATABASE, and the database column is still called
      // monthlyLimit. The rename was done with Prisma's @map so the client
      // exposes monthlyCredits without a real column rename — a rename would
      // have errored on every machine still serving the old build during a
      // rolling deploy, and there are two real merchants on this app. The drift
      // guard reads the real database, so this file naming the real column is
      // exactly right.
      .filter((f) => !f.endsWith(".generated.js"));
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes("monthlyLimit"));
    expect(offenders, `still reference monthlyLimit: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("ALL_BILLING_PLAN_KEYS still enumerates every name we can have created", () => {
  it("covers monthly AND annual for every plan", () => {
    // The comment in billing-plans.js records what happened last time it did
    // not: annual subscribers looked unsubscribed and were downgraded to Free
    // WHILE STILL BEING BILLED.
    for (const p of Object.values(BILLING_PLANS)) {
      expect(ALL_BILLING_PLAN_KEYS, `${p.planName} monthly key missing`).toContain(p.key);
      expect(ALL_BILLING_PLAN_KEYS, `${p.planName} annual key missing`).toContain(p.annualKey);
    }
  });
});
