import { authenticate } from "../shopify.server";
import db from "../db.server";

// GDPR: Triggered 48 hours after a merchant deletes a customer, requesting
// that all data for that customer be erased.
// ContentClaude stores NO customer PII — nothing to redact. Log for audit.
export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

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

  // Retention: audit rows older than 2 years have served their purpose.
  await db.gDPRRequest.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000) } },
  });

  // No customer data to redact — the app only holds shop-level data.
  return new Response(null, { status: 200 });
};
