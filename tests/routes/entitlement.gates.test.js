/**
 * P0-8 regression tests — features sold as Starter+ on the pricing table must
 * actually be gated server-side (requirement 4.2.1: advertised == enforced).
 * These shipped working on Free with zero enforcement.
 *
 * P0-5 regression — the embed-status resource route persists the merchant's
 * confirmation that the theme app embed is enabled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));

const upsertGrowthState = vi.fn(() => Promise.resolve({}));
vi.mock("../../app/db.server", () => ({
  default: {
    generatedContent: { findMany: vi.fn(() => Promise.resolve([])), findUnique: vi.fn(() => Promise.resolve(null)), upsert: vi.fn(), updateMany: vi.fn() },
    brandVoice: { findUnique: vi.fn(() => Promise.resolve(null)), upsert: vi.fn() },
    contentVersion: { findMany: vi.fn(() => Promise.resolve([])), findFirst: vi.fn(() => Promise.resolve(null)) },
    contentTemplate: { findMany: vi.fn(() => Promise.resolve([])), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    growthState: { findUnique: vi.fn(() => Promise.resolve(null)), upsert: (...a) => upsertGrowthState(...a) },
  },
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

const checkEntitlement = vi.fn();
vi.mock("../../app/utils/plans.server.js", () => ({
  getOrCreatePlan: vi.fn(() => Promise.resolve({ planName: "free", monthlyLimit: 25 })),
  tryConsumeGeneration: vi.fn(() => Promise.resolve({ allowed: true })),
  checkEntitlement: (...a) => checkEntitlement(...a),
  refundGeneration: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../app/utils/rateLimit.server.js", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true })) }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn((k, fn) => fn()), invalidateCache: vi.fn() }));
vi.mock("../../app/utils/contentVersion.server.js", () => ({ snapshotAndPrune: vi.fn(() => Promise.resolve()) }));
vi.mock("../../app/utils/ai.server.js", () => ({
  generateProductContent: vi.fn(() => Promise.resolve({})),
  generateAltText: vi.fn(() => Promise.resolve("alt")),
  enhanceExistingContent: vi.fn(() => Promise.resolve({})),
  generateSocialContent: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../../app/utils/contentScorer.server.js", () => ({ scoreContent: vi.fn(() => ({ score: 80 })) }));

function postRequest(url, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request(url, { method: "POST", body: fd });
}

async function mockAdmin() {
  const { authenticate } = await import("../../app/shopify.server");
  authenticate.admin.mockResolvedValue({
    admin: { graphql: vi.fn(async () => ({ json: async () => ({ data: {} }), status: 200, headers: { get: () => null } })) },
    session: { shop: "free-shop.myshopify.com" },
    billing: {},
  });
}

describe("P0-8: Starter+ features are enforced server-side", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkEntitlement.mockResolvedValue({ allowed: false, requiredPlan: "Starter" });
  });

  it("product page saveTemplate is blocked on Free", async () => {
    await mockAdmin();
    const { action } = await import("../../app/routes/app.products_.$id.jsx");
    const result = await action({
      request: postRequest("https://app.test/app/products/1", { actionType: "saveTemplate", name: "T" }),
      params: { id: "1" },
    });
    expect(result.limitReached).toBe(true);
    expect(checkEntitlement).toHaveBeenCalledWith("free-shop.myshopify.com", "contentTemplates");
  });

  it("product page restoreVersion is blocked on Free", async () => {
    await mockAdmin();
    const { action } = await import("../../app/routes/app.products_.$id.jsx");
    const result = await action({
      request: postRequest("https://app.test/app/products/1", { actionType: "restoreVersion", versionId: "v1" }),
      params: { id: "1" },
    });
    expect(result.limitReached).toBe(true);
    expect(checkEntitlement).toHaveBeenCalledWith("free-shop.myshopify.com", "versionHistory");
  });

  it("settings saveTemplate is blocked on Free", async () => {
    await mockAdmin();
    const { action } = await import("../../app/routes/app.settings.jsx");
    const res = await action({
      request: postRequest("https://app.test/app/settings", { actionType: "saveTemplate", tplName: "T" }),
    });
    const body = await res.json();
    expect(body.limitReached).toBe(true);
  });

  it("settings saves other fields but forces autopilot OFF on a plan without it", async () => {
    // Better behavior than reject-everything: enabling autopilot on a free
    // plan must NOT lose the merchant's store name / tone. Persist the rest,
    // force autopilot off, return a soft notice.
    await mockAdmin();
    const prisma = (await import("../../app/db.server")).default;
    const { action } = await import("../../app/routes/app.settings.jsx");
    const res = await action({
      request: postRequest("https://app.test/app/settings", { actionType: "saveBrandVoice", autopilotEnabled: "true", storeName: "Keep My Name" }),
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.autopilotBlocked).toBe(true);
    // The save DID happen, with the store name preserved and autopilot forced off.
    expect(prisma.brandVoice.upsert).toHaveBeenCalled();
    const upsertArg = prisma.brandVoice.upsert.mock.calls[0][0];
    expect(upsertArg.update.storeName).toBe("Keep My Name");
    expect(upsertArg.update.autopilotEnabled).toBe(false);
  });
});

describe("P0-5: embed-status route persists confirmation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirm sets embedConfirmedAt on GrowthState", async () => {
    await mockAdmin();
    const { action } = await import("../../app/routes/app.embed-status.jsx");
    const res = await action({ request: postRequest("https://app.test/app/embed-status", { actionType: "confirm" }) });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(upsertGrowthState).toHaveBeenCalled();
    const args = upsertGrowthState.mock.calls[0][0];
    expect(args.update.embedConfirmedAt).toBeInstanceOf(Date);
    expect(args.create.embedConfirmedAt).toBeInstanceOf(Date);
  });
});
