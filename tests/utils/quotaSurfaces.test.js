/**
 * Phase 3 item 3.4 — two upsell surfaces, not six.
 *
 * A merchant who hit their quota used to meet six of them: the Home hero, the
 * Home usage card, a Products banner, the Products bulk panel, the product page
 * twice, and Optimize. Each was defensible alone; the sum was not. The app
 * spent a merchant's worst moment — the moment it stopped doing the thing they
 * wanted — asking them for money six times.
 *
 * These tests are mostly about restraint: where the banner does NOT appear,
 * what it does NOT claim, and what an attribution refuses to invent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const { prisma, recordPromptCondition } = vi.hoisted(() => ({
  prisma: {
    upgradePrompt: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn() },
    shop: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
  recordPromptCondition: vi.fn(async () => ({ id: "prm_1", dismissedAt: null })),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/upgradePrompts.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/upgradePrompts.server.js");
  return { ...actual, recordPromptCondition };
});

const {
  quotaLevel,
  quotaPct,
  dismissalActive,
  getQuotaWarning,
  normalizeFrom,
  recordArrivedFrom,
  stampUpgradeSource,
  WARN_AT_PCT,
  DISMISS_DAYS,
  WARN_SURFACES,
  FROM_WARN,
  FROM_EXHAUSTED,
} = await import("../../app/utils/quotaSurfaces.server.js");

const SHOP = "a-store.myshopify.com";
const freePlan = { planName: "free", monthlyLimit: 25, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  recordPromptCondition.mockResolvedValue({ id: "prm_1", dismissedAt: null });
  prisma.upgradePrompt.updateMany.mockResolvedValue({ count: 1 });
  prisma.shop.updateMany.mockResolvedValue({ count: 1 });
});

describe("which state a shop is in", () => {
  it.each([
    [0, 25, "ok"],
    [19, 25, "ok"],
    [20, 25, "warn"], // exactly 80%
    [24, 25, "warn"],
    [25, 25, "exhausted"],
    [40, 25, "exhausted"], // over is still exhausted, never a fourth state
  ])("%i of %i is %s", (used, limit, expected) => {
    expect(quotaLevel(used, limit)).toBe(expected);
  });

  it("a limit of zero is not 'exhausted' — an unmetered plan is not out of quota", () => {
    // Getting this wrong would put every screen of an unmetered or
    // misconfigured plan into the out-of-quota state.
    expect(quotaLevel(0, 0)).toBe("ok");
    expect(quotaLevel(500, 0)).toBe("ok");
    expect(quotaPct(500, 0)).toBe(0);
  });

  it("percent is capped at 100 — reaching a quota is 100%, never 104%", () => {
    expect(quotaPct(26, 25)).toBe(100);
    expect(quotaPct(20, 25)).toBe(80);
  });

  it("the threshold is the brief's 80", () => {
    expect(WARN_AT_PCT).toBe(80);
  });
});

describe("the warning banner appears once, and only where it should", () => {
  it("renders between 80% and 100%", async () => {
    const w = await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 20, surface: "dashboard" });
    expect(w).toBeTruthy();
    expect(w.level).toBe("warn");
    expect(w.from).toBe(FROM_WARN);
  });

  it("does not render below the threshold", async () => {
    expect(
      await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 19, surface: "dashboard" }),
    ).toBeNull();
  });

  it("does not render at 100% — that is the card's job, where the action is", async () => {
    expect(
      await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 25, surface: "dashboard" }),
    ).toBeNull();
  });

  it.each(["product_page", "optimize", "blog", "seo_audit", "jobs"])(
    "does not render on %s — only Home and Products carry it",
    async (surface) => {
      expect(await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 22, surface })).toBeNull();
    },
  );

  it("carries it on exactly the two screens the brief names", () => {
    expect([...WARN_SURFACES].sort()).toEqual(["dashboard", "products"]);
  });

  it("says nothing to a shop already on the top plan — there is nothing honest to sell", async () => {
    const pro = { planName: "pro", monthlyLimit: 1000, status: "active" };
    expect(
      await getQuotaWarning({ shop: SHOP, plan: pro, usageCount: 900, surface: "dashboard" }),
    ).toBeNull();
  });

  it("says nothing while a plan is not active", async () => {
    expect(
      await getQuotaWarning({
        shop: SHOP,
        plan: { ...freePlan, status: "pending" },
        usageCount: 22,
        surface: "dashboard",
      }),
    ).toBeNull();
  });

  it("never throws — an upsell is not worth a broken screen", async () => {
    recordPromptCondition.mockRejectedValue(new Error("db down"));
    expect(
      await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 22, surface: "dashboard" }),
    ).toBeNull();
  });
});

describe("dismissal sticks for a week", () => {
  it("is the brief's 7 days", () => {
    expect(DISMISS_DAYS).toBe(7);
  });

  it("hides the banner while a dismissal is in force", async () => {
    recordPromptCondition.mockResolvedValue({ id: "prm_1", dismissedAt: new Date() });
    expect(
      await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 22, surface: "dashboard" }),
    ).toBeNull();
  });

  it("brings it back after the window", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    recordPromptCondition.mockResolvedValue({ id: "prm_1", dismissedAt: eightDaysAgo });
    expect(
      await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 22, surface: "dashboard" }),
    ).toBeTruthy();
  });

  it("treats no dismissal, and an unreadable one, as not dismissed", () => {
    expect(dismissalActive(null)).toBe(false);
    expect(dismissalActive("not a date")).toBe(false);
    expect(dismissalActive(new Date())).toBe(true);
  });
});

describe("the banner tells the whole truth", () => {
  it("names the plan that covers this rate, and when the free quota resets", async () => {
    const w = await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 22, surface: "dashboard" });
    expect(w.fit).toBeTruthy();
    expect(w.fit.monthlyLimit).toBeGreaterThan(freePlan.monthlyLimit);
    // Without the reset date the only way out of the banner is to pay, which
    // is untrue: waiting works.
    expect(w.resetDate).toBeTruthy();
    expect(w.planLabel).toBe("Free");
    expect(w.usageCount).toBe(22);
    expect(w.monthlyLimit).toBe(25);
  });

  it("recommends the plan that actually covers them, not the biggest one", async () => {
    // A merchant using ~25/month is covered by Starter. Pointing them at a plan
    // three times the price they do not need is the thing "honest copy" is for.
    const w = await getQuotaWarning({ shop: SHOP, plan: freePlan, usageCount: 22, surface: "dashboard" });
    expect(w.fit.planName).toBe("starter");
  });
});

describe("attribution refuses to invent anything", () => {
  it("accepts only the two values we mint", () => {
    expect(normalizeFrom(FROM_WARN)).toBe(FROM_WARN);
    expect(normalizeFrom(FROM_EXHAUSTED)).toBe(FROM_EXHAUSTED);
    for (const junk of ["", null, undefined, "quota999", "<script>", "dashboard"]) {
      expect(normalizeFrom(junk), String(junk)).toBeNull();
    }
  });

  it("does not store a `from` a merchant could type into their own URL bar", async () => {
    expect(await recordArrivedFrom(SHOP, "prm_1", "totally-made-up")).toBe(false);
    expect(prisma.upgradePrompt.updateMany).not.toHaveBeenCalled();
  });

  it("records the first arrival only — a later visit does not rewrite history", async () => {
    await recordArrivedFrom(SHOP, "prm_1", FROM_WARN);
    expect(prisma.upgradePrompt.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "prm_1",
      shop: SHOP,
      arrivedFrom: null,
    });
  });

  it("stamps the source on the Shop row at activation", async () => {
    prisma.upgradePrompt.findUnique.mockResolvedValue({
      arrivedFrom: FROM_EXHAUSTED,
      trigger: "quota_exhausted",
    });
    expect(await stampUpgradeSource(SHOP, "prm_1")).toBe(FROM_EXHAUSTED);
    expect(prisma.shop.updateMany).toHaveBeenCalledWith({
      where: { shop: SHOP },
      data: { upgradePromptSource: FROM_EXHAUSTED },
    });
  });

  it("falls back to the trigger when the merchant reached Plans another way", async () => {
    prisma.upgradePrompt.findUnique.mockResolvedValue({ arrivedFrom: null, trigger: "quota_80" });
    expect(await stampUpgradeSource(SHOP, "prm_1")).toBe(FROM_WARN);
  });

  it("leaves an organic upgrade unattributed rather than guessing", async () => {
    // No prompt behind it, or a trigger we cannot map: null is the truth.
    expect(await stampUpgradeSource(SHOP, null)).toBeNull();
    prisma.upgradePrompt.findUnique.mockResolvedValue({ arrivedFrom: null, trigger: "bulk_gate" });
    expect(await stampUpgradeSource(SHOP, "prm_1")).toBeNull();
    expect(prisma.shop.updateMany).not.toHaveBeenCalled();
  });

  it("never throws — attribution must not cost a merchant the plan they bought", async () => {
    prisma.upgradePrompt.findUnique.mockRejectedValue(new Error("db down"));
    expect(await stampUpgradeSource(SHOP, "prm_1")).toBeNull();
  });
});

describe("source guard — six surfaces really are gone", () => {
  const code = (f) =>
    readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  it("the old ad-hoc UpgradePrompt is not rendered anywhere", () => {
    // <UpgradePrompt title="Only N generations left" …> and friends were the
    // six. Everything now goes through the two server-computed components.
    let swept = 0;
    for (const dir of ["app/routes", "app/components"]) {
      for (const name of readdirSync(dir)) {
        if (!/\.(js|jsx)$/.test(name)) continue;
        const f = `${dir}/${name}`;
        if (f === "app/components/UpgradePrompt.jsx") continue;
        swept += 1;
        expect(code(f), `${f} still renders the ad-hoc <UpgradePrompt>`).not.toMatch(/<UpgradePrompt\b/);
      }
    }
    expect(swept).toBeGreaterThan(10);
  });

  it("the warning banner is rendered on Home and Products, and nowhere else", () => {
    const carriers = [];
    for (const dir of ["app/routes"]) {
      for (const name of readdirSync(dir)) {
        if (!/\.jsx$/.test(name)) continue;
        if (/<QuotaWarningBanner\b/.test(code(`${dir}/${name}`))) carriers.push(name);
      }
    }
    expect(carriers.sort()).toEqual(["app._index.jsx", "app.products.jsx"]);
  });

  it("quota-reached copy is never critical — reaching a limit is completion", () => {
    for (const f of ["app/components/UpgradePrompt.jsx"]) {
      const src = code(f);
      expect(src).not.toMatch(/tone="critical"/);
    }
  });

  it("no urgency, no countdown, no fake scarcity in either surface", () => {
    const src = code("app/components/UpgradePrompt.jsx");
    expect(src).not.toMatch(/hurry|limited time|offer ends|only \d+ left|act now|don't miss/i);
  });

  it("both surfaces state the reset date beside the CTA", () => {
    const src = code("app/components/UpgradePrompt.jsx");
    expect((src.match(/resetDate/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("the card says what still works at 100%", () => {
    // Being out of quota stops new generation, not the app.
    expect(code("app/components/UpgradePrompt.jsx")).toMatch(
      /still run an audit, and review, edit and publish/,
    );
  });

  it("the Plans page no longer tells a merchant to cancel before switching", () => {
    // Shopify REPLACES an app subscription on approval. Telling them to cancel
    // first would leave them with no plan at all if they stopped there.
    const src = code("app/routes/app.plans.jsx");
    expect(src).not.toMatch(/Cancel current plan to switch/);
    expect(src).toMatch(/replaces your current plan/);
  });

  it("a downgrade is a real button, not a dead end", () => {
    const src = code("app/routes/app.plans.jsx");
    expect(src).toMatch(/Switch to \{displayPlan\.label\}/);
  });
});
