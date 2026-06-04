/**
 * Tests for snapshotAndPrune utility.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/db.server.js", () => ({
  default: {
    contentVersion: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const prisma = (await import("../../app/db.server.js")).default;
const { snapshotAndPrune } = await import("../../app/utils/contentVersion.server.js");

describe("snapshotAndPrune", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when existingRecords is empty", async () => {
    await snapshotAndPrune("shop.com", "gid://shopify/Product/1", []);
    expect(prisma.contentVersion.createMany).not.toHaveBeenCalled();
  });

  it("does nothing when existingRecords is undefined", async () => {
    await snapshotAndPrune("shop.com", "gid://shopify/Product/1", undefined);
    expect(prisma.contentVersion.createMany).not.toHaveBeenCalled();
  });

  it("creates version snapshots for provided records", async () => {
    prisma.contentVersion.createMany.mockResolvedValue({ count: 2 });
    prisma.contentVersion.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, createdAt: new Date() }))
    );

    const records = [
      { contentType: "description", generatedContent: "<p>Old desc</p>", version: 3 },
      { contentType: "metaTitle", generatedContent: "Old title", version: 2 },
    ];

    await snapshotAndPrune("shop.com", "gid://shopify/Product/1", records);

    expect(prisma.contentVersion.createMany).toHaveBeenCalledWith({
      data: [
        { shop: "shop.com", productId: "gid://shopify/Product/1", contentType: "description", content: "<p>Old desc</p>", version: 3 },
        { shop: "shop.com", productId: "gid://shopify/Product/1", contentType: "metaTitle", content: "Old title", version: 2 },
      ],
      skipDuplicates: true,
    });
  });

  it("does not prune when version count is below MAX (20)", async () => {
    prisma.contentVersion.createMany.mockResolvedValue({ count: 1 });
    // Return 15 versions — below the 20 limit
    prisma.contentVersion.findMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({ id: `v${i}`, createdAt: new Date() }))
    );

    const records = [{ contentType: "description", generatedContent: "<p>Content</p>", version: 1 }];
    await snapshotAndPrune("shop.com", "gid://shopify/Product/1", records);

    expect(prisma.contentVersion.deleteMany).not.toHaveBeenCalled();
  });

  it("prunes versions beyond MAX_VERSIONS_PER_TYPE (20)", async () => {
    prisma.contentVersion.createMany.mockResolvedValue({ count: 1 });
    // Return 25 versions — 5 should be pruned
    prisma.contentVersion.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({ id: `v${i}`, createdAt: new Date() }))
    );

    const records = [{ contentType: "description", generatedContent: "<p>Content</p>", version: 1 }];
    await snapshotAndPrune("shop.com", "gid://shopify/Product/1", records);

    expect(prisma.contentVersion.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: Array.from({ length: 5 }, (_, i) => `v${i + 20}`) },
      },
    });
  });
});
