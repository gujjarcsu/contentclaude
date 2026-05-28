import { authenticate } from "../shopify.server";
import db from "../db.server";

// GDPR: Triggered 48 hours after a shop uninstalls the app and requests
// full data deletion. All shop data must be permanently removed.
// Uses a single transaction so it either fully completes or fully rolls back.
export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  await db.$transaction(async (tx) => {
    // Log the request first (inside the transaction so it's part of the atomic op)
    await tx.gDPRRequest.create({
      data: {
        shop,
        requestType: "shop_redact",
        payload: JSON.stringify(payload),
      },
    });

    // Delete every table that holds shop data
    await tx.generatedContent.deleteMany({ where: { shop } });
    await tx.contentVersion.deleteMany({ where: { shop } });
    await tx.contentTemplate.deleteMany({ where: { shop } });
    await tx.collectionVoice.deleteMany({ where: { shop } });
    await tx.brandVoice.deleteMany({ where: { shop } });
    await tx.generationJob.deleteMany({ where: { shop } });
    await tx.usageRecord.deleteMany({ where: { shop } });
    await tx.plan.deleteMany({ where: { shop } });
    await tx.session.deleteMany({ where: { shop } });

    // GDPRRequest rows for this shop are intentionally kept — they are the
    // audit trail proving deletion occurred, which regulators may request.
  });

  return new Response(null, { status: 200 });
};
