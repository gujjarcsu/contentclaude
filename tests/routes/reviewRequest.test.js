/**
 * Phase 1 item 10 — `/app/review-request`, the App Store review ask.
 *
 * Shopify's review prompt is a finite resource: a merchant who is asked twice
 * learns to dismiss it, and an app that asks repeatedly is the definition of a
 * dark pattern. The rule is one ask, ever, per shop, and the enforcement is a
 * single `reviewRequestedAt` stamp read before anything is written.
 *
 * The failure mode is quiet in exactly the wrong way: nothing errors, no log
 * turns red, the merchant is simply nagged. So the assertion that matters is
 * that a second call performs **no write at all**.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, authenticate, logger } = vi.hoisted(() => ({
  prisma: {
    growthState: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
  },
  authenticate: { admin: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: logger }));

const { action } = await import("../../app/routes/app.review-request.jsx");

const SHOP = "asking-store.myshopify.com";

const ask = (fields = {}) =>
  action({
    request: new Request("https://app.test/app/review-request", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP } });
  prisma.growthState.findUnique.mockResolvedValue(null);
});

describe("a shop is asked to review the app exactly once", () => {
  it("records the ask the first time", async () => {
    const body = await (await ask({ code: "first_publish" })).json();

    expect(body).toEqual({ ok: true });
    expect(prisma.growthState.upsert).toHaveBeenCalledTimes(1);
    const args = prisma.growthState.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ shop: SHOP });
    expect(args.create.reviewRequestedAt).toBeInstanceOf(Date);
    expect(args.update.reviewRequestedAt).toBeInstanceOf(Date);
  });

  it("writes NOTHING on a second ask, and says it already happened", async () => {
    prisma.growthState.findUnique.mockResolvedValue({ reviewRequestedAt: new Date("2026-01-01") });

    const body = await (await ask({ code: "first_publish" })).json();

    expect(body).toEqual({ ok: true, already: true });
    // Not "upsert with the same value" — no write at all. An upsert here would
    // move the timestamp forward and reset the one-ask rule every time.
    expect(prisma.growthState.upsert).not.toHaveBeenCalled();
  });

  it("checks the stamp for THIS shop before deciding", async () => {
    await ask({ code: "x" });
    expect(prisma.growthState.findUnique.mock.calls[0][0].where).toEqual({ shop: SHOP });
  });
});

describe("the outcome code that comes back with the ask", () => {
  it("is recorded so the ask can be attributed to what triggered it", async () => {
    await ask({ code: "bulk_complete" });
    const [meta] = logger.info.mock.calls[0];
    expect(meta.reviewOutcome).toBe("bulk_complete");
    expect(meta.shop).toBe(SHOP);
  });

  it("is bounded — a caller cannot write an unbounded string into the logs", async () => {
    await ask({ code: "z".repeat(500) });
    const [meta] = logger.info.mock.calls[0];
    expect(meta.reviewOutcome.length).toBeLessThanOrEqual(60);
  });

  it("has a stated default rather than undefined when the caller sends none", async () => {
    await ask({});
    expect(logger.info.mock.calls[0][0].reviewOutcome).toBe("unknown");
  });
});
