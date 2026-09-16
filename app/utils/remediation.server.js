/**
 * P2.6 — bulk remediation, with I/O. Reasoning in remediation.js.
 *
 * Every write to Shopify goes through `readMutationResult` (all three
 * failure modes of a 200) and then checks the value Shopify sent back
 * equals the value we sent — the same standard the content publish holds.
 * Every write path starts with `assertWritable(shop)`.
 *
 * After a successful write the product's stored findings are updated in
 * place, so the attention page is true the moment the merchant returns to
 * it rather than after tonight's walk.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { shopifyQuery } from "./shopifyQuery.server.js";
import { readMutationResult } from "./adminGraphql.server.js";
import { remainingGenerations, sliceToQuota } from "./plans.server.js";
import { enqueueGenerationJob } from "../queues/generationQueue.server.js";
import { parseFindings } from "./catalogueWatch.js";
import { FREE_CONTENT_TYPES } from "./credits.js";
import { FIX, FIX_LABEL, FIX_ERRORS, inferOptionName, withoutFinding, isValidGtin, candidatesFromRows } from "./remediation.js";

/**
 * Phase 14 item 1 — the lock itself moved to `writeLock.server.js`, where it
 * also wraps the three graphql factories, so that Review, the product page, a
 * bulk job and autopilot are covered too. These five writers keep calling
 * `assertWritable(shop)` first: it fails earlier and more cheaply than the
 * choke point, and belt-and-braces on a guard that protects a third party's
 * catalogue is the right trade. Re-exported because the route and the tests
 * import them from here.
 */
export { RemediationLocked, assertWritable, isRemediationLocked, lockConfigured } from "./writeLock.server.js";
import { assertWritable } from "./writeLock.server.js";

export const PROPOSAL_CAP = 50;

const OPTIONS_QUERY = `query optionValues($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product { id title hasOnlyDefaultVariant options { id name values } variants(first: 1) { nodes { id barcode } } }
  }
}`;

const VENDOR_MUTATION = `mutation setVendor($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id vendor } userErrors { field message } }
}`;
const OPTION_MUTATION = `mutation renameOption($productId: ID!, $option: OptionUpdateInput!) {
  productOptionUpdate(productId: $productId, option: $option) { product { id options { id name } } userErrors { field message code } }
}`;
const BARCODE_MUTATION = `mutation setBarcodes($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id barcode } userErrors { field message code } }
}`;

/** Per-fix candidate lists for a shop, from the stored findings. */
export async function remediationCandidates(shop) {
  const rows = await prisma.productWatch.findMany({
    where: { shop, grade: { not: null } },
    select: { productId: true, title: true, handle: true, grade: true, gtinExempt: true, statusShop: true },
    orderBy: { updatedAt: "desc" },
  });
  return candidatesFromRows(rows, parseFindings);
}

/** Option ids, current names, values and a suggested name, for up to PROPOSAL_CAP products. */
export async function proposeOptionNames(graphql, shop, productIds) {
  const ids = (productIds ?? []).slice(0, PROPOSAL_CAP);
  if (ids.length === 0) return [];
  const r = await shopifyQuery(graphql, OPTIONS_QUERY, { ids }, { shop, label: "option values" });
  if (!r.ok) return [];
  const out = [];
  for (const n of r.data?.nodes ?? []) {
    if (!n?.id) continue;
    for (const o of n.options ?? []) {
      if (!/^(title|default title|default)$/i.test(String(o?.name ?? "").trim())) continue;
      out.push({ productId: n.id, title: n.title, optionId: o.id, current: o.name, values: o.values ?? [], proposed: inferOptionName(o.values ?? []) });
    }
  }
  return out;
}

/** First-variant ids (and current barcodes) for the barcode form. */
export async function firstVariants(graphql, shop, productIds) {
  const ids = (productIds ?? []).slice(0, PROPOSAL_CAP);
  if (ids.length === 0) return [];
  const r = await shopifyQuery(graphql, OPTIONS_QUERY, { ids }, { shop, label: "first variants" });
  if (!r.ok) return [];
  return (r.data?.nodes ?? [])
    .filter((n) => n?.id)
    .map((n) => ({ productId: n.id, title: n.title, singleVariant: n.hasOnlyDefaultVariant === true, variantId: n.variants?.nodes?.[0]?.id ?? null, barcode: n.variants?.nodes?.[0]?.barcode ?? "" }));
}

async function dropFinding(shop, productId, key) {
  const row = await prisma.productWatch.findUnique({ where: { shop_productId: { shop, productId } }, select: { grade: true } });
  if (!row) return;
  const next = withoutFinding(parseFindings(row.grade), key);
  await prisma.productWatch.update({
    where: { shop_productId: { shop, productId } },
    data: { grade: JSON.stringify(next.findings), blocking: next.blocking, degrading: next.degrading, cosmetic: next.cosmetic },
  });
}

/**
 * One vendor name onto each ticked product. Sequential — a bulk write that
 * fans out is how a rate limit becomes an incident.
 */
export async function applyVendor(graphql, shop, items, vendor) {
  assertWritable(shop);
  const name = String(vendor ?? "").trim();
  if (!name) return { applied: 0, failed: (items ?? []).map((i) => ({ productId: i.productId, error: FIX_ERRORS.noBrand })) };
  let applied = 0;
  const failed = [];
  for (const it of items ?? []) {
    try {
      const res = await graphql(VENDOR_MUTATION, { variables: { product: { id: it.productId, vendor: name } } });
      const m = await readMutationResult(res, "productUpdate");
      if (!m.ok) throw new Error(m.errorMessages.join("; "));
      if (m.payload?.product?.vendor !== name) throw new Error(FIX_ERRORS.vendorMismatch);
      await dropFinding(shop, it.productId, { surface: "openai", field: "brand" });
      applied += 1;
    } catch (err) {
      failed.push({ productId: it.productId, error: err?.message ?? "failed" });
    }
  }
  logger.info({ shop, event: "remediation_vendor", applied, failed: failed.length }, "remediation: vendor");
  return { applied, failed };
}

/** Rename one option per ticked product. */
export async function applyOptionNames(graphql, shop, items) {
  assertWritable(shop);
  let applied = 0;
  const failed = [];
  for (const it of items ?? []) {
    const name = String(it.name ?? "").trim();
    if (!name || !it.optionId) {
      failed.push({ productId: it.productId, error: FIX_ERRORS.noOptionName });
      continue;
    }
    try {
      const res = await graphql(OPTION_MUTATION, { variables: { productId: it.productId, option: { id: it.optionId, name } } });
      const m = await readMutationResult(res, "productOptionUpdate");
      if (!m.ok) throw new Error(m.errorMessages.join("; "));
      const got = (m.payload?.product?.options ?? []).find((o) => o.id === it.optionId)?.name;
      if (got !== name) throw new Error(FIX_ERRORS.optionMismatch);
      await dropFinding(shop, it.productId, { surface: "openai", field: "variant options" });
      applied += 1;
    } catch (err) {
      failed.push({ productId: it.productId, error: err?.message ?? "failed" });
    }
  }
  logger.info({ shop, event: "remediation_options", applied, failed: failed.length }, "remediation: option names");
  return { applied, failed };
}

/** Write a merchant-typed barcode to the first variant. Invalid check digits are refused before any write. */
export async function applyBarcodes(graphql, shop, items) {
  assertWritable(shop);
  let applied = 0;
  const failed = [];
  for (const it of items ?? []) {
    const code = String(it.barcode ?? "").replace(/\s+/g, "");
    if (!it.variantId) {
      failed.push({ productId: it.productId, error: FIX_ERRORS.noVariant });
      continue;
    }
    if (!isValidGtin(code)) {
      failed.push({ productId: it.productId, error: FIX_ERRORS.invalidGtin });
      continue;
    }
    try {
      const res = await graphql(BARCODE_MUTATION, { variables: { productId: it.productId, variants: [{ id: it.variantId, barcode: code }] } });
      const m = await readMutationResult(res, "productVariantsBulkUpdate");
      if (!m.ok) throw new Error(m.errorMessages.join("; "));
      const got = (m.payload?.productVariants ?? []).find((v) => v.id === it.variantId)?.barcode;
      if (got !== code) throw new Error(FIX_ERRORS.barcodeMismatch);
      await dropFinding(shop, it.productId, { surface: "openai", field: "gtin" });
      applied += 1;
    } catch (err) {
      failed.push({ productId: it.productId, error: err?.message ?? "failed" });
    }
  }
  logger.info({ shop, event: "remediation_barcodes", applied, failed: failed.length }, "remediation: barcodes");
  return { applied, failed };
}

/** Record "no GTIN by design" for the ticked products. Writes nothing to Shopify. */
export async function setGtinExempt(shop, productIds, exempt = true) {
  assertWritable(shop);
  const ids = (productIds ?? []).filter(Boolean);
  await prisma.productWatch.updateMany({ where: { shop, productId: { in: ids } }, data: { gtinExempt: exempt } });
  if (exempt) for (const id of ids) await dropFinding(shop, id, { surface: "openai", field: "gtin" });
  logger.info({ shop, event: "remediation_gtin_exempt", count: ids.length, exempt }, "remediation: gtin exempt");
  return { applied: ids.length, failed: [] };
}

/**
 * Start a reviewed content job for the ticked products — the existing bulk
 * path, so drafts land on the Review page like any other. Credit-costing
 * types are sliced to the remaining allowance first and the rest disclosed.
 */
export async function startContentJob(shop, productIds, fix) {
  assertWritable(shop);
  const meta = FIX_LABEL[fix];
  if (!meta?.contentType) throw new Error("Not a content fix.");
  const ids = [...new Set((productIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { jobId: null, queued: 0, quotaSkipped: 0 };
  let targetIds = ids;
  let quotaSkipped = 0;
  if (!FREE_CONTENT_TYPES.includes(meta.contentType)) {
    const remaining = await remainingGenerations(shop);
    ({ targetIds, quotaSkipped } = sliceToQuota(ids, remaining));
  }
  if (targetIds.length === 0) return { jobId: null, queued: 0, quotaSkipped };
  const job = await prisma.generationJob.create({
    data: {
      shop,
      source: "remediation",
      status: "queued",
      totalProducts: targetIds.length,
      productIds: JSON.stringify(targetIds),
      contentTypes: meta.contentType,
      mode: "generate",
      autoPublish: false,
      quotaSkipped,
    },
  });
  await enqueueGenerationJob(job.id);
  logger.info({ shop, event: "remediation_job", fix, queued: targetIds.length, quotaSkipped }, "remediation: content job");
  return { jobId: job.id, queued: targetIds.length, quotaSkipped };
}

export { FIX };
