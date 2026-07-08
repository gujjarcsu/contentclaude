// Shared GDPR / uninstall deletion helpers.
//
// Large tenants can have hundreds of thousands of rows; a single deleteMany per
// table inside an interactive transaction can blow the transaction timeout and
// lock tables for a long time. chunkDelete removes rows in bounded batches so the
// whole redaction stays well within the (extended) 60s transaction window.

// Tables that hold per-shop data, in an order safe for cascade-free deletion.
export const GDPR_SHOP_MODELS = [
  "generatedContent",
  "contentVersion",
  "contentTemplate",
  "collectionVoice",
  "brandVoice",
  "blogPost",
  "generationJob",
  "usageRecord",
  "plan",
  "growthState",
  "session",
];

/**
 * Delete all rows matching `where` from `model` in batches of `batchSize`.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {string} model  Prisma model accessor (e.g. "generatedContent")
 * @param {object} where  filter (e.g. { shop })
 */
export async function chunkDelete(tx, model, where, batchSize = 5000) {
  // Loop while rows remain; small batches keep the TX within its timeout.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await tx[model].findMany({ where, select: { id: true }, take: batchSize });
    if (rows.length === 0) return;
    await tx[model].deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  }
}
