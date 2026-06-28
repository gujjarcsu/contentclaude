// Targeted tests for the hardening patch batch.
//
//  - [Ledger #1]  blogPost-IDOR        — publish update is shop-scoped
//  - [Ledger #3]  plan-cache-invalidation — subscription webhook busts caches
//  - [Ledger #5]  bullmq-extend-lock   — per-product heartbeat contract
//
// blogPost-IDOR and plan-cache-invalidation replicate the exact route/webhook
// branch logic (the real modules pull in the Shopify SDK / authenticate.webhook,
// which can't be imported in a unit test) — the same approach billing.test.js
// uses for the billing action.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── [Ledger #1] BlogPost publish IDOR ──────────────────────────────────────────
// Mirrors app/routes/app.blog.jsx publish branch.
function makeBlogPublish(prismaMock) {
  return async function publish({ savedPostId, shop, shopifyArticleId, title, content }) {
    if (savedPostId) {
      const updated = await prismaMock.blogPost.updateMany({
        where: { id: savedPostId, shop },
        data: { status: "published", shopifyArticleId, title, content },
      });
      if (updated.count === 0) {
        return { status: 404, body: { error: "Post not found." } };
      }
    }
    return { status: 200, body: { success: true } };
  };
}

describe("blogPost-IDOR — publish is shop-scoped", () => {
  it("scopes the update by shop AND returns 404 when no row matches (cross-tenant id)", async () => {
    const prismaMock = { blogPost: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    const publish = makeBlogPublish(prismaMock);
    const res = await publish({ savedPostId: "post_owned_by_other", shop: "attacker.myshopify.com", shopifyArticleId: "gid://1", title: "x", content: "y" });
    expect(res.status).toBe(404);
    expect(prismaMock.blogPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "post_owned_by_other", shop: "attacker.myshopify.com" } })
    );
  });

  it("succeeds when the row belongs to the caller's shop", async () => {
    const prismaMock = { blogPost: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const res = await makeBlogPublish(prismaMock)({ savedPostId: "p1", shop: "owner.myshopify.com", shopifyArticleId: "gid://1", title: "t", content: "c" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── [Ledger #3] Subscription webhook cache invalidation ────────────────────────
// Mirrors app/routes/webhooks.app.subscriptions_update.jsx decision + invalidation.
function makeSubHandler({ invalidateCache, getPlanByKey }) {
  return async function handle({ status, name, shop }) {
    const planDef = getPlanByKey(name);
    let planChanged = false;
    if (status === "ACTIVE" && planDef) planChanged = true;
    else if (["CANCELLED", "DECLINED", "EXPIRED"].includes(status)) planChanged = true;
    else if (status === "FROZEN") planChanged = true;

    if (planChanged) {
      const month = new Date().toISOString().slice(0, 7);
      await invalidateCache(`plan:${shop}`);
      await invalidateCache(`canGenerate:${shop}:${month}`);
    }
    return planChanged;
  };
}

describe("plan-cache-invalidation — subscription webhook", () => {
  let invalidateCache, getPlanByKey, handle;
  beforeEach(() => {
    invalidateCache = vi.fn().mockResolvedValue(undefined);
    getPlanByKey = vi.fn((name) => (name === "Growth Plan" ? { planName: "growth" } : null));
    handle = makeSubHandler({ invalidateCache, getPlanByKey });
  });

  it("busts both plan and quota caches on an ACTIVE known plan", async () => {
    const changed = await handle({ status: "ACTIVE", name: "Growth Plan", shop: "s.myshopify.com" });
    expect(changed).toBe(true);
    expect(invalidateCache).toHaveBeenCalledWith("plan:s.myshopify.com");
    expect(invalidateCache).toHaveBeenCalledWith(expect.stringMatching(/^canGenerate:s\.myshopify\.com:\d{4}-\d{2}$/));
  });

  it("busts caches on CANCELLED (downgrade reflects immediately)", async () => {
    await handle({ status: "CANCELLED", name: "Growth Plan", shop: "s.myshopify.com" });
    expect(invalidateCache).toHaveBeenCalledWith("plan:s.myshopify.com");
  });

  it("does NOT invalidate for an unhandled status", async () => {
    const changed = await handle({ status: "PENDING", name: "Growth Plan", shop: "s.myshopify.com" });
    expect(changed).toBe(false);
    expect(invalidateCache).not.toHaveBeenCalled();
  });
});

// ─── [Ledger #5] BullMQ extend-lock heartbeat ───────────────────────────────────
// Mirrors the per-product heartbeat in app/utils/bulkProcessor.server.js: it must
// extend the lock with the REAL worker token (not a placeholder) for 5 minutes,
// and must be a no-op on the inline path (token null / no extendLock).
async function heartbeat(bullJob, token) {
  if (typeof bullJob?.extendLock === "function" && token) {
    await bullJob.extendLock(token, 5 * 60 * 1000).catch(() => {});
  }
}

describe("bullmq-extend-lock — per-product heartbeat", () => {
  it("extends the lock with the worker token for 5 minutes", async () => {
    const extendLock = vi.fn().mockResolvedValue(undefined);
    await heartbeat({ extendLock }, "real-token-abc");
    expect(extendLock).toHaveBeenCalledWith("real-token-abc", 300000);
  });

  it("is a no-op on the inline path (no token)", async () => {
    const extendLock = vi.fn();
    await heartbeat({ extendLock }, null);
    expect(extendLock).not.toHaveBeenCalled();
  });

  it("never throws if extendLock rejects (lock already lost)", async () => {
    const extendLock = vi.fn().mockRejectedValue(new Error("lock lost"));
    await expect(heartbeat({ extendLock }, "tok")).resolves.toBeUndefined();
  });
});
