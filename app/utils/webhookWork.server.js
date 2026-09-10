/**
 * Webhook work that happens AFTER the 200, and the sweep that finishes it if
 * the process dies first.
 *
 * WHY THIS EXISTS
 *
 * Shopify's Dev Dashboard reported app/uninstalled at 1,039 ms and shop/redact
 * at 816 ms. Neither number is about data volume — a shop with no rows at all
 * measured the same. It is round trips: `chunkDelete` walks GDPR_SHOP_MODELS
 * (13 models) issuing a findMany and a deleteMany each, so an EMPTY shop still
 * costs ~26 sequential queries against Neon before anything is written to the
 * response. app/uninstalled adds the carryover capture, the in-flight job
 * cancel and the uninstall stamp on top.
 *
 * Shopify's guidance is to acknowledge within 5 seconds and do the work
 * afterwards, and a webhook that spends a second in the database is a webhook
 * that fails the moment the database is slow. So each handler now does the
 * smallest DURABLE thing before it answers, and the rest runs after.
 *
 * THE DURABILITY PROBLEM, AND HOW IT IS SOLVED
 *
 * Returning 200 tells Shopify never to send this delivery again. If the process
 * is killed mid-way through the deferred half — a deploy, a machine stop — the
 * deletion is simply lost, and for a GDPR redaction that is not an acceptable
 * failure mode. So the split is chosen such that the part that runs BEFORE the
 * 200 leaves a durable marker that says "this is owed", and the marker is only
 * cleared by the part that runs after:
 *
 *   app/uninstalled  marker: Shop.uninstalledAt is set, and Session rows remain
 *   shop/redact      marker: a GDPRRequest(shop_redact) row exists, and the
 *                            Shop row has not been anonymised yet
 *
 * `sweepUnfinishedWebhookWork` looks for exactly those two states and finishes
 * them. It runs in the worker, which is the process that is never load-balanced
 * and never auto-stopped. Between the deferred run and the sweep there is no
 * window in which the work is both owed and forgotten.
 */
import db from "../db.server.js";
import logger from "./logger.server.js";
import { chunkDelete, GDPR_SHOP_MODELS } from "./gdpr.server.js";
import { markShopUninstalled, redactShopRecord } from "./installTracking.server.js";
import { captureUsageCarryover } from "./plans.server.js";

/**
 * Deferred work still running, so shutdown can wait for it instead of killing
 * it. Holding the promises is what makes SIGTERM during a deploy a non-event
 * for a redaction that started two seconds earlier.
 */
const _inFlight = new Set();

/** How long shutdown waits for deferred webhook work before giving up on it. */
export const DRAIN_TIMEOUT_MS = 20_000;

/**
 * Run `fn` after the response has gone out.
 *
 * The handler returns its Response immediately; this promise keeps running on
 * the event loop. Nothing awaits it, so a failure here can never turn an
 * acknowledged delivery into a 500 — it is logged, and the durable marker left
 * by the synchronous half means the sweep will pick the work up.
 *
 * @param {string} event   log event name
 * @param {object} ctx     log context (shop, webhookId…)
 * @param {() => Promise<any>} fn
 */
export function finishAfterResponse(event, ctx, fn) {
  const started = Date.now();
  const p = (async () => {
    try {
      await fn();
      logger.info({ ...ctx, ms: Date.now() - started, event }, "Deferred webhook work finished");
    } catch (err) {
      // Deliberately swallowed. The delivery is already acknowledged; the
      // marker is still in place; the sweep is the retry.
      logger.error(
        { ...ctx, ms: Date.now() - started, err: err?.message, event: `${event}_failed` },
        "Deferred webhook work failed — the sweep will finish it",
      );
    } finally {
      _inFlight.delete(p);
    }
  })();
  _inFlight.add(p);
  return p;
}

/** How many deferred webhook tasks are still running. For tests and health. */
export function inFlightWebhookWork() {
  return _inFlight.size;
}

/**
 * Wait for deferred webhook work on shutdown. Never throws and never blocks
 * shutdown indefinitely: a task that is still going after the timeout is
 * abandoned to the sweep, which is exactly what it is there for.
 */
export async function drainWebhookWork(timeoutMs = DRAIN_TIMEOUT_MS) {
  if (_inFlight.size === 0) return 0;
  const n = _inFlight.size;
  logger.info({ count: n, event: "webhook_drain_start" }, "Waiting for deferred webhook work");
  await Promise.race([
    Promise.allSettled([..._inFlight]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  logger.info(
    { drained: n - _inFlight.size, abandoned: _inFlight.size, event: "webhook_drain_done" },
    "Deferred webhook drain complete",
  );
  return n - _inFlight.size;
}

/**
 * Delete every per-shop row. Batched inside one transaction so a large tenant
 * stays within the timeout. Shared by uninstall and redaction.
 */
export async function deleteShopData(tx, shop) {
  for (const model of GDPR_SHOP_MODELS) {
    await chunkDelete(tx, model, { shop });
  }
}

/**
 * The uninstall work that does not need to happen before the 200.
 *
 * Order matters: the carryover has to be captured before UsageRecord and Plan
 * are deleted, or an uninstall/reinstall cycle hands out a fresh 25 free
 * generations (Phase 0 item 10).
 */
export async function finishUninstall(shop) {
  // Record this month's generation count BEFORE the delete wipes it.
  await captureUsageCarryover(shop);

  // Stop any run still in flight. The worker checks per-product status and
  // aborts on seeing this, instead of working through the catalogue of a store
  // that no longer has the app and burning a 401 refresh on every product.
  try {
    const { count } = await db.generationJob.updateMany({
      where: { shop, status: { in: ["queued", "processing"] } },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorLog: JSON.stringify([
          { productId: "N/A", error: "The app was uninstalled while this job was running." },
        ]),
      },
    });
    if (count > 0) {
      logger.info({ shop, count, event: "jobs_cancelled_on_uninstall" }, "Cancelled in-flight jobs");
    }
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "Could not cancel in-flight jobs on uninstall (non-fatal)");
  }

  await db.$transaction(async (tx) => deleteShopData(tx, shop), { timeout: 60_000 });
  logger.info({ shop, event: "shop_data_deleted" }, "All shop data deleted after uninstall");
}

/**
 * The redaction work that does not need to happen before the 200.
 *
 * The GDPRRequest audit row is written by the handler BEFORE it answers, so
 * this running or not running is recoverable; anonymising the Shop row is the
 * last step, and is what tells the sweep the redaction is complete.
 */
export async function finishShopRedaction(shop) {
  await db.$transaction(
    async (tx) => {
      await deleteShopData(tx, shop);
      // Anonymised rather than deleted so aggregate install counts stay
      // truthful with nothing that identifies the store. Last, deliberately:
      // it is the completion marker.
      await redactShopRecord(tx, shop);
    },
    { timeout: 60_000 },
  );
  logger.info({ shop, event: "shop_redacted" }, "Shop redacted");
}

/** Don't sweep work that started seconds ago and is very likely still running. */
export const SWEEP_GRACE_MS = 5 * 60 * 1000;

/**
 * Finish webhook work that was acknowledged but never completed.
 *
 * This is the safety net for the deferred half: a deploy, a machine stop or a
 * database blip between the 200 and the end of the work. Runs in the worker.
 *
 * @returns {Promise<{redactions:number, uninstalls:number}>}
 */
export async function sweepUnfinishedWebhookWork({ now = Date.now() } = {}) {
  const cutoff = new Date(now - SWEEP_GRACE_MS);
  const result = { redactions: 0, uninstalls: 0 };

  // ── Owed redactions: an audit row exists, the Shop row is not anonymised.
  // `redactedAt: null` is the marker; redactShopRecord sets it in the same
  // transaction that deletes the data.
  try {
    const asked = await db.gDPRRequest.findMany({
      where: { requestType: "shop_redact", processedAt: { lt: cutoff } },
      select: { shop: true },
      distinct: ["shop"],
      take: 200,
    });
    for (const { shop } of asked) {
      const row = await db.shop.findUnique({ where: { shop }, select: { redactedAt: true } });
      // No row at all means it was already anonymised (the domain is rewritten
      // to redacted:<hash>) — nothing owed.
      if (!row || row.redactedAt) continue;
      logger.warn({ shop, event: "redaction_unfinished" }, "Redaction owed but incomplete — finishing");
      await finishShopRedaction(shop);
      result.redactions += 1;
    }
  } catch (err) {
    logger.error({ err: err?.message, event: "redaction_sweep_failed" }, "Redaction sweep failed");
  }

  // ── Owed uninstall deletions: uninstalledAt is stamped but rows survive.
  // Session is the cheapest probe — it is in GDPR_SHOP_MODELS, so if any
  // remain the delete did not complete.
  try {
    const uninstalled = await db.shop.findMany({
      where: { uninstalledAt: { lt: cutoff }, redactedAt: null },
      select: { shop: true },
      take: 200,
    });
    for (const { shop } of uninstalled) {
      const leftovers = await db.session.count({ where: { shop } });
      if (leftovers === 0) continue;
      logger.warn(
        { shop, leftovers, event: "uninstall_cleanup_unfinished" },
        "Uninstall deletion incomplete — finishing",
      );
      await db.$transaction(async (tx) => deleteShopData(tx, shop), { timeout: 60_000 });
      result.uninstalls += 1;
    }
  } catch (err) {
    logger.error({ err: err?.message, event: "uninstall_sweep_failed" }, "Uninstall sweep failed");
  }

  if (result.redactions || result.uninstalls) {
    logger.info({ ...result, event: "webhook_sweep_recovered" }, "Webhook sweep recovered owed work");
  }
  return result;
}

export { markShopUninstalled };
