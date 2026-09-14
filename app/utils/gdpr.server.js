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
  // ── Added 2026-09-14 (P6.2), and both were real gaps ──────────────────────
  //
  // This list is what `shop/redact` actually deletes, and it was assembled by
  // hand. Two shop-scoped tables had never been on it:
  //
  //   productScore    every product's SEO score before and after we worked on
  //                   it, keyed by shop. A merchant who uninstalled and asked
  //                   Shopify to erase them kept a per-product scoreboard here.
  //   supportRequest  worse, and mine: it holds the EMAIL ADDRESS a merchant
  //                   typed to be replied to. I added the table in this same
  //                   phase and did not add it here, which is precisely how the
  //                   other one got missed.
  //
  // A hand-maintained deletion list drifts silently, because nothing fails when
  // you forget. `tests/utils/gdprCoverage.test.js` now walks the schema and
  // fails on any model with a `shop` column that is neither deleted here nor
  // exempted with a stated reason.
  "productScore",
  "supportRequest",
  // P2 — the catalogue watch and the crawler-access history are shop-scoped
  // records of what we observed; nothing about them survives an erasure.
  "productWatch",
  "crawlerAccess",
];

/**
 * Models that have a `shop` column and are deliberately NOT deleted on
 * redaction. Each needs a reason, because an exemption list without reasons
 * becomes the place things go to avoid the rule.
 *
 * Asserted against the schema by `tests/utils/gdprCoverage.test.js`.
 */
export const GDPR_EXEMPT_MODELS = {
  Shop:
    "ANONYMISED, not deleted. The domain is rewritten to redacted:<hash> and the row keeps counters " +
    "and timestamps only. It survives so that uninstalling and reinstalling cannot reset the free " +
    "trial or the free-tier allowance — Phase 0 item 10. It holds no content after redaction.",
  GDPRRequest:
    "The audit trail OF the redaction. Deleting it would destroy the record that we honoured the " +
    "request. It stores identifiers only — never the customer email or phone from Shopify's payload " +
    "— and is pruned after two years.",
  LogEvent:
    "Operational logs, WARN and above, carrying a shop domain and no content. Retained 30 days by " +
    "LOG_RETENTION_DAYS and pruned on a schedule, so it self-clears well inside any reasonable " +
    "retention expectation. Deleting it inside the redaction transaction would also mean deleting " +
    "the log lines describing the redaction while it is running.",
};

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
