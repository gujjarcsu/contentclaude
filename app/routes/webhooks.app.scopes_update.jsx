// Token-free verification (HMAC only) — see app/utils/webhookAuth.server.js.
// This handler needs no access token, and authenticate.webhook() would refresh
// one first, so a shop with an expired token got a bare 500 and an endless
// Shopify retry loop for what is a single column write.
// scopesFromPayload lives in the util module, not here: a route file may only
// export route members — a stray helper export passes tests but breaks the
// client build in CI.
import { verifyShopifyWebhook, releaseWebhookDelivery, scopesFromPayload } from "../utils/webhookAuth.server.js";
import db from "../db.server.js";
import logger from "../utils/logger.server.js";

export const action = async ({ request }) => {
  const { payload, topic, shop, webhookId, duplicate } = await verifyShopifyWebhook(request);

  logger.info({ shop, topic }, "Webhook received: app/scopes_update");

  if (duplicate) return new Response("Duplicate", { status: 200 });

  const scope = scopesFromPayload(payload);
  if (!scope) {
    logger.warn({ shop, event: "scopes_update_empty" }, "app/scopes_update carried no scopes — nothing written");
    return new Response(null, { status: 200 });
  }

  try {
    // updateMany, not update: without the library context there is no single
    // session id, and a shop can hold an offline session plus online ones. All
    // of them just had their granted scopes changed.
    const { count } = await db.session.updateMany({ where: { shop }, data: { scope } });
    logger.info({ shop, scope, sessions: count }, "Updated session scopes");
  } catch (err) {
    await releaseWebhookDelivery(shop, webhookId);
    throw err;
  }

  return new Response(null, { status: 200 });
};
