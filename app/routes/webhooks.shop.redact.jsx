import { authenticate } from "../shopify.server";
import db from "../db.server";
import { chunkDelete, GDPR_SHOP_MODELS } from "../utils/gdpr.server.js";

// GDPR: Triggered 48 hours after a shop uninstalls the app and requests
// full data deletion. All shop data must be permanently removed.
// Uses a single transaction so it either fully completes or fully rolls back.
export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

  await db.$transaction(async (tx) => {
    // Log the request first (inside the transaction so it's part of the atomic op)
    // NON-PII digest only (shop_redact payloads carry no customer PII, but
    // keep the same discipline as the customer handlers).
    await tx.gDPRRequest.create({
      data: {
        shop,
        requestType: "shop_redact",
        payload: JSON.stringify({ shop_id: payload.shop_id, shop_domain: payload.shop_domain }),
      },
    });

    // Delete every table that holds shop data, in bounded batches so a large
    // tenant's redaction stays within the transaction timeout.
    for (const model of GDPR_SHOP_MODELS) {
      await chunkDelete(tx, model, { shop });
    }

    // GDPRRequest rows for this shop are intentionally kept — they are the
    // audit trail proving deletion occurred, which regulators may request.
  }, { timeout: 60_000 });

  return new Response(null, { status: 200 });
};
