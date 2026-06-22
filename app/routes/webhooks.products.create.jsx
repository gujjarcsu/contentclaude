import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueGenerationJob } from "../queues/generationQueue.server";
import { getEntitlements } from "../utils/billing-plans.js";
import { canGenerate } from "../utils/plans.server.js";
import { invalidateLlmsTxt } from "../utils/llms.server.js";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  // Catalog changed → the cached llms.txt is now stale; drop it so the next
  // crawler/agent hit regenerates a current index.
  await invalidateLlmsTxt(shop);

  const brandVoice = await prisma.brandVoice.findUnique({ where: { shop } });
  if (!brandVoice?.autopilotEnabled) {
    return new Response("Autopilot disabled", { status: 200 });
  }

  const productId = payload?.admin_graphql_api_id;
  if (!productId) return new Response("No product ID", { status: 200 });

  const contentTypes = (brandVoice.autopilotContentTypes || "description,metaTitle,metaDescription")
    .split(",")
    .filter(Boolean);

  const plan = await prisma.plan.findUnique({ where: { shop } });

  // Autopilot is a Growth+ feature — silently skip if plan doesn't allow it
  const ents = getEntitlements(plan?.planName ?? "free");
  if (!ents.autopilot) {
    return new Response("Autopilot requires Growth plan", { status: 200 });
  }

  // Fast-fail if clearly over limit — avoids creating jobs that will immediately fail.
  // The bulk processor performs the atomic tryConsumeGeneration gate when it runs.
  const quota = await canGenerate(shop);
  if (!quota.allowed) {
    return new Response("Plan limit reached", { status: 200 });
  }

  // Idempotency: Shopify may redeliver products/create on timeout/retry. If an
  // autopilot job for this exact product is already queued/processing, skip —
  // prevents duplicate jobs and double-charging. (The bulk processor's atomic
  // tryConsumeGeneration is the final guard against any residual race.)
  const productIdsJson = JSON.stringify([productId]);
  const pending = await prisma.generationJob.findFirst({
    where: { shop, status: { in: ["queued", "processing"] }, productIds: productIdsJson },
    select: { id: true },
  });
  if (pending) {
    return new Response("Already queued for this product", { status: 200 });
  }

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: 1,
      productIds: productIdsJson,
      contentTypes: contentTypes.join(","),
      autoPublish: brandVoice.autopilotAutoPublish,
    },
  });

  await enqueueGenerationJob(job.id);
  return new Response("OK", { status: 200 });
};
