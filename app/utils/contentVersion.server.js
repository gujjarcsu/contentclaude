import prisma from "../db.server.js";

const MAX_VERSIONS_PER_TYPE = 20;

/**
 * Snapshot current content to version history, then prune old versions.
 * Call this BEFORE overwriting generatedContent records.
 * Silently skips if existingRecords is empty.
 */
export async function snapshotAndPrune(shop, productId, existingRecords) {
  if (!existingRecords || existingRecords.length === 0) return;

  await prisma.contentVersion.createMany({
    data: existingRecords.map((c) => ({
      shop,
      productId,
      contentType: c.contentType,
      content: c.generatedContent,
      version: c.version,
    })),
    skipDuplicates: true,
  });

  // Prune: for each content type, keep only the last MAX_VERSIONS_PER_TYPE
  const contentTypes = [...new Set(existingRecords.map((c) => c.contentType))];

  await Promise.all(
    contentTypes.map(async (type) => {
      const versions = await prisma.contentVersion.findMany({
        where: { shop, productId, contentType: type },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });

      if (versions.length <= MAX_VERSIONS_PER_TYPE) return;

      const toDelete = versions.slice(MAX_VERSIONS_PER_TYPE);
      await prisma.contentVersion.deleteMany({
        where: { id: { in: toDelete.map((v) => v.id) } },
      });
    })
  );
}
