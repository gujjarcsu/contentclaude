/**
 * Phase 4 item 7 — one-click "Restore original".
 *
 * Version history and a per-type restore already existed on the product page.
 * What did not exist was the one a merchant actually reaches for: they looked
 * at their storefront, they do not like what the app wrote, and they want their
 * own words back **now** — from the list, without opening the product and
 * finding the History tab.
 *
 * Two properties matter more than the mechanics:
 *
 *   1. **It is not a paid feature.** Undoing what the app did to a merchant's
 *      storefront cannot sit behind an entitlement, or a shop that downgraded
 *      could not put its own copy back.
 *   2. **Nothing is destroyed.** The AI version returns to being a draft, so
 *      the merchant can change their mind. Undoing a publish is not the same
 *      as throwing the work away.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { prisma, authenticate, publishProductWithRetry, checkEntitlement } = vi.hoisted(() => ({
  prisma: {
    generatedContent: { findUnique: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
  },
  authenticate: { admin: vi.fn() },
  publishProductWithRetry: vi.fn(async () => ({ ok: true, verified: true })),
  checkEntitlement: vi.fn(async () => ({ allowed: false, requiredPlan: "Growth" })),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));
vi.mock("../../app/utils/adminGraphql.server.js", () => ({ publishProductWithRetry }));
vi.mock("../../app/utils/plans.server.js", () => ({
  getOrCreatePlan: vi.fn(async () => ({ planName: "free", monthlyLimit: 25 })),
  getMonthlyUsageCount: vi.fn(async () => 0),
  checkEntitlement,
  remainingGenerations: vi.fn(async () => 25),
  sliceToQuota: (ids) => ({ targetIds: ids, quotaSkipped: 0 }),
}));
vi.mock("../../app/utils/publishSetting.server.js", () => ({
  publishesWithoutReview: vi.fn(async () => false),
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { action } = await import("../../app/routes/app.products.jsx");

const SHOP = "a-store.myshopify.com";
const PID = "gid://shopify/Product/1";

function post(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return action({ request: new Request("https://app.navaal.ai/app/products", { method: "POST", body: fd }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: { graphql: vi.fn() } });
  prisma.generatedContent.findUnique.mockResolvedValue({
    originalContent: "<p>The words the merchant wrote themselves.</p>",
    productTitle: "The Minimal Snowboard",
  });
  publishProductWithRetry.mockResolvedValue({ ok: true, verified: true });
  checkEntitlement.mockResolvedValue({ allowed: false, requiredPlan: "Growth" });
});

describe("restoring the merchant's own words", () => {
  it("publishes the saved original back to Shopify", async () => {
    const r = await post({ actionType: "restoreOriginal", productId: PID });

    expect(r.success).toBe(true);
    expect(publishProductWithRetry).toHaveBeenCalledWith(expect.anything(), PID, {
      id: PID,
      descriptionHtml: "<p>The words the merchant wrote themselves.</p>",
    });
    expect(r.message).toMatch(/original description is live again/i);
  });

  it("is NOT gated behind the paid bulk entitlement", async () => {
    // A shop that downgraded must still be able to undo what the app did to
    // their storefront. checkEntitlement is mocked to REFUSE here, and the
    // restore must still go through.
    const r = await post({ actionType: "restoreOriginal", productId: PID });
    expect(r.success).toBe(true);
    expect(checkEntitlement).not.toHaveBeenCalled();
  });

  it("keeps the AI version as a draft rather than deleting it", async () => {
    await post({ actionType: "restoreOriginal", productId: PID });
    const call = prisma.generatedContent.updateMany.mock.calls[0][0];
    expect(call.data.status).toBe("draft");
    expect(call.where.status.in).toEqual(["published", "published_unverified"]);
  });

  it("clears the verification note — that note described content no longer live", async () => {
    await post({ actionType: "restoreOriginal", productId: PID });
    const call = prisma.generatedContent.updateMany.mock.calls[0][0];
    expect(call.data.verifiedAt).toBeNull();
    expect(call.data.verifyNote).toBeNull();
  });
});

describe("what it refuses to do", () => {
  it("refuses when there is no saved original, rather than publishing nothing", async () => {
    // Publishing an empty description would wipe the product's copy entirely —
    // the opposite of a restore.
    prisma.generatedContent.findUnique.mockResolvedValue({ originalContent: "   " });
    const r = await post({ actionType: "restoreOriginal", productId: PID });
    expect(r.error).toMatch(/nothing to put back/i);
    expect(publishProductWithRetry).not.toHaveBeenCalled();
  });

  it("refuses when no row exists at all", async () => {
    prisma.generatedContent.findUnique.mockResolvedValue(null);
    const r = await post({ actionType: "restoreOriginal", productId: PID });
    expect(r.error).toBeTruthy();
    expect(publishProductWithRetry).not.toHaveBeenCalled();
  });

  it.each(["", "1", "gid://shopify/Collection/1", "../../x"])("refuses a bad product id: %s", async (bad) => {
    const r = await post({ actionType: "restoreOriginal", productId: bad });
    expect(r.error).toBe("Invalid product.");
    expect(prisma.generatedContent.findUnique).not.toHaveBeenCalled();
  });

  it("does NOT downgrade the rows when the publish failed", async () => {
    // The AI content is still live. Marking it a draft would leave the app
    // describing a storefront that does not exist.
    publishProductWithRetry.mockResolvedValue({ ok: false, error: "Shopify said no" });
    const r = await post({ actionType: "restoreOriginal", productId: PID });
    expect(r.error).toMatch(/Could not restore/);
    expect(prisma.generatedContent.updateMany).not.toHaveBeenCalled();
  });

  it("says so plainly when Shopify is throttling", async () => {
    publishProductWithRetry.mockResolvedValue({ ok: false, throttled: true, error: "throttled" });
    const r = await post({ actionType: "restoreOriginal", productId: PID });
    expect(r.error).toMatch(/rate-limiting/i);
  });
});

describe("the confirm, and where the button appears", () => {
  const src = readFileSync("app/routes/app.products.jsx", "utf8");

  it("asks before replacing what is on a live storefront", () => {
    expect(src).toMatch(/Put your original description back\?/);
  });

  it("the confirm says what happens to BOTH versions", () => {
    // A confirm that only says what it will destroy makes people cancel; one
    // that only says what it will do makes them careless.
    expect(src).toMatch(/goes back on your storefront, replacing the AI version/);
    expect(src).toMatch(/kept as a draft/);
    expect(src).toMatch(/Nothing\s+is deleted|Nothing is\s+deleted/);
  });

  it("offers the button only when the AI version is actually live", () => {
    // Offering to undo something that never happened is noise on every row.
    expect(src).toMatch(/function canRestore\(/);
    expect(src).toMatch(/desc\.status === "published" \|\| desc\.status === "published_unverified"/);
  });

  it("offers it only when an original was actually saved", () => {
    expect(src).toMatch(/desc\?\.hasOriginal/);
  });

  it("sends only the presence of an original to the browser, not the text", () => {
    // Fifty product descriptions crossing the wire to render a button.
    expect(src).toMatch(/hasOriginal: !!String\(originalContent \?\? ""\)\.trim\(\)/);
  });
});
