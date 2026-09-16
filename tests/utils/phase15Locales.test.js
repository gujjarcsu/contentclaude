/**
 * Phase 15 — the sentences this phase added read in all seven languages.
 *
 * Two of them are plan markers and one is a plural sentence with four plural
 * clauses in it. A marker that renders as a raw ICU brace, or a plural that
 * drops a branch in one locale, is a merchant-visible defect that no other test
 * here would catch: `i18nLocales.test.js` holds the register and the credit
 * unit, not whether a given message compiles.
 *
 * The plan NAME inside each marker comes from the billing table, so these also
 * confirm a translation has not quietly translated "Starter" away.
 */
import { describe, it, expect } from "vitest";
import { createT, LIVE_UI_LOCALES } from "../../app/i18n/index.js";
import "../../app/i18n/catalogues.server.js";
import { cheapestPlanLabelWith } from "../../app/utils/billing-plans.js";
import { CREDIT_WEIGHTS } from "../../app/utils/credits.js";

const BULK_PLAN = cheapestPlanLabelWith("bulkJobs");
const BLOG_PLAN = cheapestPlanLabelWith("blogPosts");

const KEYS = [
  ["{plan} and above", { plan: BULK_PLAN }, BULK_PLAN],
  ["Costs {credits} credits", { credits: CREDIT_WEIGHTS.blog }, "3"],
  ["Blog posts are on {plan} and above", { plan: BLOG_PLAN }, BLOG_PLAN],
  [
    "A post costs {credits} credits, several times what a product description costs — which is why it is not on the free plan. {plan} is {price} a month with {planCredits} credits.",
    { credits: CREDIT_WEIGHTS.blog, plan: BLOG_PLAN, price: "$29.99", planCredits: 1500 },
    BLOG_PLAN,
  ],
  ["Posts you have already written stay here, and you can still publish them.", {}, null],
  [
    "Fixing many products at once is on {plan} and above. Everything listed here stays visible on every plan, and you can still write for one product at a time from its own page.",
    { plan: BULK_PLAN },
    BULK_PLAN,
  ],
  ["{state} · not on your Online Store, so it has no public page", { state: "Published" }, null],
];

const PLURAL_LINE =
  "{n, plural, one {# product here is not on your Online Store, so it is listed but not counted in the totals above. Publish it in Shopify and it joins the counts.} other {# products here are not on your Online Store, so they are listed but not counted in the totals above. Publish them in Shopify and they join the counts.}}";

for (const loc of LIVE_UI_LOCALES) {
  describe(`${loc}`, () => {
    const t = createT(loc);

    for (const [key, vars, mustContain] of KEYS) {
      it(`renders: ${key.slice(0, 44)}…`, () => {
        const out = t(key, vars);
        expect(out, "message did not render").toBeTruthy();
        // a leftover brace means the message failed to compile or a variable is missing
        expect(out, `unresolved placeholder in ${loc}`).not.toMatch(/[{}]/);
        if (mustContain) expect(out, `plan name or number lost in ${loc}`).toContain(mustContain);
        if (loc !== "en") expect(out, `English left in place in ${loc}`).not.toBe(t.locale === "en" ? out : key);
      });
    }

    it("the off-storefront sentence renders for one and for many", () => {
      const one = t(PLURAL_LINE, { n: 1 });
      const many = t(PLURAL_LINE, { n: 2 });
      for (const out of [one, many]) {
        expect(out).toBeTruthy();
        expect(out, `unresolved plural branch in ${loc}`).not.toMatch(/[{}]/);
        expect(out).not.toMatch(/\bplural\b/);
      }
      expect(one).toContain("1");
      expect(many).toContain("2");
      // Japanese has one plural category; every other live locale has two, so
      // the singular and the plural must actually differ.
      if (loc !== "ja") expect(one, `${loc} uses one form for both`).not.toBe(many.replace("2", "1"));
    });
  });
}
