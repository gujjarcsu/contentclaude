// Token-free verification (HMAC only) — see app/utils/webhookAuth.server.js for
// why the library authenticator cannot be used on lifecycle/GDPR webhooks.
//
// GDPR: triggered 48 hours after a shop uninstalls and requests full deletion.
//
// This topic was failing 100% of deliveries. Two causes, both fixed:
//   1. The 24 h triggered-at window refused every retry — and this topic
//      ARRIVES 48 h after the uninstall, so it was outside the window before
//      the first attempt was even made. Mandatory compliance topics are now
//      never rejected on their timestamp.
//   2. It answered in 816 ms because the whole redaction ran before the 200.
//      Now only the audit row is written first; the deletion runs after.
//
// The audit row is deliberately the FIRST thing written and the Shop
// anonymisation deliberately the LAST. Between them the shop is in a state that
// says "redaction owed, not finished", and sweepUnfinishedWebhookWork looks for
// exactly that — so a process killed mid-deletion loses nothing.
import { verifyShopifyWebhook, releaseWebhookDelivery } from "../utils/webhookAuth.server.js";
import db from "../db.server.js";
import logger from "../utils/logger.server.js";
import { finishAfterResponse, finishShopRedaction, completeRedactRequests } from "../utils/webhookWork.server.js";
import { probeInstalled } from "../utils/installState.server.js";

export const action = async ({ request }) => {
  const { payload, shop, webhookId, triggeredAt, duplicate } = await verifyShopifyWebhook(request);

  logger.info({ shop, triggeredAt, event: "webhook_shop_redact" }, "Webhook received: shop/redact");

  // The deletion is idempotent, but the audit trail is not: a redelivery must
  // not append a second "we redacted this shop" row.
  if (duplicate) return new Response("Duplicate", { status: 200 });

  try {
    // NON-PII digest only (shop_redact payloads carry no customer PII, but keep
    // the same discipline as the customer handlers). This row is the durable
    // record that the request arrived, and the marker the sweep keys on.
    await db.gDPRRequest.create({
      data: {
        shop,
        requestType: "shop_redact",
        payload: JSON.stringify({ shop_id: payload.shop_id, shop_domain: payload.shop_domain }),
      },
    });
  } catch (err) {
    // Nothing recorded, so there is nothing to recover from. Hand the delivery
    // id back and fail loudly — Shopify's retry is now genuinely allowed to run.
    await releaseWebhookDelivery(shop, webhookId);
    throw err;
  }

  // Everything below is recoverable from the row just written.
  // Phase 11 Part A — shop/redact arrives 48 hours after an uninstall. If the
  // merchant reinstalled inside those 48 hours, Shopify still sends it, and
  // the app it now serves would lose every row. A token that answers means
  // the shop is installed: the request is recorded (above, always) and marked
  // complete, and nothing is deleted — the data goes when the shop actually
  // uninstalls, at uninstall time, as it always has.
  const probe = await probeInstalled(shop);
  if (probe.installed === true) {
    logger.warn({ shop, triggeredAt, event: "shop_redact_contradicted" }, "shop/redact for a shop whose token Shopify still honours — recorded, not executed");
    finishAfterResponse("shop_redact_deferred", { shop, webhookId }, () => completeRedactRequests(shop, "shop_installed"));
    return new Response(null, { status: 200 });
  }
  finishAfterResponse("shop_redact_deferred", { shop, webhookId }, () => finishShopRedaction(shop));

  return new Response(null, { status: 200 });
};
