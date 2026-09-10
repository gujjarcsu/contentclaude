// Token-free verification (HMAC only) — see app/utils/webhookAuth.server.js for
// why the library authenticator cannot be used on lifecycle/GDPR webhooks.
//
// This topic was failing 82.4% of deliveries. Two causes, both fixed:
//   1. The 24 h triggered-at window refused every retry past a day old, while
//      Shopify retries for ~48 h carrying the original timestamp. One transient
//      failure and the delivery could never succeed again.
//   2. It answered in 1,039 ms because the carryover capture, the job cancel
//      and thirteen chunked deletes all ran before the 200.
//
// What must happen BEFORE the 200 is the uninstall stamp: it is the durable
// marker that says data deletion is owed for this shop, and it is what
// sweepUnfinishedWebhookWork keys on if this process dies before the deletion
// finishes.
import { verifyShopifyWebhook } from "../utils/webhookAuth.server.js";
import db from "../db.server.js";
import logger from "../utils/logger.server.js";
import { markShopUninstalled } from "../utils/installTracking.server.js";
import { finishAfterResponse, finishUninstall } from "../utils/webhookWork.server.js";

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
  const { shop, topic, triggeredAt, webhookId, duplicate } = await verifyShopifyWebhook(request);

  logger.info({ shop, topic, triggeredAt }, "Webhook received: app/uninstalled");

  // Same delivery id seen already — the work below has been done (or is being
  // done) by the request that claimed it.
  if (duplicate) return new Response("Duplicate", { status: 200 });

  if (await isStaleUninstallDelivery(shop, triggeredAt)) {
    logger.warn(
      { shop, triggeredAt, event: "uninstall_delivery_stale" },
      "Stale app/uninstalled delivery (triggered before the latest reinstall) — ignored",
    );
    return new Response();
  }

  // The Shop row is intentionally NOT deleted: it survives uninstall with
  // uninstalledAt set so installs/uninstalls/reinstalls stay countable, and
  // shop/redact anonymises it 48 h later. Stamping it here, before the 200, is
  // what makes the deferred deletion recoverable.
  await markShopUninstalled(shop, triggeredAt);

  // Carryover capture, in-flight job cancel, and the deletion itself. If this
  // dies half-way the sweep finishes it; shop/redact 48 h later is the second
  // safety net it always was.
  finishAfterResponse("app_uninstalled_deferred", { shop, webhookId }, () => finishUninstall(shop));

  return new Response();
};
