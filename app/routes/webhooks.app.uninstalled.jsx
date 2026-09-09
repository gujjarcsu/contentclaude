// Token-free verification (HMAC only) — see app/utils/webhookAuth.server.js for
// why the library authenticator cannot be used on lifecycle/GDPR webhooks.
import { verifyShopifyWebhook } from "../utils/webhookAuth.server.js";
import db from "../db.server";
import logger from "../utils/logger.server";
import { chunkDelete, GDPR_SHOP_MODELS } from "../utils/gdpr.server.js";
import { markShopUninstalled } from "../utils/installTracking.server.js";
import { captureUsageCarryover } from "../utils/plans.server.js";

// Shopify may deliver a webhook more than once and retries failed deliveries
// for hours. A delivery TRIGGERED before the shop's latest reinstall describes
// an uninstall that has already been processed (or superseded): acting on it
// would wipe the reinstalled shop's sessions, plan and drafts. Such deliveries
// are acknowledged and ignored. (Module-private: a route file may only export
// route members — a stray export breaks the client build.)
async function isStaleUninstallDelivery(shop, triggeredAt) {
  const t = triggeredAt ? new Date(triggeredAt) : null;
  if (!t || !Number.isFinite(t.getTime()) || !db.shop?.findUnique) return false;
  try {
    const row = await db.shop.findUnique({ where: { shop }, select: { reinstalledAt: true } });
    return !!row?.reinstalledAt && new Date(row.reinstalledAt).getTime() > t.getTime();
  } catch {
    return false;
  }
}

export const action = async ({ request }) => {
  const { shop, topic, triggeredAt, duplicate } = await verifyShopifyWebhook(request);

  logger.info({ shop, topic, triggeredAt }, "Webhook received: app/uninstalled");

  // Same delivery id seen already — the work below has been done (or is being
  // done) by the request that claimed it.
  if (duplicate) return new Response("Duplicate", { status: 200 });

  if (await isStaleUninstallDelivery(shop, triggeredAt)) {
    logger.warn({ shop, triggeredAt, event: "uninstall_delivery_stale" }, "Stale app/uninstalled delivery (triggered before the latest reinstall) — ignored");
    return new Response();
  }

  // Phase 0 item 10 — record this month's generation count BEFORE the delete
  // wipes UsageRecord and Plan. Without it, uninstall + reinstall handed out a
  // fresh 25 free generations on demand. A number only; nothing identifying.
  await captureUsageCarryover(shop);

  try {
    await db.$transaction(async (tx) => {
      // Batched deletion so large tenants stay within the transaction timeout.
      for (const model of GDPR_SHOP_MODELS) {
        await chunkDelete(tx, model, { shop });
      }
    }, { timeout: 60_000 });
    logger.info({ shop }, "All shop data deleted after uninstall");
  } catch (err) {
    // Log but don't fail — Shopify expects a 200 regardless.
    // The shop/redact GDPR webhook will be sent 48h later as a second chance.
    logger.error({ shop, err }, "Failed to delete shop data on uninstall");
  }

  // The Shop row is intentionally NOT in GDPR_SHOP_MODELS: it survives uninstall
  // with uninstalledAt set so installs/uninstalls/reinstalls stay countable. The
  // shop/redact webhook (48h later) anonymises it.
  await markShopUninstalled(shop, triggeredAt);

  return new Response();
};
