import { authenticate } from "../shopify.server";
import db from "../db.server";
import logger from "../utils/logger.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  logger.info({ shop, topic }, "Webhook received: app/uninstalled");

  // Delete all shop data in a single transaction. This mirrors the shop/redact
  // webhook so that uninstall + GDPR redact both leave the database clean.
  // GDPRRequest rows are intentionally kept as audit trail.
  try {
    await db.$transaction(async (tx) => {
      await tx.generatedContent.deleteMany({ where: { shop } });
      await tx.contentVersion.deleteMany({ where: { shop } });
      await tx.contentTemplate.deleteMany({ where: { shop } });
      await tx.collectionVoice.deleteMany({ where: { shop } });
      await tx.brandVoice.deleteMany({ where: { shop } });
      await tx.blogPost.deleteMany({ where: { shop } });
      await tx.generationJob.deleteMany({ where: { shop } });
      await tx.usageRecord.deleteMany({ where: { shop } });
      await tx.plan.deleteMany({ where: { shop } });
      await tx.session.deleteMany({ where: { shop } });
    });
    logger.info({ shop }, "All shop data deleted after uninstall");
  } catch (err) {
    // Log but don't fail — Shopify expects a 200 regardless.
    // The shop/redact GDPR webhook will be sent 48h later as a second chance.
    logger.error({ shop, err }, "Failed to delete shop data on uninstall");
  }

  return new Response();
};
