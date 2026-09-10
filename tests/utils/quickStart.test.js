/**
 * Phase 3 item 3.2 — quick start, and the merchant's money.
 *
 * The Start state auto-fires three generations the moment a new merchant opens
 * the app. Nobody presses a button, so every safeguard here has to be
 * structural: a merchant who refreshes twice, or whose tab reloads, or whose
 * first request timed out, must not be charged again for the same product.
 *
 * `reserveCredit` is where that lives. It has four non-charging outcomes and
 * one charging one, and the difference between them is the difference between
 * "you used 3 of your 25 free generations" and "you used 9".
 *
 *   reuse_draft  a usable draft < 24 h old exists → returned, no charge
 *   in_flight    a credit was taken < 300 s ago with no draft yet → the first
 *                request may still be running → never charge again
 *   orphan       a credit was taken 300 s–24 h ago with no draft → that request
 *                died → reuse the credit already paid for
 *   denied       out of quota
 *   new          the quota gate wrote a fresh UsageRecord — the only charge
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { prisma, tryConsumeGeneration, refundGeneration } = vi.hoisted(() => ({
  prisma: {
    generatedContent: { findUnique: vi.fn(), findMany: vi.fn(async () => []), upsert: vi.fn() },
    usageRecord: { findFirst: vi.fn(async () => null), count: vi.fn(async () => 0) },
    brandVoice: { findUnique: vi.fn(async () => null) },
    plan: { findUnique: vi.fn(async () => ({ planName: "free", monthlyLimit: 25 })) },
  },
  tryConsumeGeneration: vi.fn(async () => ({ allowed: true, remaining: 24 })),
  refundGeneration: vi.fn(async () => true),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/plans.server.js", () => ({
  tryConsumeGeneration,
  refundGeneration,
  getOrCreatePlan: vi.fn(async () => ({ planName: "free", monthlyLimit: 25 })),
  getMonthlyUsageCount: vi.fn(async () => 1),
}));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (_k, fn) => fn()) }));
vi.mock("../../app/utils/rateLimit.server.js", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("../../app/utils/ai.server.js", () => ({
  generateProductContent: vi.fn(),
  enhanceExistingContent: vi.fn(),
}));
vi.mock("../../app/utils/contentScorer.server.js", () => ({ scoreContent: vi.fn(() => ({ score: 80 })) }));
vi.mock("../../app/utils/contentVersion.server.js", () => ({ snapshotAndPrune: vi.fn(async () => {}) }));
vi.mock("../../app/utils/firstValue.server.js", () => ({
  markFirstDraftSeen: vi.fn(async () => true),
  stampQuickStartStarted: vi.fn(async () => true),
  incrementQuickStartDrafts: vi.fn(async () => 1),
}));
vi.mock("../../app/utils/catalogGaps.server.js", () => ({ invalidateCatalogGaps: vi.fn(async () => {}) }));

const { reserveCredit, runQuickStartOne, IN_FLIGHT_MS, REUSE_MS, PRODUCT_GID_RE, QUICK_START_MESSAGES } =
  await import("../../app/utils/quickStart.server.js");
const { generateProductContent } = await import("../../app/utils/ai.server.js");
const { markFirstDraftSeen } = await import("../../app/utils/firstValue.server.js");

const SHOP = "a-store.myshopify.com";
const PID = "gid://shopify/Product/1";
const NOW = new Date("2026-09-10T12:00:00.000Z");
const ago = (ms) => new Date(NOW.getTime() - ms);

const productNode = {
  id: PID,
  title: "A product",
  productType: "Thing",
  vendor: "V",
  description: "old",
  descriptionHtml: "<p>old</p>",
  tags: [],
  seo: { title: "", description: "" },
  featuredMedia: { preview: { image: { url: "https://img/1.jpg" } } },
  media: { edges: [] },
  variants: { edges: [] },
};
const adminOk = () => ({
  graphql: vi.fn(async () => ({ json: async () => ({ data: { product: productNode } }) })),
});

beforeEach(() => {
  // clearAllMocks clears CALLS, not implementations — a mockRejectedValue set
  // by one test survives into the next one and fails it for the wrong reason.
  vi.clearAllMocks();
  prisma.generatedContent.upsert.mockResolvedValue({});
  generateProductContent.mockReset();
  prisma.generatedContent.findUnique.mockResolvedValue(null);
  prisma.generatedContent.findMany.mockResolvedValue([]);
  prisma.usageRecord.findFirst.mockResolvedValue(null);
  tryConsumeGeneration.mockResolvedValue({ allowed: true, remaining: 24 });
  refundGeneration.mockResolvedValue(true);
});

describe("a refresh never charges twice", () => {
  it("returns a recent draft without touching the quota", async () => {
    prisma.generatedContent.findUnique.mockResolvedValue({
      generatedContent: "A good draft",
      status: "draft",
      updatedAt: ago(60_000),
    });

    const r = await reserveCredit(SHOP, PID, NOW);

    expect(r.kind).toBe("reuse_draft");
    expect(tryConsumeGeneration).not.toHaveBeenCalled();
  });

  it("waits rather than charging while a request may still be running", async () => {
    // A credit taken 30 s ago with no draft: the first request has not finished.
    prisma.usageRecord.findFirst.mockResolvedValue({ id: "u1", createdAt: ago(30_000) });

    const r = await reserveCredit(SHOP, PID, NOW);

    expect(r.kind).toBe("in_flight");
    expect(tryConsumeGeneration).not.toHaveBeenCalled();
  });

  it("reuses a credit whose request died instead of charging again", async () => {
    // Past the in-flight window, inside the reuse window, still no draft.
    prisma.usageRecord.findFirst.mockResolvedValue({ id: "u1", createdAt: ago(IN_FLIGHT_MS + 60_000) });

    const r = await reserveCredit(SHOP, PID, NOW);

    expect(r.kind).toBe("orphan");
    expect(r.usageRecordId).toBe("u1");
    expect(tryConsumeGeneration).not.toHaveBeenCalled();
  });

  it("does charge when the previous credit DID produce a draft", async () => {
    // A completed earlier run must not make the next one free forever.
    prisma.generatedContent.findUnique.mockResolvedValue({
      generatedContent: "old draft",
      status: "draft",
      updatedAt: ago(REUSE_MS + 60_000), // too old to reuse
    });
    prisma.usageRecord.findFirst.mockResolvedValue({ id: "u1", createdAt: ago(REUSE_MS + 120_000) });

    const r = await reserveCredit(SHOP, PID, NOW);

    expect(r.kind).toBe("new");
    expect(tryConsumeGeneration).toHaveBeenCalledWith(SHOP, "description", PID);
  });

  it("does not reuse a draft that is empty, whatever its status says", async () => {
    prisma.generatedContent.findUnique.mockResolvedValue({
      generatedContent: "   ",
      status: "published",
      updatedAt: ago(60_000),
    });
    expect((await reserveCredit(SHOP, PID, NOW)).kind).toBe("new");
  });

  it("does not reuse a rejected draft — the merchant said no to that one", async () => {
    prisma.generatedContent.findUnique.mockResolvedValue({
      generatedContent: "rejected copy",
      status: "rejected",
      updatedAt: ago(60_000),
    });
    expect((await reserveCredit(SHOP, PID, NOW)).kind).toBe("new");
  });

  it("reports contention rather than charging when the quota gate is contended", async () => {
    tryConsumeGeneration.mockResolvedValue({ isContention: true });
    expect((await reserveCredit(SHOP, PID, NOW)).kind).toBe("contention");
  });

  it("reports denied when the quota is exhausted", async () => {
    tryConsumeGeneration.mockResolvedValue({ allowed: false, remaining: 0 });
    expect((await reserveCredit(SHOP, PID, NOW)).kind).toBe("denied");
  });
});

describe("a merchant is never charged for a draft they did not get", () => {
  it("refunds when the model throws", async () => {
    generateProductContent.mockRejectedValue(new Error("upstream exploded"));

    const r = await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });

    expect(r.ok).toBe(false);
    expect(refundGeneration).toHaveBeenCalledWith(SHOP, { productId: PID, contentType: "description" });
    expect(r.refunded).toBe(true);
  });

  it("refunds when the model returns an empty draft", async () => {
    generateProductContent.mockResolvedValue({ description: "   " });

    const r = await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });

    expect(r.ok).toBe(false);
    expect(r.error).toBe(QUICK_START_MESSAGES.empty);
    expect(refundGeneration).toHaveBeenCalled();
  });

  it("refunds when the product has vanished from the store", async () => {
    const admin = { graphql: vi.fn(async () => ({ json: async () => ({ data: { product: null } }) })) };

    const r = await runQuickStartOne({ admin, shop: SHOP, productId: PID });

    expect(r.notFound).toBe(true);
    expect(refundGeneration).toHaveBeenCalled();
  });

  it("refunds when the draft cannot be saved", async () => {
    generateProductContent.mockResolvedValue({ description: "Good copy." });
    prisma.generatedContent.upsert.mockRejectedValue(new Error("write failed"));

    const r = await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });

    expect(r.ok).toBe(false);
    expect(r.error).toBe(QUICK_START_MESSAGES.save);
    expect(refundGeneration).toHaveBeenCalled();
  });

  it("does NOT refund when nothing was charged in the first place", async () => {
    prisma.generatedContent.findUnique.mockResolvedValue({
      generatedContent: "Existing draft",
      status: "draft",
      updatedAt: new Date(),
    });

    const r = await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });

    expect(r.ok).toBe(true);
    expect(r.reused).toBe(true);
    expect(refundGeneration).not.toHaveBeenCalled();
  });

  it("every failure message says a generation was not used, and none leaks an internal error", async () => {
    // A merchant reading "upstream exploded" learns nothing and worries about
    // their credit. Every one of these states that the credit is intact.
    for (const [key, msg] of Object.entries(QUICK_START_MESSAGES)) {
      if (typeof msg !== "string" || key === "invalid" || key === "notFound") continue;
      expect(msg, key).toMatch(/no generation was used/i);
    }
    generateProductContent.mockRejectedValue(new Error("ECONNRESET at 10.0.0.4:443"));
    const r = await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });
    expect(r.error).not.toMatch(/ECONNRESET|10\.0\.0\.4/);
  });
});

describe("a real draft stamps first value", () => {
  it("marks firstDraftSeenAt with the quick-start source", async () => {
    generateProductContent.mockResolvedValue({
      description: "Good copy.",
      metaTitle: "T",
      metaDescription: "D",
    });

    const r = await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });

    expect(r.ok).toBe(true);
    expect(markFirstDraftSeen).toHaveBeenCalledWith(SHOP, "quick_start");
  });

  it("does not stamp it when the generation failed", async () => {
    generateProductContent.mockRejectedValue(new Error("nope"));
    await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });
    expect(markFirstDraftSeen).not.toHaveBeenCalled();
  });

  it("writes drafts, never published content", async () => {
    generateProductContent.mockResolvedValue({ description: "Good copy.", metaTitle: "T" });
    await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: PID });

    for (const call of prisma.generatedContent.upsert.mock.calls) {
      expect(call[0].create.status).toBe("draft");
      expect(call[0].update.status).toBe("draft");
    }
  });
});

describe("the product id is validated before anything else happens", () => {
  it.each(["", "1", "gid://shopify/Collection/1", "gid://shopify/Product/abc", "../../etc"])(
    "refuses %s",
    async (bad) => {
      const r = await runQuickStartOne({ admin: adminOk(), shop: SHOP, productId: bad });
      expect(r.ok).toBe(false);
      expect(tryConsumeGeneration).not.toHaveBeenCalled();
    },
  );

  it("accepts a real product gid", () => {
    expect(PRODUCT_GID_RE.test(PID)).toBe(true);
  });
});

describe("the route around it never throws at the merchant", () => {
  const src = readFileSync("app/routes/app.quick-start.jsx", "utf8");

  it("answers JSON rather than throwing a Response mid-run", () => {
    // A thrown Response lands the merchant on the ErrorBoundary while two other
    // generations are still going.
    expect(src).toMatch(/Response\.json\(/);
    expect(src).toMatch(/catch/);
  });

  it("authenticates like every other non-webhook route (G3)", () => {
    expect(src).toMatch(/authenticate\.admin\(request\)/);
  });

  it("a GET goes back into the app rather than rendering anything", () => {
    expect(src).toMatch(/export const loader/);
    expect(src).toMatch(/redirect\(`\/app\?/);
  });
});
