// Resource route (action only) — records that we've asked this shop for an App
// Store review, exactly once. Called by the ReviewRequest client component after
// it invokes App Bridge's shopify.reviews.request() at the peak-value moment
// (first successful publish). We set reviewRequestedAt on ANY outcome (success or
// decline) so we never ask the same shop twice, and log the outcome code so we
// can measure ask→review conversion later.
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import logger from "../utils/logger.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData();
  const code = String(form.get("code") || "unknown").slice(0, 60);

  // Only the FIRST ask counts — if already recorded, do nothing (idempotent).
  const existing = await prisma.growthState.findUnique({
    where: { shop },
    select: { reviewRequestedAt: true },
  });
  if (existing?.reviewRequestedAt) {
    return Response.json({ ok: true, already: true });
  }

  await prisma.growthState.upsert({
    where: { shop },
    create: { shop, reviewRequestedAt: new Date() },
    update: { reviewRequestedAt: new Date() },
  });

  logger.info({ shop, reviewOutcome: code }, "App Store review requested (post-publish)");
  return Response.json({ ok: true });
};
