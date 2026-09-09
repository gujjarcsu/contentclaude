// Token-free verification (HMAC only) — see app/utils/webhookAuth.server.js for
// why the library authenticator cannot be used on lifecycle/GDPR webhooks.
import { verifyShopifyWebhook, releaseWebhookDelivery } from "../utils/webhookAuth.server.js";
import db from "../db.server";
import logger from "../utils/logger.server.js";
import { pruneGdprAuditTrail } from "../utils/gdpr.server.js";

// GDPR: Triggered 48 hours after a merchant deletes a customer, requesting
// that all data for that customer be erased.
// Navaal stores NO customer PII — nothing to redact. Log for audit.
export const action = async ({ request }) => {
  const { payload, shop, webhookId, duplicate } = await verifyShopifyWebhook(request);

  // A redelivery of a request already recorded must not write a second audit row.
  if (duplicate) return new Response("Duplicate", { status: 200 });

  try {
    // Store a NON-PII digest only. Shopify's payload includes customer email
    // and phone — persisting it verbatim would make this handler the one place
    // in the app that holds customer PII, contradicting its own purpose.
    await db.gDPRRequest.create({
      data: {
        shop,
        requestType: "customer_redact",
        payload: JSON.stringify({
          shop_id: payload.shop_id,
          customer_id: payload.customer?.id,
          orders_to_redact: payload.orders_to_redact?.length ?? 0,
        }),
      },
    });
  } catch (err) {
    // The delivery was not recorded — let Shopify's retry try again.
    await releaseWebhookDelivery(shop, webhookId);
    throw err;
  }

  // Retention: audit rows older than 2 years have served their purpose. Never
  // fatal — the request IS recorded by this point, and failing here would make
  // Shopify retry a delivery that already succeeded.
  await pruneGdprAuditTrail(db, logger);

  // No customer data to redact — the app only holds shop-level data.
  return new Response(null, { status: 200 });
};
