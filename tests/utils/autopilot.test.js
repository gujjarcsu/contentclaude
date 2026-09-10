/**
 * Phase 4 item 5 — the bounds on autopilot.
 *
 * This is the only path where a merchant's generation is spent without them
 * clicking anything. `products/create` fires once per product, and a catalogue
 * import fires it thousands of times in a burst — so every bound here is a
 * place where a mistake costs the merchant money rather than showing them an
 * error.
 *
 * The daily cap is the one that was missing. Everything else bounded a single
 * product or a single moment; nothing bounded an afternoon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    generationJob: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { autopilotDailyUsage, recentAutopilotWork, startOfUtcDay, AUTOPILOT_DAILY_CAP, AUTOPILOT_SOURCE } =
  await import("../../app/utils/autopilot.server.js");

const SHOP = "a-store.myshopify.com";
const NOW = new Date("2026-09-10T15:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.generationJob.aggregate.mockResolvedValue({ _sum: { totalProducts: 0 } });
  prisma.generationJob.findMany.mockResolvedValue([]);
});

describe("the daily cap", () => {
  it("allows work below the ceiling", async () => {
    prisma.generationJob.aggregate.mockResolvedValue({ _sum: { totalProducts: 10 } });
    const u = await autopilotDailyUsage(SHOP, { now: NOW });
    expect(u.allowed).toBe(true);
    expect(u.used).toBe(10);
    expect(u.remaining).toBe(AUTOPILOT_DAILY_CAP - 10);
  });

  it("refuses at the ceiling", async () => {
    prisma.generationJob.aggregate.mockResolvedValue({ _sum: { totalProducts: AUTOPILOT_DAILY_CAP } });
    expect((await autopilotDailyUsage(SHOP, { now: NOW })).allowed).toBe(false);
  });

  it("refuses beyond it, and never reports a negative remainder", async () => {
    prisma.generationJob.aggregate.mockResolvedValue({ _sum: { totalProducts: 9999 } });
    const u = await autopilotDailyUsage(SHOP, { now: NOW });
    expect(u.allowed).toBe(false);
    expect(u.remaining).toBe(0);
  });

  it("counts PRODUCTS, not jobs", async () => {
    // An autopilot job is one product today. Counting jobs would make the cap
    // meaningless the moment that stops being true.
    await autopilotDailyUsage(SHOP, { now: NOW });
    expect(prisma.generationJob.aggregate.mock.calls[0][0]._sum).toEqual({ totalProducts: true });
  });

  it("counts only THIS shop's autopilot jobs, from the start of the UTC day", async () => {
    await autopilotDailyUsage(SHOP, { now: NOW });
    const where = prisma.generationJob.aggregate.mock.calls[0][0].where;
    expect(where.shop).toBe(SHOP);
    expect(where.source).toBe(AUTOPILOT_SOURCE);
    expect(where.createdAt.gte).toEqual(new Date("2026-09-10T00:00:00Z"));
  });

  it("does NOT count a job whose source is unknown", async () => {
    // A job written before the column existed has an unknown source. Counting
    // it would refuse work the merchant asked for, on evidence we do not have.
    const where =
      (await autopilotDailyUsage(SHOP, { now: NOW }), prisma.generationJob.aggregate.mock.calls[0][0].where);
    expect(where.source).toBe(AUTOPILOT_SOURCE);
    expect(where.source).not.toBeNull();
  });

  it("ALLOWS when the counter itself fails — a broken count must not stop automation", async () => {
    // Every other bound still applies. Failing closed here would silently
    // switch a paying merchant's automation off with no error anywhere.
    prisma.generationJob.aggregate.mockRejectedValue(new Error("db down"));
    const u = await autopilotDailyUsage(SHOP, { now: NOW });
    expect(u.allowed).toBe(true);
    expect(u.counted).toBe(false);
  });

  it("treats a null sum as zero rather than NaN", async () => {
    prisma.generationJob.aggregate.mockResolvedValue({ _sum: { totalProducts: null } });
    const u = await autopilotDailyUsage(SHOP, { now: NOW });
    expect(u.used).toBe(0);
    expect(u.allowed).toBe(true);
  });

  it("the cap is a quarter of the Growth monthly allowance, not a round guess", () => {
    expect(AUTOPILOT_DAILY_CAP).toBe(50);
  });

  it("startOfUtcDay is UTC, not local", () => {
    expect(startOfUtcDay(new Date("2026-09-10T23:59:59Z")).toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });
});

describe("what autopilot did, for the Home banner", () => {
  it("sums the products across completed jobs", async () => {
    prisma.generationJob.findMany.mockResolvedValue([
      { completedProducts: 3, completedAt: new Date("2026-09-10T14:00:00Z") },
      { completedProducts: 2, completedAt: new Date("2026-09-10T09:00:00Z") },
    ]);
    const r = await recentAutopilotWork(SHOP, { now: NOW });
    expect(r).toMatchObject({ products: 5, jobs: 2 });
  });

  it("says nothing when autopilot did nothing", async () => {
    prisma.generationJob.findMany.mockResolvedValue([]);
    expect(await recentAutopilotWork(SHOP, { now: NOW })).toBeNull();
  });

  it("says nothing when jobs completed but produced no products", async () => {
    // "Autopilot optimized 0 new products" is worse than silence.
    prisma.generationJob.findMany.mockResolvedValue([{ completedProducts: 0, completedAt: NOW }]);
    expect(await recentAutopilotWork(SHOP, { now: NOW })).toBeNull();
  });

  it("reports only COMPLETED autopilot jobs from the last 24 hours", async () => {
    await recentAutopilotWork(SHOP, { now: NOW });
    const where = prisma.generationJob.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ shop: SHOP, source: AUTOPILOT_SOURCE, status: "complete" });
    expect(where.completedAt.gte).toEqual(new Date(NOW.getTime() - 24 * 3600 * 1000));
  });

  it("never throws — a recap is not worth a broken dashboard", async () => {
    prisma.generationJob.findMany.mockRejectedValue(new Error("db down"));
    expect(await recentAutopilotWork(SHOP, { now: NOW })).toBeNull();
  });
});

describe("source guards — the webhook actually applies the bounds", () => {
  it("checks the daily cap and answers 200, never a retryable status", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/routes/webhooks.products.create.jsx", "utf8");
    expect(src).toMatch(/autopilotDailyUsage\(/);
    // A non-2xx makes Shopify retry, and a retried refusal is a retry storm.
    expect(src).toMatch(/Autopilot daily cap reached", \{ status: 200 \}/);
  });

  it("tags its jobs so the cap can count them", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/routes/webhooks.products.create.jsx", "utf8");
    expect(src).toMatch(/source: AUTOPILOT_SOURCE/);
  });

  it("publishes only when the merchant's Settings switch says so", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/routes/webhooks.products.create.jsx", "utf8");
    expect(src).toMatch(/autoPublish: brandVoice\.autopilotAutoPublish/);
  });
});
