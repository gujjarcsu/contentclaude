/**
 * Phase 4 item 4.3 — before/after score.
 *
 * This is the merchant's proof that the app worked, and it is the single most
 * persuasive number the app can show — which is exactly why it is the most
 * dangerous one to get wrong. Two failure modes matter more than the rest:
 *
 *   1. **A "before" that moves.** If the baseline is rewritten on every scan,
 *      the delta is always zero and the feature is silently dead. If it is
 *      rewritten sometimes, the number is a lie that nobody can catch.
 *   2. **Inventing a baseline.** Defaulting an unknown "before" to 0 produces
 *      "0 → 84", the most flattering possible claim, from no data at all. A
 *      merchant who checked that against their own catalogue would never
 *      believe another number in the app.
 *
 * Both are tested below in the negative direction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, scanStoreForStart } = vi.hoisted(() => ({
  prisma: {
    shop: { updateMany: vi.fn(async () => ({ count: 0 })), findUnique: vi.fn() },
    productScore: { upsert: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
  },
  scanStoreForStart: vi.fn(),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/startState.server.js", () => ({ scanStoreForStart }));

const { getStoreScore, recordProductScores, productScoresFor, STORE_SCORE_TTL_S } =
  await import("../../app/utils/storeScore.server.js");

const SHOP = "a-store.myshopify.com";
const NOW = new Date("2026-09-10T12:00:00Z");
const scored = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: `gid://shopify/Product/${i + 1}`,
    title: `P${i + 1}`,
    scores: { combined: 60 + i, geo: 50 + i, seo: 70 + i },
  }));

const goodScan = (over = {}) => ({
  empty: false,
  storeScore: 84,
  totalScanned: 30,
  scored: scored(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  scanStoreForStart.mockResolvedValue(goodScan());
  prisma.shop.updateMany.mockResolvedValue({ count: 0 });
  prisma.shop.findUnique.mockResolvedValue({ storeScoreAtInstall: 61, storeScoreAtInstallAt: NOW });
  prisma.productScore.upsert.mockResolvedValue({});
  prisma.productScore.findMany.mockResolvedValue([]);
});

describe("the store score", () => {
  it("reports current, baseline and the delta between them", async () => {
    const r = await getStoreScore({}, SHOP, { now: NOW });
    expect(r).toMatchObject({ available: true, current: 84, atInstall: 61, delta: 23, scanned: 30 });
  });

  it("stamps the baseline ONLY when there is not one — a before cannot move", async () => {
    // The immutability lives in the WHERE clause. If `storeScoreAtInstall: null`
    // ever leaves it, every scan overwrites the baseline, the delta is
    // permanently zero, and nothing fails.
    await getStoreScore({}, SHOP, { now: NOW });
    expect(prisma.shop.updateMany).toHaveBeenCalledWith({
      where: { shop: SHOP, storeScoreAtInstall: null },
      data: { storeScoreAtInstall: 84, storeScoreAtInstallAt: NOW },
    });
  });

  it("uses the STORED baseline, not the one it just tried to write", async () => {
    // A shop already at 61 must compare 84 against 61 even though this call
    // attempted to stamp 84.
    prisma.shop.updateMany.mockResolvedValue({ count: 0 });
    prisma.shop.findUnique.mockResolvedValue({ storeScoreAtInstall: 61, storeScoreAtInstallAt: NOW });
    const r = await getStoreScore({}, SHOP, { now: NOW });
    expect(r.atInstall).toBe(61);
    expect(r.delta).toBe(23);
    expect(r.baselineIsNew).toBe(false); // a real comparison, not a fresh stamp
  });

  it("shows no comparison on the very first scan, rather than 84 to 84", async () => {
    prisma.shop.updateMany.mockResolvedValue({ count: 1 }); // we just stamped it
    prisma.shop.findUnique.mockResolvedValue({ storeScoreAtInstall: 84, storeScoreAtInstallAt: NOW });
    const r = await getStoreScore({}, SHOP, { now: NOW });
    expect(r.delta).toBe(0);
    expect(r.since).toBeNull(); // "just now" is not history
    // Caught by READING the screen: without this flag Home said "Unchanged
    // since you installed" five seconds after first stamping the baseline.
    expect(r.baselineIsNew).toBe(true);
  });

  it("reports a DROP honestly rather than hiding it", async () => {
    prisma.shop.findUnique.mockResolvedValue({ storeScoreAtInstall: 90, storeScoreAtInstallAt: NOW });
    const r = await getStoreScore({}, SHOP, { now: NOW });
    expect(r.delta).toBe(-6);
  });
});

describe("what it refuses to report", () => {
  it("is unavailable when the scan failed", async () => {
    scanStoreForStart.mockResolvedValue({ error: true });
    expect(await getStoreScore({}, SHOP, { now: NOW })).toEqual({ available: false });
  });

  it("is unavailable for a store with no products", async () => {
    scanStoreForStart.mockResolvedValue({ empty: true });
    expect(await getStoreScore({}, SHOP, { now: NOW })).toEqual({ available: false });
  });

  it("is unavailable when the scan returned no usable number", async () => {
    for (const bad of [undefined, null, NaN, "84"]) {
      scanStoreForStart.mockResolvedValue(goodScan({ storeScore: bad }));
      expect(await getStoreScore({}, SHOP, { now: NOW }), String(bad)).toEqual({ available: false });
    }
  });

  it("never invents a baseline of zero", async () => {
    // "0 -> 84" from no data is the most flattering possible claim and the
    // most damaging one to be caught making.
    prisma.shop.findUnique.mockResolvedValue({ storeScoreAtInstall: null });
    const r = await getStoreScore({}, SHOP, { now: NOW });
    expect(r.available).toBe(true);
    expect(r.current).toBe(84);
    expect(r.atInstall).toBeNull();
    expect(r.delta).toBeNull();
  });

  it("never throws — a scoreboard is not worth a broken dashboard", async () => {
    scanStoreForStart.mockRejectedValue(new Error("shopify down"));
    expect(await getStoreScore({}, SHOP, { now: NOW })).toEqual({ available: false });
  });

  it("reads the scan through a 10-minute cache, so reloading Home does not re-scan", async () => {
    await getStoreScore({}, SHOP, { now: NOW });
    expect(scanStoreForStart).toHaveBeenCalledWith({}, SHOP, { ttlSeconds: STORE_SCORE_TTL_S });
    expect(STORE_SCORE_TTL_S).toBe(600);
  });
});

describe("per-product before/after", () => {
  it("writes the before ONLY on create, and the after every time", async () => {
    await recordProductScores(SHOP, scored(1), NOW);
    const call = prisma.productScore.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({ scoreBefore: 60, scoreAfter: 60 });
    // The whole guarantee: `update` must not mention the before fields.
    expect(call.update).not.toHaveProperty("scoreBefore");
    expect(call.update).not.toHaveProperty("geoBefore");
    expect(call.update).not.toHaveProperty("seoBefore");
    expect(call.update).toMatchObject({ scoreAfter: 60 });
  });

  it("skips a product with no usable score rather than storing a zero", async () => {
    await recordProductScores(SHOP, [{ id: "gid://shopify/Product/9", scores: { combined: null } }], NOW);
    expect(prisma.productScore.upsert).not.toHaveBeenCalled();
  });

  it("one product's write failing does not stop the rest", async () => {
    prisma.productScore.upsert.mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce({});
    expect(await recordProductScores(SHOP, scored(2), NOW)).toBe(1);
  });

  it("returns a delta only when BOTH ends are known", async () => {
    prisma.productScore.findMany.mockResolvedValue([
      { productId: "p1", scoreBefore: 40, scoreAfter: 80 },
      { productId: "p2", scoreBefore: null, scoreAfter: 80 },
      { productId: "p3", scoreBefore: 40, scoreAfter: null },
    ]);
    const out = await productScoresFor(SHOP, ["p1", "p2", "p3"]);
    expect(out.p1).toEqual({ before: 40, after: 80, delta: 40 });
    expect(out.p2).toBeUndefined();
    expect(out.p3).toBeUndefined();
  });

  it("returns an empty map rather than throwing when the table is unreachable", async () => {
    prisma.productScore.findMany.mockRejectedValue(new Error("db down"));
    expect(await productScoresFor(SHOP, ["p1"])).toEqual({});
  });

  it("asks for nothing when there are no products", async () => {
    expect(await productScoresFor(SHOP, [])).toEqual({});
    expect(prisma.productScore.findMany).not.toHaveBeenCalled();
  });
});
