/**
 * The first-run goal is saved per shop, so a reload does not send the merchant
 * back to the goal question (found on a fresh install of the dev store, Nov 2026).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { prisma, authenticate } = vi.hoisted(() => ({
  prisma: { growthState: { upsert: vi.fn(async () => ({})) } },
  authenticate: { admin: vi.fn(async () => ({ session: { shop: "goal.myshopify.com" } })) },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate }));

const { action } = await import("../../app/routes/app._index.jsx");
const { firstStep } = await import("../../app/components/StartState.jsx");
const { FIRST_RUN_GOALS, validGoal } = await import("../../app/utils/firstRun.js");

const post = (fields) =>
  action({ request: new Request("https://app.test/app?index", { method: "POST", body: new URLSearchParams(fields) }) });

beforeEach(() => vi.clearAllMocks());

describe("Home saves the goal", () => {
  it("stores a valid goal against the shop", async () => {
    const res = await post({ actionType: "setFirstRunGoal", goal: "shopping" });
    expect(res.status).toBe(200);
    expect(prisma.growthState.upsert).toHaveBeenCalledWith({
      where: { shop: "goal.myshopify.com" },
      create: { shop: "goal.myshopify.com", firstRunGoal: "shopping" },
      update: { firstRunGoal: "shopping" },
    });
  });

  it("refuses anything that is not a goal, and writes nothing", async () => {
    const res = await post({ actionType: "setFirstRunGoal", goal: "<script>" });
    expect(res.status).toBe(400);
    expect(prisma.growthState.upsert).not.toHaveBeenCalled();
  });

  it("still handles the existing geo-note dismissal", async () => {
    const res = await post({ actionType: "dismissGeoNote" });
    expect(res.status).toBe(200);
  });
});

describe("the first run reopens where the merchant left it", () => {
  it("asks for the goal when none is saved and nothing is drafted", () => {
    expect(firstStep({ goal: null, draftedIds: [] })).toBe("goal");
  });

  it("opens at the result once a goal is saved", () => {
    for (const g of Object.values(FIRST_RUN_GOALS)) expect(firstStep({ goal: g, draftedIds: [] })).toBe("result");
  });

  it("ignores a stored value that is not a goal", () => {
    expect(validGoal("other")).toBeNull();
    expect(firstStep({ goal: "other", draftedIds: [] })).toBe("goal");
  });

  it("Home's loader passes the saved goal into the first run", () => {
    const src = readFileSync("app/routes/app._index.jsx", "utf8");
    expect(src).toMatch(/select: \{[^}]*firstRunGoal: true[^}]*\}/);
    expect(src).toMatch(/goal: validGoal\(growthState\?\.firstRunGoal\)/);
  });

  it("the goal screen saves the choice through Home's action", () => {
    const src = readFileSync("app/components/StartState.jsx", "utf8");
    expect(src).toMatch(/submit\(\{ actionType: "setFirstRunGoal", goal: g \}, \{ method: "post", action: "\/app\?index" \}\)/);
  });
});

describe("the column exists", () => {
  it("GrowthState.firstRunGoal is in the schema and has a migration", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema.slice(schema.indexOf("model GrowthState {"))).toMatch(/firstRunGoal\s+String\?/);
    expect(readFileSync("prisma/migrations/20261105130000_first_run_goal/migration.sql", "utf8")).toMatch(
      /ALTER TABLE "GrowthState" ADD COLUMN "firstRunGoal" TEXT;/,
    );
  });
});
