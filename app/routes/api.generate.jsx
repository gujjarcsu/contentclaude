// Shopify Flow / external trigger endpoint
// POST /api/generate with JSON body: { productId, shop, contentTypes, autoPublish }
// Requires X-ContentPilot-Token header matching CONTENTPILOT_API_TOKEN env var

import prisma from "../db.server";
import { enqueueGenerationJob } from "../queues/generationQueue.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = request.headers.get("X-ContentPilot-Token");
  const expectedToken = process.env.CONTENTPILOT_API_TOKEN;
  if (!expectedToken || token !== expectedToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { productId, shop, contentTypes: rawTypes, autoPublish = false } = body;
  if (!productId || !shop) {
    return Response.json({ error: "productId and shop are required" }, { status: 400 });
  }

  const contentTypes = Array.isArray(rawTypes)
    ? rawTypes
    : ["description", "metaTitle", "metaDescription"];

  const plan = await prisma.plan.findUnique({ where: { shop } });
  const month = new Date().toISOString().slice(0, 7);
  const usageCount = await prisma.usageRecord.count({ where: { shop, month } });
  if ((plan?.status ?? "active") !== "active" || usageCount >= (plan?.monthlyLimit ?? 10)) {
    return Response.json({ error: "Monthly generation limit reached" }, { status: 429 });
  }

  const gid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: 1,
      productIds: JSON.stringify([gid]),
      contentTypes: contentTypes.join(","),
      autoPublish: Boolean(autoPublish),
    },
  });

  await enqueueGenerationJob(job.id);
  return Response.json({ success: true, jobId: job.id }, { status: 202 });
};

export const loader = () => Response.json({ error: "Use POST" }, { status: 405 });
