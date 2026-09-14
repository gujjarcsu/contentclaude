#!/usr/bin/env node
/**
 * P5.1 — has this app ever generated content against an ARCHIVED product?
 *
 * Under the pricing that shipped in Phase 4 this stopped being cosmetic. A
 * generation costs a real credit at 2.00c, so a bulk run that walked archived
 * products was spending a merchant's allowance on products they had
 * deliberately taken out of their store. A merchant who notices says so in the
 * review that decides whether this app has a future.
 *
 * The cause, fixed in the same commit as this script: `app.optimize.jsx` called
 * `enumerateProductIds` with NO `query`, so Shopify was asked for everything.
 * A1 in Phase 4 scoped the three READ paths on the Products page and left the
 * WRITE path unscoped — and the write path is the one that costs money.
 *
 * This asks production for the integer rather than reasoning about it.
 *
 * READ ONLY. It writes nothing, to the database or to Shopify.
 *
 * PRIVACY. It prints counts and shop HANDLES with the domain stripped, never a
 * product id, a product title or a customer-identifying value. Same rule as
 * paid-plans-diag.mjs: this output goes into a CI log.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/archived-generations-diag.mjs"
 */
import prisma from "../app/db.server.js";
import { getFreshOfflineSession } from "../app/utils/offlineToken.server.js";

const API_VERSION = "2026-04";
const PAGE = 250;
const MAX_PAGES = 40; // 10,000 archived products per shop is far past any real case

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shopGraphql(session, query, variables, attempt = 0) {
  const res = await fetch(`https://${session.shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 3) throw new Error(`Shopify HTTP ${res.status} after retries`);
    await sleep(1000 * 2 ** attempt);
    return shopGraphql(session, query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  const body = await res.json();
  if (body?.errors?.[0]?.extensions?.code === "THROTTLED") {
    if (attempt >= 3) throw new Error("throttled after retries");
    await sleep(1000 * 2 ** (attempt + 1));
    return shopGraphql(session, query, variables, attempt + 1);
  }
  if (body?.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

const ARCHIVED_QUERY = `
query archivedIds($cursor: String) {
  products(first: ${PAGE}, after: $cursor, query: "status:archived") {
    pageInfo { hasNextPage endCursor }
    nodes { id }
  }
}`;

/** Every archived product id in a shop, today. */
async function archivedIds(session) {
  const ids = new Set();
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await shopGraphql(session, ARCHIVED_QUERY, { cursor });
    const conn = data?.products;
    if (!conn) break;
    for (const n of conn.nodes ?? []) ids.add(n.id);
    if (!conn.pageInfo?.hasNextPage) return { ids, truncated: false };
    cursor = conn.pageInfo.endCursor;
  }
  return { ids, truncated: true };
}

// ── Every shop this app has ever written content for ──────────────────────────
const shops = (
  await prisma.generatedContent.findMany({ distinct: ["shop"], select: { shop: true } })
).map((r) => r.shop);

const perShop = [];
let totalArchivedWithContent = 0;
let totalPublishedToArchived = 0;
let totalUnreachable = 0;

for (const shop of shops) {
  const handle = String(shop).replace(/\.myshopify\.com$/, "");
  let session = null;
  try {
    session = await getFreshOfflineSession(shop);
  } catch {
    session = null;
  }
  if (!session?.accessToken) {
    // Uninstalled, or the token could not be refreshed. Reported, never
    // silently dropped — an unreachable shop is an unknown, not a zero.
    totalUnreachable++;
    perShop.push({ handle, reachable: false });
    continue;
  }

  let archived;
  try {
    archived = await archivedIds(session);
  } catch (err) {
    totalUnreachable++;
    perShop.push({ handle, reachable: false, error: String(err.message).slice(0, 80) });
    continue;
  }

  // Distinct products we hold content for, with the strongest state per product.
  const rows = await prisma.generatedContent.findMany({
    where: { shop },
    select: { productId: true, status: true },
  });
  const byProduct = new Map();
  for (const r of rows) {
    const prev = byProduct.get(r.productId);
    // published beats everything: it is the state that means we wrote to the store.
    if (!prev || r.status === "published") byProduct.set(r.productId, r.status);
  }

  let withContent = 0;
  let published = 0;
  for (const [productId, status] of byProduct) {
    if (!archived.ids.has(productId)) continue;
    withContent++;
    if (status === "published") published++;
  }

  totalArchivedWithContent += withContent;
  totalPublishedToArchived += published;
  perShop.push({
    handle,
    reachable: true,
    archivedInShopify: archived.ids.size,
    archivedTruncated: archived.truncated,
    productsWeHoldContentFor: byProduct.size,
    // THE INTEGER P5.1 IS ABOUT.
    archivedProductsWeGeneratedFor: withContent,
    archivedProductsWePublishedTo: published,
  });
}

console.log(
  JSON.stringify(
    {
      readAt: new Date().toISOString(),
      shopsWithContent: shops.length,
      shopsUnreachable: totalUnreachable,
      // THE TWO NUMBERS. The first is credits spent on archived products; the
      // second is the subset where we also wrote to the merchant's store.
      archivedProductsWeGeneratedFor: totalArchivedWithContent,
      archivedProductsWePublishedTo: totalPublishedToArchived,
      perShop,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
