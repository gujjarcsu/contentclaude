/**
 * B1 — credit weighting. What one generation costs a merchant.
 *
 * Every generation used to cost one unit of the monthly limit, and the units
 * were not comparable: alt text costs $0.000906 and a blog post $0.0300 — a 33×
 * spread, MEASURED through the real code path in P0.6 (`08-ECONOMICS.md` §2).
 * Selling both as "one generation" makes the plan's true cost depend entirely on
 * the mix, and the worst case is three times the plan.
 *
 * After weighting the worst cost per credit is $0.0115 whatever the merchant
 * generates, which is the whole reason the ≥42% margin in `14-PRICING.md` §3
 * holds.
 */
import { describe, it, expect } from "vitest";
import { creditsFor, isUnmetered, CREDIT_WEIGHTS, FREE_CONTENT_TYPES } from "../../app/utils/credits.js";
import { MODEL_FOR } from "../../app/utils/modelPricing.js";

describe("B1 — credits per content type", () => {
  it.each([
    ["altText", 0],
    ["blog", 3],
    ["description", 1],
    ["metaTitle", 1],
    ["metaDescription", 1],
    ["faq", 1],
    ["social", 1],
    ["collection", 1],
    ["enhance", 1],
    ["product", 1],
  ])("%s costs %i credit(s)", (type, expected) => {
    expect(creditsFor(type)).toBe(expected);
  });

  it("alt text is unmetered — it is the highest-volume call and costs a thirteenth of a product", () => {
    expect(creditsFor("altText")).toBe(0);
    expect(isUnmetered("altText")).toBe(true);
    expect(FREE_CONTENT_TYPES).toContain("altText");
  });

  it("a blog post costs 3, because it genuinely costs 2.6× a product generation", () => {
    expect(creditsFor("blog")).toBe(3);
    expect(creditsFor("blog")).toBeGreaterThan(creditsFor("description"));
  });
});

describe("B1 — an unknown content type FAILS LOUDLY rather than defaulting to 1", () => {
  // 14-PRICING.md §6 item 1 and the brief are explicit about this. A silent
  // default is how the margin arithmetic in §3 stops being true without anybody
  // noticing: a new frontier-model content type would bill as one credit for
  // ever and nothing would say so.
  it("throws, and names the file to edit", () => {
    expect(() => creditsFor("podcast")).toThrow(/No credit weight for content type "podcast"/);
    expect(() => creditsFor("podcast")).toThrow(/app\/utils\/credits\.js/);
  });

  it("throws on an empty or missing content type rather than charging zero", () => {
    // An unbilled generation is a hole in the margin arithmetic.
    expect(() => creditsFor("")).toThrow();
    expect(() => creditsFor(null)).toThrow();
    expect(() => creditsFor(undefined)).toThrow();
    expect(() => creditsFor("   ")).toThrow();
  });

  it("isUnmetered never throws — it is used to decide what to SHOW", () => {
    // A UI asking "is this free?" must not take the page down on a typo.
    expect(isUnmetered("podcast")).toBe(false);
  });
});

describe("B1 — bulk bundles, which is what is actually stored", () => {
  // bulkProcessor passes job.contentTypes straight to the gate, and that is a
  // CSV string: "description,metaTitle,metaDescription". It lands in
  // UsageRecord.contentType verbatim, so the weighting has to handle it.
  it("a description+metas bundle is ONE credit — it is one Anthropic call", () => {
    expect(creditsFor("description,metaTitle,metaDescription")).toBe(1);
  });

  it("charges the MAX of a bundle, not the sum", () => {
    // Sum would make the standard bulk bundle cost 3 and triple every bulk
    // job's price overnight.
    expect(creditsFor("description,metaTitle,metaDescription")).not.toBe(3);
    // and a bundle containing a blog is not smuggled through at 1
    expect(creditsFor("description,blog")).toBe(3);
  });

  it("a bundle containing alt text still costs what the other half costs", () => {
    expect(creditsFor("description,altText")).toBe(1);
  });

  it("tolerates spacing in the stored CSV", () => {
    expect(creditsFor("description, metaTitle , metaDescription")).toBe(1);
  });

  it("an unknown member fails the whole bundle", () => {
    expect(() => creditsFor("description,podcast")).toThrow(/podcast/);
  });
});

describe("B1 — the table stays in step with the rest of the app", () => {
  it("every content type that has a MODEL has a credit weight", () => {
    // If a content type can be generated, it can be billed. A model without a
    // weight is a generation that would throw at the gate in production.
    for (const type of Object.keys(MODEL_FOR)) {
      expect(() => creditsFor(type), `${type} has a model but no credit weight`).not.toThrow();
    }
  });

  it("carryover costs exactly 1, or reinstalling hands back free credits", () => {
    // restoreUsageCarryover writes one of these per credit already spent this
    // month, so an uninstall/reinstall cannot reset the allowance.
    expect(CREDIT_WEIGHTS.carryover).toBe(1);
  });

  it("no weight is negative, and none is absurdly large", () => {
    for (const [type, n] of Object.entries(CREDIT_WEIGHTS)) {
      expect(Number.isInteger(n), `${type} is not an integer`).toBe(true);
      expect(n, `${type} is negative`).toBeGreaterThanOrEqual(0);
      expect(n, `${type} is implausibly expensive`).toBeLessThanOrEqual(10);
    }
  });
});
