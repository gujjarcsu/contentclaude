import { authenticate } from "../shopify.server";
import db from "../db.server";

// GDPR: Triggered when a customer requests a copy of their data.
// ContentClaude stores NO customer PII — only shop-level content (descriptions,
// brand voice, generation history). We acknowledge the request and log it for
// audit purposes.
export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

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

  // Retention: audit rows older than 2 years have served their purpose.
  await db.gDPRRequest.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000) } },
  });

  // ContentClaude does not store any customer-identifiable information.
  // The app only stores: shop domain, product content, brand voice settings,
  // and usage counts — none of which are tied to individual customers.
  return new Response(null, { status: 200 });
};
