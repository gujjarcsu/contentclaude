// External trigger endpoint — POST /api/generate
//
// Auth: per-shop HMAC only.
//   Caller sends X-Shop-Domain, X-ContentClaude-Timestamp and
//   X-ContentClaude-Signature headers.
//   Signature = HMAC-SHA256(`${timestamp}.${rawBody}`, shop's offline access token).
//   This scopes every request to one shop and rotates automatically when
//   Shopify rotates the shop's offline access token.
//
// The former "token" mode (single global shared secret, no shop scoping) was
// REMOVED: any holder of the one token could trigger paid generation jobs on
// ANY installed shop. Do not reintroduce a global secret here.
//
// Usage from Shopify Flow:
//   HTTP action → POST https://<your-app>/api/generate
//   Headers: X-Shop-Domain: {{shop.domain}}, X-ContentClaude-Signature: <hmac>
//   Body: { "productId": "gid://shopify/Product/123", "contentTypes": ["description"] }

import crypto from "node:crypto";
import prisma from "../db.server";
import { enqueueGenerationJob } from "../queues/generationQueue.server";
import { checkRateLimit } from "../utils/rateLimit.server.js";
import logger from "../utils/logger.server";

async function verifyRequest(request, rawBody) {
  // HMAC: per-shop signature verification with replay prevention
  const shopDomain = request.headers.get("X-Shop-Domain");
  const signature = request.headers.get("X-ContentClaude-Signature");
  const tsHeader = request.headers.get("X-ContentClaude-Timestamp");
  if (!shopDomain || !signature || !tsHeader) return { ok: false };

  // Reject requests older than 5 minutes (replay prevention)
  const tsSeconds = parseInt(tsHeader, 10);
  if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    return { ok: false, reason: "timestamp_expired" };
  }

  const session = await prisma.session.findFirst({
    where: { shop: shopDomain, isOnline: false },
    select: { accessToken: true },
  });
  if (!session?.accessToken) return { ok: false };

  // Include timestamp in signed payload so replay with different ts is rejected
  const signedPayload = `${tsHeader}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", session.accessToken)
    .update(signedPayload)
    .digest("hex");

  // Validate hex format before converting — odd-length hex silently truncates in Node
  if (!/^[0-9a-fA-F]+$/.test(signature) || signature.length % 2 !== 0) {
    return { ok: false, reason: "invalid_hex" };
  }
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return { ok: false };
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return { ok: false };

  return { ok: true, shop: shopDomain };
}

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();
  const auth = await verifyRequest(request, rawBody);
  if (!auth.ok) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { productId, shop: bodyShop, contentTypes: rawTypes, autoPublish = false } = body;

  // In HMAC mode the shop comes from the verified header; in token mode from the body.
  const shop = auth.shop || bodyShop;
  if (!productId || !shop) {
    return Response.json({ error: "productId and shop are required" }, { status: 400 });
  }
  // Validate productId is a numeric ID or a Shopify GID
  const numericOrGid = /^\d+$/.test(productId) || /^gid:\/\/shopify\/Product\/\d+$/.test(productId);
  if (!numericOrGid || productId.length > 200 || shop.length > 200) {
    return Response.json({ error: "Invalid productId or shop format" }, { status: 400 });
  }

  // Token mode trusts the shop from the body — confirm it's an actually-installed
  // shop before queueing. (HMAC mode already loaded the shop's session to verify
  // the signature, so it's redundant there.)
  if (!auth.shop) {
    const sess = await prisma.session.findFirst({
      where: { shop, isOnline: false },
      select: { id: true },
    });
    if (!sess) return Response.json({ error: "Unknown shop." }, { status: 404 });
  }

  const VALID_TYPES = new Set(["description", "metaTitle", "metaDescription", "faq"]);
  let contentTypes;
  if (rawTypes !== undefined) {
    if (!Array.isArray(rawTypes)) {
      return Response.json({ error: "contentTypes must be an array" }, { status: 400 });
    }
    const unknown = rawTypes.filter((t) => !VALID_TYPES.has(t));
    if (unknown.length > 0) {
      return Response.json({ error: `Unknown content types: ${unknown.join(", ")}` }, { status: 400 });
    }
    contentTypes = rawTypes.length > 0 ? rawTypes : ["description", "metaTitle", "metaDescription"];
  } else {
    contentTypes = ["description", "metaTitle", "metaDescription"];
  }

  // Rate limit: max 20 requests/minute per shop (prevents runaway Shopify Flow automation)
  const rl = await checkRateLimit(shop, { maxPerMinute: 20 });
  if (!rl.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Please retry after a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
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

  logger.info({ shop, jobId: job.id }, "External generate job queued");
  try {
    await enqueueGenerationJob(job.id);
  } catch (err) {
    logger.warn({ shop, jobId: job.id, err: err.message }, "External generate job rejected at enqueue");
    return Response.json({ error: err.message?.startsWith("You already have jobs") ? err.message : "Could not enqueue the job." }, { status: 429 });
  }
  return Response.json({ success: true, jobId: job.id }, { status: 202 });
};

export const loader = () => Response.json({ error: "Use POST" }, { status: 405 });
