/**
 * Uninstall → reinstall carries the month's CREDITS over, not its record count.
 *
 * Found on the dev store (Nov 2026): 23 credits used, 24 usage records (one was
 * free alt text). After a reinstall the shop was charged 24. The opposite case
 * gives credits away: a blog post is one record worth 3 credits, so it came
 * back as 1 and a reinstall handed 2 credits back.
 *
 * In-memory database, real plans.server.js.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const state = { usage: [], shop: { usageMonth: null, usageCarryover: 0 } };
  const match = (where) => (r) => r.shop === where.shop && (!where.month || r.month === where.month);
  return {
    state,
    prisma: {
      usageRecord: {
        count: async ({ where }) => state.usage.filter(match(where)).length,
        aggregate: async ({ where }) => {
          const rows = state.usage.filter(match(where));
          return { _sum: { credits: rows.length ? rows.reduce((a, r) => a + r.credits, 0) : null } };
        },
        createMany: async ({ data }) => {
          for (const d of data) state.usage.push({ credits: 1, ...d });
          return { count: data.length };
        },
      },
      shop: {
        updateMany: async ({ data }) => {
          Object.assign(state.shop, data);
          return { count: 1 };
        },
        findUnique: async () => ({ ...state.shop }),
      },
    },
  };
});

vi.mock("../../app/db.server.js", () => ({ default: db.prisma }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (k, fn) => fn()), invalidateCache: vi.fn(async () => {}) }));

const { captureUsageCarryover, restoreUsageCarryover, sumMonthlyCredits } = await import("../../app/utils/plans.server.js");

const SHOP = "carry.myshopify.com";
const MONTH = new Date().toISOString().slice(0, 7);
const rec = (contentType, credits) => ({ shop: SHOP, month: MONTH, contentType, credits });

beforeEach(() => {
  db.state.usage = [];
  db.state.shop = { usageMonth: null, usageCarryover: 0 };
});

/** Uninstall (capture, then the delete), reinstall (restore). */
async function uninstallReinstall() {
  const before = await sumMonthlyCredits(SHOP, MONTH);
  await captureUsageCarryover(SHOP);
  db.state.usage = []; // deleteShopData removes every UsageRecord
  await restoreUsageCarryover(SHOP);
  return { before, after: await sumMonthlyCredits(SHOP, MONTH) };
}

describe("reinstall keeps the month's credits exactly", () => {
  it("free alt text is not charged after a reinstall", async () => {
    db.state.usage = [rec("description", 1), rec("metaTitle", 1), rec("altText", 0)];
    const { before, after } = await uninstallReinstall();
    expect(before).toBe(2);
    expect(after).toBe(2);
  });

  it("a blog post does not hand credits back", async () => {
    db.state.usage = [rec("blogPost", 3), rec("description", 1)];
    const { before, after } = await uninstallReinstall();
    expect(before).toBe(4);
    expect(after).toBe(4);
  });

  it("the dev-store case: 23 credits over 24 records stays 23", async () => {
    db.state.usage = [...Array.from({ length: 23 }, () => rec("description", 1)), rec("altText", 0)];
    const { before, after } = await uninstallReinstall();
    expect(before).toBe(23);
    expect(after).toBe(23);
  });

  it("a free record plus a 3-credit blog record comes back as exactly 3 credits", async () => {
    // Before the fix: two records → carried as 2 → the shop got 1 credit back.
    db.state.usage = [rec("altText", 0), rec("blogPost", 3)];
    expect(await sumMonthlyCredits(SHOP, MONTH)).toBe(3);

    await captureUsageCarryover(SHOP); // uninstall: capture, then the delete
    expect(db.state.shop.usageCarryover).toBe(3);
    db.state.usage = [];

    await restoreUsageCarryover(SHOP); // reinstall
    expect(await sumMonthlyCredits(SHOP, MONTH)).toBe(3);
    expect(db.state.usage.every((r) => r.contentType === "carryover" && r.credits === 1)).toBe(true);
  });

  it("restoring twice adds nothing the second time", async () => {
    db.state.usage = [rec("blogPost", 3)];
    await uninstallReinstall();
    await restoreUsageCarryover(SHOP);
    expect(await sumMonthlyCredits(SHOP, MONTH)).toBe(3);
  });
});
