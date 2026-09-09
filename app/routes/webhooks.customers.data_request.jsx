// Token-free verification (HMAC only) — see app/utils/webhookAuth.server.js for
// why the library authenticator cannot be used on lifecycle/GDPR webhooks.
import { verifyShopifyWebhook, releaseWebhookDelivery } from "../utils/webhookAuth.server.js";
import db from "../db.server.js";
import logger from "../utils/logger.server.js";
import { pruneGdprAuditTrail } from "../utils/gdpr.server.js";

// GDPR: Triggered when a customer requests a copy of their data.
// Navaal stores NO customer PII — only shop-level content (descriptions,
// brand voice, generation history). We acknowledge the request and log it for
// audit purposes.
export const action = async ({ request }) => {
  const { payload, shop, webhookId, duplicate } = await verifyShopifyWebhook(request);

  // A redelivery of a request already recorded must not write a second audit row.
  if (duplicate) return new Response("Duplicate", { status: 200 });

  try {
    // Store a NON-PII digest only — the raw payload carries customer email and
    // phone, which this app must never persist.
    await db.gDPRRequest.create({
      data: {
        shop,
        requestType: "customer_data_request",
        payload: JSON.stringify({
          shop_id: payload.shop_id,
          customer_id: payload.customer?.id,
          orders_requested: payload.orders_requested?.length ?? 0,
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

  // Navaal does not store any customer-identifiable information.
  // The app only stores: shop domain, product content, brand voice settings,
  // and usage counts — none of which are tied to individual customers.
  return new Response(null, { status: 200 });
};
