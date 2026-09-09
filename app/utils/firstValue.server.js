/**
 * First-value instrumentation (brief item 3) — first-writer-wins timestamps on
 * the Shop row, stamped by the server at the exact moment the thing happened:
 *
 *   firstDraftSeenAt   the first HTTP response that put an AI draft on the
 *                      merchant's screen (quick start, product page, welcome
 *                      demo, or the Review & Publish page listing drafts)
 *   firstPublishAt     the first Shopify-ACCEPTED productUpdate of AI content
 *   quickStartStartedAt / productCountAtFirstLoad   context for the report
 *
 * "Install" for time-to-value purposes is reinstalledAt ?? installedAt; a
 * reinstall resets these (see installTracking.recordReinstall).
 *
 * Every stamp is `updateMany where <field> is null` — idempotent under the two
 * parallel document loaders and concurrent fetchers — returns true only when
 * THIS call set the field, and never throws. A missing Shop row (a shop that
 * has not authenticated since tracking shipped) is simply not stamped;
 * nothing is invented.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";

/** The install moment a milestone is measured from. */
export function installAtOf(row) {
  return row?.reinstalledAt ?? row?.installedAt ?? null;
}

async function stampOnce(shop, field, data, event) {
  if (!shop || !prisma.shop?.updateMany) return false;
  try {
    const r = await prisma.shop.updateMany({ where: { shop, [field]: null }, data });
    if (r?.count === 1) {
      const row = await prisma.shop.findUnique({ where: { shop } }).catch(() => null);
      const installAt = installAtOf(row);
      logger.info(
        { shop, event, ...data, secondsSinceInstall: installAt ? Math.round((Date.now() - new Date(installAt).getTime()) / 1000) : null },
        `milestone: ${event}`
      );
      return true;
    }
  } catch (err) {
    logger.warn({ shop, field, err: err?.message }, "first-value stamp failed (non-fatal)");
  }
  return false;
}

/** Call from any server response that renders an AI draft to the merchant. */
export const markFirstDraftSeen = (shop, source) =>
  stampOnce(shop, "firstDraftSeenAt", { firstDraftSeenAt: new Date(), firstDraftSource: source || null }, "ttv_first_draft");

/** Call only after Shopify accepted the productUpdate (never on a failed write). */
export const markFirstPublish = (shop, source) =>
  stampOnce(shop, "firstPublishAt", { firstPublishAt: new Date(), firstPublishSource: source || null }, "ttv_first_publish");

/** The merchant pressed the quick-start button. */
export const stampQuickStartStarted = (shop) =>
  stampOnce(shop, "quickStartStartedAt", { quickStartStartedAt: new Date() }, "ttv_quick_start_started");

/** Catalog size on the first dashboard load — explains installs that can never reach a draft. */
export const stampProductCountAtFirstLoad = (shop, n) =>
  Number.isFinite(n)
    ? stampOnce(shop, "productCountAtFirstLoad", { productCountAtFirstLoad: Math.max(0, Math.round(n)) }, "ttv_product_count")
    : Promise.resolve(false);

/** One more quick-start draft landed (never throws). */
export async function incrementQuickStartDrafts(shop) {
  if (!shop || !prisma.shop?.updateMany) return 0;
  try {
    const r = await prisma.shop.updateMany({ where: { shop }, data: { quickStartDraftCount: { increment: 1 } } });
    return r.count;
  } catch {
    return 0;
  }
}
