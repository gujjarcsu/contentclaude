/**
 * P5.0 — the numbers that actually REACH SHOPIFY, and the numbers a merchant
 * actually READS.
 *
 * This file exists because of the most expensive false green in the project so
 * far. `TRIAL_DAYS = 14` was exported from `billing-plans.js`, asserted green by
 * `expect(TRIAL_DAYS).toBe(14)`, and **imported by nothing**. The value handed
 * to Shopify was a literal `trialDays: 7` in `shopify.server.js`. Production
 * granted 7-day trials, the locked table said 14, the plans page said 7 in six
 * places, and the test suite was green through all of it — because the
 * assertion proved a constant equals itself and executed no code path a
 * merchant can reach.
 *
 * Every assertion below is therefore on a CONSUMER, never on a constant:
 *
 *   - the object handed to `shopifyApp({ billing })`
 *   - the plan cards, comparison table and FAQ a merchant reads
 *   - that each exported constant has a non-test importer at all
 *
 * 07-VERIFICATION.md false green #11: an exported constant whose only consumer
 * is a test asserting its own value is dead code that greps as shipped.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  BILLING_PLANS,
  FREE_PLAN,
  TRIAL_DAYS,
  TRIAL_CREDITS,
} from "../../app/utils/billing-plans.js";
import { buildBillingConfig, formatPrice, annualSavingPct } from "../../app/utils/billing-config.js";

// Sentinels, not the real BillingInterval values: this test must not need the
// Shopify server bundle (which needs env, Prisma and a live session store) to
// assert on what that bundle is given.
const INTERVALS = { every30Days: "EVERY_30_DAYS", annual: "ANNUAL" };

const PLANS_SRC = readFileSync("app/routes/app.plans.jsx", "utf8");
const SHOPIFY_SRC = readFileSync("app/shopify.server.js", "utf8");

/**
 * Comment lines are stripped before any "the screen does not say X" assertion.
 * Learned the hard way in Phase 4: a presence check passed on a docstring that
 * merely QUOTED the merchant copy, so deleting the copy did not fail anything.
 */
function code(src) {
  return src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

describe("the billing object handed to Shopify", () => {
  const config = buildBillingConfig(INTERVALS);

  it("carries every plan, monthly AND annual", () => {
    const keys = Object.keys(config);
    for (const p of Object.values(BILLING_PLANS)) {
      expect(keys, `${p.planName} monthly`).toContain(p.key);
      expect(keys, `${p.planName} annual`).toContain(p.annualKey);
    }
    expect(keys).toHaveLength(Object.keys(BILLING_PLANS).length * 2);
  });

  // THE ONE THAT WOULD HAVE CAUGHT IT: the WIRING. Fails the moment a literal
  // reappears on this path, which is what was true in production for the whole
  // of Phase 4.
  it.each(Object.entries(buildBillingConfig(INTERVALS)))(
    "%s takes its trial length from the one definition",
    (key, entry) => {
      expect(entry.trialDays, `${key} trialDays`).toBe(TRIAL_DAYS);
    },
  );

  // AND THE VALUE, stated here independently as the literal 14.
  //
  // Asserting only `entry.trialDays === TRIAL_DAYS` proves the wiring and
  // nothing else: both sides move together, so editing the constant to 9 leaves
  // this file green. I know because I wrote it that way first, ran the break
  // test, and got ONE failure — in the old tautological assertion I was
  // replacing. Two defects need two assertions: the wiring above, and the
  // number here (14-PRICING.md §4, owner-approved 2026-09-14).
  it.each(Object.keys(buildBillingConfig(INTERVALS)))(
    "%s is created with 14 trial days, the locked number",
    (key) => {
      expect(config[key].trialDays, `${key} trialDays`).toBe(14);
    },
  );

  it("charges the locked amount on each entry", () => {
    for (const p of Object.values(BILLING_PLANS)) {
      expect(config[p.key].lineItems[0].amount, `${p.planName} monthly amount`).toBe(p.amount);
      expect(config[p.annualKey].lineItems[0].amount, `${p.planName} annual amount`).toBe(p.annualAmount);
      expect(config[p.key].lineItems[0].interval).toBe(INTERVALS.every30Days);
      expect(config[p.annualKey].lineItems[0].interval).toBe(INTERVALS.annual);
      expect(config[p.key].lineItems[0].currencyCode).toBe("USD");
    }
  });

  it("shopify.server.js hands this builder's output straight through", () => {
    // Without this, the builder could be correct and unused — the same defect
    // one level up.
    expect(code(SHOPIFY_SRC)).toMatch(/billing:\s*buildBillingConfig\(/);
  });

  it("no literal trial length survives anywhere on the path to Shopify", () => {
    // The whole bug in one assertion.
    expect(code(SHOPIFY_SRC)).not.toMatch(/trialDays:\s*\d/);
    expect(code(PLANS_SRC)).not.toMatch(/\d+[- ]day free trial/i);
  });

  it("refuses to build without real intervals rather than sending undefined", () => {
    expect(() => buildBillingConfig({ every30Days: "X" })).toThrow();
    expect(() => buildBillingConfig({})).toThrow();
  });
});

describe("the plans page a merchant reads", () => {
  it("states no price as a literal", () => {
    // $99.90 / $299.90 / $799.90 sat on this page as strings while the app
    // charged $95.90 / $287.90 / $767.90. Both the displayed discount and the
    // displayed price were wrong, and no test touched either.
    const literals = code(PLANS_SRC).match(/["'`]\$\d[\d,.]*["'`]/g) ?? [];
    expect(literals, `hardcoded prices on the plans page: ${literals.join(", ")}`).toEqual([]);
  });

  it("states no allowance as a literal", () => {
    // "25" / "50" / "200" / "1,000" were the pre-B2 allowances and outlived them.
    //
    // Polaris spacing tokens are attribute values of exactly the same shape
    // (gap="200", padding="400"), so they are stripped first. Without that the
    // assertion fires on layout and has to be weakened to pass — which is how
    // false green #3 gets manufactured.
    const src = code(PLANS_SRC).replace(/[a-zA-Z]+=["']\d+["']/g, "");
    for (const n of [25, 50, 200, 1000, 100, 500, 1500, 4000]) {
      const asString = new RegExp(`["']${n.toLocaleString()}["']`);
      expect(src, `allowance ${n} hardcoded`).not.toMatch(asString);
    }
  });

  it("that strip does not hide a real allowance literal", () => {
    // Proving the exclusion above is narrow: an allowance written the way the
    // page used to write it still fails.
    const stripped = (t) => t.replace(/[a-zA-Z]+=["']\d+["']/g, "");
    expect(stripped('gap="200"')).not.toMatch(/["']200["']/);
    expect(stripped('{ feature: "x", growth: "200" }')).toMatch(/["']200["']/);
  });

  it("derives the comparison table from the entitlements the gate reads", () => {
    // The Bulk row said Starter: NO for as long as B3 had said Starter: YES.
    expect(code(PLANS_SRC)).toMatch(/ent\("starter", "bulkJobs"\)/);
    expect(code(PLANS_SRC)).not.toMatch(/feature: "Bulk generation jobs",\s*free: false, starter: false/);
  });

  it("never says '2 months free', which is 16.7% and not what we charge", () => {
    // 14-PRICING.md §4 bans the phrase by name. It was rendering on the annual
    // toggle of every paid card.
    expect(code(PLANS_SRC)).not.toMatch(/months? free/i);
    expect(code(SHOPIFY_SRC)).not.toMatch(/months? free/i);
    expect(code(PLANS_SRC)).toMatch(/annualSavingPct\(/);
  });

  it("tells the merchant the trial allowance, not just its length", () => {
    expect(code(PLANS_SRC)).toMatch(/TRIAL_CREDITS/);
    expect(code(PLANS_SRC)).toMatch(/TRIAL_DAYS/);
  });

  it("shows the product cap, which is a locked axis and appeared nowhere", () => {
    expect(code(PLANS_SRC)).toMatch(/productLimit/);
  });

  it("quotes the credit weights from credits.js, not from memory", () => {
    // `credits.js` opens with "PURE and client-safe: the plans page and the
    // quota surfaces show these numbers". That sentence was aspirational — the
    // page predated B1 and still described the flat one-per-generation model,
    // so alt text read as chargeable and a blog post read as 1 credit. I then
    // fixed the copy by typing "3" and "0" into it, which is the same defect in
    // a new place; this assertion is what stopped that surviving.
    expect(code(PLANS_SRC)).toMatch(/CREDIT_WEIGHTS\.blog/);
    expect(code(PLANS_SRC)).toMatch(/CREDIT_WEIGHTS\.altText/);
    expect(code(PLANS_SRC)).not.toMatch(/\(\d+ credits? each\)/);
    expect(code(PLANS_SRC)).not.toMatch(/costs \d+ credits/);
  });
});

describe("the derived display helpers", () => {
  it("formats money the way a billing screen must", () => {
    expect(formatPrice(9.99)).toBe("$9.99");
    expect(formatPrice(95.9)).toBe("$95.90"); // not "$95.9"
    expect(formatPrice(767.9)).toBe("$767.90");
    expect(formatPrice(0)).toBe("$0");
  });

  it("computes 20% for every paid tier, from the prices themselves", () => {
    for (const key of ["starter", "growth", "pro"]) {
      expect(annualSavingPct(BILLING_PLANS[key]), `${key}`).toBe(20);
    }
  });
});

describe("L18 — every locked constant has a consumer that is not a test", () => {
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
    );
  const appFiles = walk("app").filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith("billing-plans.js"));
  const appSrc = appFiles.map((f) => readFileSync(f, "utf8")).join("\n");

  // This is false green #11 made mechanical. TRIAL_DAYS was exported, asserted
  // and unimported for the entire life of the constant.
  it.each([
    ["TRIAL_DAYS", TRIAL_DAYS],
    ["TRIAL_CREDITS", TRIAL_CREDITS],
    ["BILLING_PLANS", BILLING_PLANS],
    ["FREE_PLAN", FREE_PLAN],
    ["planLimitsFor", null],
    ["getEntitlements", null],
    ["bulkRefusal", null],
    ["ALL_BILLING_PLAN_KEYS", null],
  ])("%s is imported by shipped code, not only by a test", (name) => {
    const importers = appFiles.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /from\s+["'][^"']*billing-plans\.js["']/.test(src) && new RegExp(`\\b${name}\\b`).test(src);
    });
    expect(importers, `${name} has no non-test importer — it is dead code that greps as shipped`)
      .not.toEqual([]);
  });

  it("the locked values appear nowhere else as literals in shipped code", () => {
    // Excludes billing-plans.js itself (the one definition) and matches the
    // distinctive prices only — 9.99 and 29.99 are unambiguous, and the annual
    // figures could not occur by accident.
    const stripped = code(appSrc);
    for (const n of ["9.99", "29.99", "79.99", "95.9", "287.9", "767.9"]) {
      const hits = [...stripped.matchAll(new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`, "g"))];
      expect(hits.length, `${n} is hardcoded outside billing-plans.js`).toBe(0);
    }
  });
});
