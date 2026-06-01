import { authenticate } from "../shopify.server";
import db from "../db.server";

// GDPR: Triggered when a customer requests a copy of their data.
// ContentClaude stores NO customer PII — only shop-level content (descriptions,
// brand voice, generation history). We acknowledge the request and log it for
// audit purposes.
export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

  await db.gDPRRequest.create({
    data: {
      shop,
      requestType: "customer_data_request",
      payload: JSON.stringify(payload),
    },
  });

  // ContentClaude does not store any customer-identifiable information.
  // The app only stores: shop domain, product content, brand voice settings,
  // and usage counts — none of which are tied to individual customers.
  return new Response(null, { status: 200 });
};
