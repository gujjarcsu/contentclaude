import { authenticate } from "../shopify.server";
import db from "../db.server";

// GDPR: Triggered 48 hours after a merchant deletes a customer, requesting
// that all data for that customer be erased.
// ContentClaude stores NO customer PII — nothing to redact. Log for audit.
export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

  await db.gDPRRequest.create({
    data: {
      shop,
      requestType: "customer_redact",
      payload: JSON.stringify(payload),
    },
  });

  // No customer data to redact — ContentClaude only holds shop-level data.
  return new Response(null, { status: 200 });
};
