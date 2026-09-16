/**
 * Phase 15 — THE TWO PLAN-INTEGRITY DEFECTS CW's THIRD CONFUSION COUNT FOUND,
 * and they are not confusions. They are the plans table and the code
 * disagreeing about what a merchant gets for money.
 *
 *  1. The first screen's primary (dark) control on a FREE store was
 *     "Write the rest in bulk", and every bulk run is a Starter feature.
 *  2. Blog generation was fully open on Free and stated no price, while the
 *     plans page sells blog posts from Growth at 3 credits each.
 *
 * `14-PRICING.md` §4 is the owner-approved table (04-DECISIONS.md §PRICING), so
 * it is the side that was right and the code is what changed. Each case below
 * FAILS on the code as it stood.
 *
 * A third defect surfaced while fixing the first, and it is the worse half:
 * `/app/fix` — the page the first screen's dark button points at — ran every
 * one of its bulk sections with no entitlement check at all. The table said
 * "Bulk runs ✗" for Free and the page did them anyway.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// ── mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));

vi.mock("../../app/db.server", () => ({
  default: {
    blogPost: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "b1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    brandVoice: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

const checkEntitlement = vi.fn();
const startContentJob = vi.fn(async () => ({ jobId: "j1", queued: 1, quotaSkipped: 0 }));
const applyVendor = vi.fn(async () => ({ applied: 1, failed: [] }));
const applyOptionNames = vi.fn(async () => ({ applied: 1, failed: [] }));
const applyBarcodes = vi.fn(async () => ({ applied: 1, failed: [] }));
const setGtinExempt = vi.fn(async () => ({ applied: 1, failed: [] }));

vi.mock("../../app/utils/plans.server.js", () => ({
  getOrCreatePlan: vi.fn(async () => ({ planName: "free", monthlyCredits: 100 })),
  getMonthlyUsageCount: vi.fn(async () => 0),
  remainingGenerations: vi.fn(async () => 99),
  checkEntitlement: (...a) => checkEntitlement(...a),
  withGenerationCredit: vi.fn(async (shop, key, work) => ({ allowed: true, gate: { allowed: true, remaining: 9 }, result: await work({ allowed: true }), refunded: false })),
}));

vi.mock("../../app/utils/remediation.server.js", () => ({
  remediationCandidates: vi.fn(async () => ({})),
  proposeOptionNames: vi.fn(async () => []),
  firstVariants: vi.fn(async () => []),
  isRemediationLocked: vi.fn(() => false),
  applyVendor: (...a) => applyVendor(...a),
  applyOptionNames: (...a) => applyOptionNames(...a),
  applyBarcodes: (...a) => applyBarcodes(...a),
  setGtinExempt: (...a) => setGtinExempt(...a),
  startContentJob: (...a) => startContentJob(...a),
}));

vi.mock("../../app/utils/rateLimit.server.js", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (k, fn) => fn()), invalidateCache: vi.fn() }));
vi.mock("../../app/utils/upgradePrompts.server.js", () => ({ getUpsell: vi.fn(async () => null), getQuotaWarning: vi.fn(async () => null) }));
vi.mock("../../app/utils/ai.server.js", () => ({ generateBlogPost: vi.fn(async () => ({ title: "T", content: "C" })) }));
vi.mock("../../app/utils/shopName.server.js", () => ({ getLiveShopName: vi.fn(async () => "Shop") }));

const { FREE_PLAN, BILLING_PLANS, getEntitlements, cheapestPlanWith, cheapestPlanLabelWith, blogRefusal, bulkRefusal } =
  await import("../../app/utils/billing-plans.js");
const { CREDIT_WEIGHTS, creditsFor } = await import("../../app/utils/credits.js");
const { canRunFix, primaryFixIndex, BLOCKER_GROUPS } = await import("../../app/utils/firstRun.js");

const read = (f) => readFileSync(f, "utf8");
/** The repo's own recorded lesson: a source-reading guard must strip comments. */
const strip = (s) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

function postRequest(url, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request(url, { method: "POST", body: fd });
}

async function mockAdmin(shop = "free-shop.myshopify.com") {
  const { authenticate } = await import("../../app/shopify.server");
  authenticate.admin.mockResolvedValue({
    admin: { graphql: vi.fn(async () => ({ json: async () => ({ data: {} }), status: 200, headers: { get: () => null } })) },
    session: { shop },
    billing: {},
  });
}

// ── 1. the table and the code ────────────────────────────────────────────────
describe("the entitlement matrix IS the locked table", () => {
  // 14-PRICING.md §4, read off the table rather than remembered.
  const PRICING = read("docs/navaal/14-PRICING.md");

  it("14-PRICING.md still sells blog posts from Growth, and bulk from Starter", () => {
    // If the owner moves either row, this fails and the code below is re-decided
    // deliberately — rather than the table and the code drifting in silence,
    // which is the whole defect.
    expect(PRICING).toMatch(/\|\s*Blog posts \*\(3 credits each\)\*\s*\|\s*—\s*\|\s*—\s*\|\s*✓\s*\|\s*✓\s*\|/);
    expect(PRICING).toMatch(/\|\s*\*\*Bulk generation\*\*\s*\|\s*\*\*✗[^|]*\*\*\s*\|\s*\*\*✓\*\*\s*\|/);
  });

  it("blogPosts: free no, starter no, growth yes, pro yes", () => {
    expect(getEntitlements("free").blogPosts).toBe(false);
    expect(getEntitlements("starter").blogPosts).toBe(false);
    expect(getEntitlements("growth").blogPosts).toBe(true);
    expect(getEntitlements("pro").blogPosts).toBe(true);
  });

  it("an unknown plan name falls back to Free, so a parsing slip cannot hand out a paid feature", () => {
    expect(getEntitlements("enterprise-unlimited").blogPosts).toBe(false);
    expect(getEntitlements(undefined).blogPosts).toBe(false);
  });

  it("bulkJobs is unchanged: free no, starter yes", () => {
    expect(FREE_PLAN.entitlements.bulkJobs).toBe(false);
    expect(BILLING_PLANS.starter.entitlements.bulkJobs).toBe(true);
  });

  it("the plan a marker names is derived from the table, never typed", () => {
    expect(cheapestPlanWith("bulkJobs")).toBe(BILLING_PLANS.starter);
    expect(cheapestPlanWith("blogPosts")).toBe(BILLING_PLANS.growth);
    expect(cheapestPlanLabelWith("bulkJobs")).toBe("Starter");
    expect(cheapestPlanLabelWith("blogPosts")).toBe("Growth");
    expect(cheapestPlanWith("noSuchFeature")).toBeNull();
  });

  it("both refusals quote the plan's real price and allowance", () => {
    expect(bulkRefusal("X")).toContain(`$${BILLING_PLANS.starter.amount}`);
    const blog = blogRefusal(CREDIT_WEIGHTS.blog);
    expect(blog).toContain("Growth");
    expect(blog).toContain(`$${BILLING_PLANS.growth.amount}`);
    expect(blog).toContain("3 credits");
    // never a dead end: it says what happens to work already done
    expect(blog).toMatch(/already written/i);
  });
});

// ── 2. blog: the gate ────────────────────────────────────────────────────────
describe("blog generation is gated where the table says it is", () => {
  beforeEach(() => vi.clearAllMocks());

  it("THE DEFECT: a Free shop asking for a post is refused, not charged", async () => {
    await mockAdmin();
    checkEntitlement.mockResolvedValue({ allowed: false, requiredPlan: "Growth" });
    const { action } = await import("../../app/routes/app.blog.jsx");
    const res = await action({ request: postRequest("https://app.test/app/blog", { actionType: "generate", topic: "Spring care" }) });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.limitReached).toBe(true);
    expect(body.error).toContain("Growth");
    expect(checkEntitlement).toHaveBeenCalledWith("free-shop.myshopify.com", "blogPosts");
  });

  it("the refusal happens BEFORE the credit is reserved and before the model is called", async () => {
    await mockAdmin();
    checkEntitlement.mockResolvedValue({ allowed: false });
    const plans = await import("../../app/utils/plans.server.js");
    const ai = await import("../../app/utils/ai.server.js");
    const { action } = await import("../../app/routes/app.blog.jsx");
    await action({ request: postRequest("https://app.test/app/blog", { actionType: "generate", topic: "Spring care" }) });
    expect(plans.withGenerationCredit).not.toHaveBeenCalled();
    expect(ai.generateBlogPost).not.toHaveBeenCalled();
  });

  it("a Growth shop still generates, and the credit key is the blog one", async () => {
    await mockAdmin("growth-shop.myshopify.com");
    checkEntitlement.mockResolvedValue({ allowed: true });
    const plans = await import("../../app/utils/plans.server.js");
    const { action } = await import("../../app/routes/app.blog.jsx");
    await action({ request: postRequest("https://app.test/app/blog", { actionType: "generate", topic: "Spring care" }) });
    expect(plans.withGenerationCredit).toHaveBeenCalled();
    const [, key] = plans.withGenerationCredit.mock.calls[0];
    // The contentType is what decides the price. "blog" is 3; anything else is 1.
    expect(key.contentType).toBe("blog");
  });

  it("the loader ships the answer and the price as DATA, never as a sentence", async () => {
    const src = strip(read("app/routes/app.blog.jsx"));
    expect(src).toMatch(/blogEntitled: !!blogEnt\.allowed/);
    expect(src).toMatch(/blogCredits: CREDIT_WEIGHTS\.blog/);
    // D6 — a loader ships data and the screen makes the sentence. The one
    // built sentence in this file belongs to the ACTION, which is the server's
    // last word and never renders through the translator.
    const loaderStart = src.indexOf("export const loader");
    const actionStart = src.indexOf("export const action");
    expect(loaderStart).toBeGreaterThan(-1);
    expect(actionStart).toBeGreaterThan(loaderStart);
    expect(src.slice(loaderStart, actionStart)).not.toContain("blogRefusal");
    expect(src.slice(actionStart)).toContain("blogRefusal(CREDIT_WEIGHTS.blog)");
  });
});

// ── 3. blog: the debit, proved rather than asserted ──────────────────────────
describe("a blog post costs exactly 3 credits, and the debit is real", () => {
  it("creditsFor('blog') is 3 and a description is 1", () => {
    expect(creditsFor("blog")).toBe(3);
    expect(creditsFor("description")).toBe(1);
    expect(creditsFor("altText")).toBe(0);
  });

  it("a bundle containing a blog is charged 3, never smuggled through at 1", () => {
    expect(creditsFor("description,blog")).toBe(3);
  });

  // The UsageRecord written for a blog carries credits: 3, driven through the
  // real transaction body — in tests/utils/blogCredit.test.js, because this
  // file replaces plans.server.js wholesale and the gate must be the real one.

  it("the screen says the price on the button that spends it", () => {
    const src = strip(read("app/routes/app.blog.jsx"));
    expect(src).toMatch(/Costs \{credits\} credits/);
    // and the number comes from the weight table, not from a literal 3
    expect(src).toMatch(/credits: blogCredits/);
    expect(src).not.toMatch(/Costs 3 credits/);
  });

  it("the plans comparison carries a blog row, derived from the same entitlement", () => {
    const src = strip(read("app/routes/app.plans.jsx"));
    expect(src).toMatch(/free: ent\("free", "blogPosts"\)/);
    expect(src).toMatch(/growth: ent\("growth", "blogPosts"\)/);
    // the row's number is the weight, so the table and the debit cannot drift
    expect(src).toMatch(/feature: T\("Blog posts \(\{n\} credits each\)"\),\s*\n\s*vars: \{ n: CREDIT_WEIGHTS\.blog \}/);
  });
});

// ── 4. /app/fix: every section on it is a bulk run ───────────────────────────
describe("the fix page is a bulk run, and now says so", () => {
  const BULK = ["apply_vendor", "apply_options", "apply_barcodes", "start_alt_text", "start_descriptions"];
  beforeEach(() => vi.clearAllMocks());

  for (const intent of BULK) {
    it(`THE DEFECT: '${intent}' ran on Free with no entitlement check; it is refused now`, async () => {
      await mockAdmin();
      checkEntitlement.mockResolvedValue({ allowed: false });
      const { action } = await import("../../app/routes/app.fix.jsx");
      const res = await action({
        request: postRequest("https://app.test/app/fix", { intent, items: JSON.stringify([{ productId: "gid://shopify/Product/1" }]) }),
      });
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.limitReached).toBe(true);
      expect(body.error).toContain("Starter");
      expect(checkEntitlement).toHaveBeenCalledWith("free-shop.myshopify.com", "bulkJobs");
      // and nothing was written
      expect(applyVendor).not.toHaveBeenCalled();
      expect(applyOptionNames).not.toHaveBeenCalled();
      expect(applyBarcodes).not.toHaveBeenCalled();
      expect(startContentJob).not.toHaveBeenCalled();
    });
  }

  it("'gtin_exempt' is NOT gated — it writes a preference, not a catalogue", async () => {
    await mockAdmin();
    checkEntitlement.mockResolvedValue({ allowed: false });
    const { action } = await import("../../app/routes/app.fix.jsx");
    const res = await action({
      request: postRequest("https://app.test/app/fix", { intent: "gtin_exempt", items: JSON.stringify([{ productId: "gid://shopify/Product/1" }]) }),
    });
    expect(res.status).toBe(200);
    expect(setGtinExempt).toHaveBeenCalled();
    // charging a merchant to stop being nagged would be the wrong direction
    expect(checkEntitlement).not.toHaveBeenCalled();
  });

  it("an entitled shop is not blocked", async () => {
    await mockAdmin("starter-shop.myshopify.com");
    checkEntitlement.mockResolvedValue({ allowed: true });
    const { action } = await import("../../app/routes/app.fix.jsx");
    const res = await action({
      request: postRequest("https://app.test/app/fix", { intent: "start_descriptions", items: JSON.stringify([{ productId: "gid://shopify/Product/1" }]) }),
    });
    expect(res.status).toBe(200);
    expect(startContentJob).toHaveBeenCalled();
  });

  it("the screen disables the section and says why, before the press", () => {
    const src = strip(read("app/routes/app.fix.jsx"));
    expect(src).toMatch(/disabled=\{locked \|\| gated \|\|/);
    expect(src).toMatch(/Fixing many products at once is on \{plan\} and above/);
    // the marker names the plan from the table
    expect(src).toMatch(/cheapestPlanLabelWith\("bulkJobs"\)/);
    // and the loader ships the flag, not the sentence
    expect(src).toMatch(/bulkEntitled: !!bulkEnt\.allowed/);
  });
});

// ── 5. the first screen must not dead-end ────────────────────────────────────
describe("the Free first screen's dark button is something Free can press", () => {
  it("every blocker fix that goes to /app/fix is marked needsBulk, except the preference", () => {
    const toFix = BLOCKER_GROUPS.filter((g) => g.fix && !g.fix.external);
    expect(toFix.length).toBeGreaterThan(0);
    for (const g of toFix) {
      const isPreference = g.key === "openai·gtin·degrading";
      expect(!!g.fix.needsBulk, `${g.key}`).toBe(!isPreference);
    }
    // an external fix opens Shopify admin and needs nothing from us
    for (const g of BLOCKER_GROUPS.filter((g) => g.fix?.external)) expect(g.fix.needsBulk).toBeUndefined();
  });

  it("canRunFix: a bulk fix is refused without the entitlement and allowed with it", () => {
    expect(canRunFix({ needsBulk: true }, { bulkJobs: false })).toBe(false);
    expect(canRunFix({ needsBulk: true }, { bulkJobs: true })).toBe(true);
    expect(canRunFix({}, { bulkJobs: false })).toBe(true);
    expect(canRunFix(null, {})).toBe(false);
    expect(canRunFix({ needsBulk: true }, undefined)).toBe(false);
  });

  it("THE DEFECT: on Free the primary moves to the first fix the plan can run", () => {
    const blockers = [
      { key: "a", fix: { needsBulk: true } },
      { key: "b", fix: { needsBulk: true } },
      { key: "c", fix: {} },
    ];
    // the old screen made index 0 primary unconditionally
    expect(primaryFixIndex(blockers, getEntitlements("free"))).toBe(2);
    expect(primaryFixIndex(blockers, getEntitlements("starter"))).toBe(0);
  });

  it("when the plan can run none of them, nothing is primary — a dark button that refuses is worse", () => {
    expect(primaryFixIndex([{ fix: { needsBulk: true } }], getEntitlements("free"))).toBe(-1);
    expect(primaryFixIndex([], getEntitlements("free"))).toBe(-1);
    expect(primaryFixIndex(null, getEntitlements("free"))).toBe(-1);
  });

  it("the first-run screen binds the primary to that index, not to the first row", () => {
    const src = strip(read("app/components/StartState.jsx"));
    expect(src).toMatch(/primaryFixIndex\(blockers, entitlements\)/);
    expect(src).toMatch(/variant=\{i === primaryIndex \? "primary" : undefined\}/);
    // the old, unconditional form is gone
    expect(src).not.toMatch(/variant=\{i === 0 \? "primary" : undefined\}/);
  });

  it("a fix this plan cannot run carries a marker naming the plan that can", () => {
    const src = strip(read("app/components/StartState.jsx"));
    expect(src).toMatch(/!canRunFix\(b\.fix, entitlements\)/);
    expect(src).toMatch(/\{plan\} and above/);
    expect(src).toMatch(/cheapestPlanLabelWith\("bulkJobs"\)/);
  });
});
