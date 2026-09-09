import { authenticate } from "../shopify.server";
import db from "../db.server";
import logger from "../utils/logger.server";
import { chunkDelete, GDPR_SHOP_MODELS } from "../utils/gdpr.server.js";
import { markShopUninstalled } from "../utils/installTracking.server.js";

export const action = async ({ request }) => {
  const { shop, topic, triggeredAt } = await authenticate.webhook(request);

  logger.info({ shop, topic }, "Webhook received: app/uninstalled");

  try {
    await db.$transaction(async (tx) => {
      // Batched deletion so large tenants stay within the transaction timeout.
      for (const model of GDPR_SHOP_MODELS) {
        await chunkDelete(tx, model, { shop });
      }
    }, { timeout: 60_000 });
    logger.info({ shop }, "All shop data deleted after uninstall");
  } catch (err) {
    // Log but don't fail — Shopify expects a 200 regardless.
    // The shop/redact GDPR webhook will be sent 48h later as a second chance.
    logger.error({ shop, err }, "Failed to delete shop data on uninstall");
  }

  // The Shop row is intentionally NOT in GDPR_SHOP_MODELS: it survives uninstall
  // with uninstalledAt set so installs/uninstalls/reinstalls stay countable. The
  // shop/redact webhook (48h later) anonymises it.
  await markShopUninstalled(shop, triggeredAt);

  return new Response();
};
