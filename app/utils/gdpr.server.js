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
  "reviewRequestAttempt",
  "upgradePrompt",
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

/** GDPR audit rows are kept for two years, then pruned. */
export const GDPR_AUDIT_RETENTION_MS = 2 * 365 * 24 * 3600 * 1000;

/**
 * Prune GDPR audit rows past their retention window.
 *
 * The column is `processedAt` (see prisma/schema.prisma). Both customer
 * handlers used to filter on `createdAt`, which GDPRRequest does not have:
 * Prisma threw AFTER the audit row was written, so every mandatory
 * customers/redact and customers/data_request delivery returned 500, Shopify
 * retried forever, and each retry left another duplicate audit row.
 *
 * Never throws: by the time this runs the request is already recorded, and a
 * failure here must not turn a successful delivery into a retry.
 * @returns {Promise<number>} rows deleted (0 when the prune itself failed)
 */
export async function pruneGdprAuditTrail(db, logger, { now = Date.now() } = {}) {
  try {
    const { count } = await db.gDPRRequest.deleteMany({
      where: { processedAt: { lt: new Date(now - GDPR_AUDIT_RETENTION_MS) } },
    });
    return count;
  } catch (err) {
    logger?.warn?.({ err: err?.message }, "GDPR audit retention prune failed — request itself was recorded");
    return 0;
  }
}
