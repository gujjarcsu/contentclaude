// Backfill: FAQ schema metafields (contentclaude/faq_schema)
// ----------------------------------------------------------
// Repairs the "silent success" data drift (Bug 2): GeneratedContent rows with
// contentType="faq" and status="published" whose live Shopify metafield is
// actually missing/empty. The fix that checks userErrors is already deployed;
// this repairs the EXISTING rows across EVERY shop in the database.
//
// - Reuses the app's own helpers: getFreshOfflineSession (token refresh) and
//   buildFaqSchemaMetafield, plus the exact metafieldsSet mutation + userErrors
//   check from bulkProcessor.setFaqMetafield. No new AI generation (the FAQ text
//   is already stored) — zero Anthropic cost.
// - Idempotent: re-checks the live metafield each run; already-present rows are
//   skipped, repaired rows become present (skipped next time), downgraded rows
//   drop to status="draft" and are no longer matched. Safe to stop and resume.
// - Throttled (BULK_THROTTLE_MS, default 2s) between products, with 429/THROTTLED
//   backoff, so back-to-back shops don't trip Shopify rate limits.
//
// Usage:
//   node scripts/backfill-faq-metafields.mjs                 # DRY RUN (default) — no writes
//   node scripts/backfill-faq-metafields.mjs --apply         # perform repairs/downgrades
//   node scripts/backfill-faq-metafields.mjs --apply --shop foo.myshopify.com
//
// Env required (same as the app): DATABASE_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET.

import prisma from "../app/db.server.js";
import { getFreshOfflineSession } from "../app/utils/offlineToken.server.js";
import { buildFaqSchemaMetafield } from "../app/utils/seo.server.js";

const API_VERSION = "2026-04";
const THROTTLE_MS = parseInt(process.env.BULK_THROTTLE_MS || "2000", 10);
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

const APPLY = process.argv.includes("--apply");
const shopFlagIdx = process.argv.indexOf("--shop");
const ONLY_SHOP = shopFlagIdx > -1 ? process.argv[shopFlagIdx + 1] : null;

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
  if (res.status === 429) {
    if (attempt >= MAX_RETRIES) throw new Error("Shopify 429 after max retries");
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    await sleep(Math.max(retryAfter * 1000, BACKOFF_BASE_MS * 2 ** attempt));
    return shopGraphql(session, query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  const body = await res.json();
  if (body?.errors?.[0]?.extensions?.code === "THROTTLED") {
    if (attempt >= MAX_RETRIES) throw new Error("Shopify GraphQL throttled after max retries");
    await sleep(BACKOFF_BASE_MS * 2 ** (attempt + 1));
    return shopGraphql(session, query, variables, attempt + 1);
  }
  if (body?.errors?.length) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data;
}

// Returns the live metafield value (string) or null if the product/metafield is missing/empty.
async function readFaqMetafield(session, productId) {
  const data = await shopGraphql(
    session,
    `query ($id: ID!) { product(id: $id) { id metafield(namespace: "contentclaude", key: "faq_schema") { value } } }`,
    { id: productId },
  );
  if (!data?.product) return { productMissing: true, value: null };
  const value = data.product.metafield?.value;
  return { productMissing: false, value: value && value.trim() ? value : null };
}

// Write via the SAME mutation + userErrors check as bulkProcessor.setFaqMetafield.
async function writeFaqMetafield(session, metafield) {
  const data = await shopGraphql(
    session,
    `mutation ($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
    }`,
    { metafields: [metafield] },
  );
  const userErrors = data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `metafieldsSet rejected: ${userErrors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join("; ")}`,
    );
  }
}

async function main() {
  console.log(`\n=== FAQ metafield backfill — ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"} ===`);
  console.log(`throttle=${THROTTLE_MS}ms  ${ONLY_SHOP ? `shop=${ONLY_SHOP}` : "all shops"}\n`);

  const grouped = await prisma.generatedContent.groupBy({
    by: ["shop"],
    where: { contentType: "faq", status: "published", ...(ONLY_SHOP ? { shop: ONLY_SHOP } : {}) },
    _count: { shop: true },
  });

  const report = [];
  for (const g of grouped) {
    const shop = g.shop;
    const c = { shop, faqPublishedRows: g._count.shop, checked: 0, alreadyOk: 0, repaired: 0, downgraded: 0, needsAttention: [] };

    const session = await getFreshOfflineSession(shop);
    if (!session?.accessToken) {
      c.error = "no offline session/token — shop may have uninstalled; skipped";
      report.push(c);
      console.log(`- ${shop}: SKIP (${c.error})`);
      continue;
    }

    const rows = await prisma.generatedContent.findMany({
      where: { shop, contentType: "faq", status: "published" },
      select: { id: true, productId: true, productTitle: true, generatedContent: true },
    });

    for (const row of rows) {
      c.checked++;
      const expected = buildFaqSchemaMetafield(row.productId, row.generatedContent);
      try {
        const live = await readFaqMetafield(session, row.productId);

        if (!expected) {
          // Stored FAQ yields no usable schema — "published" is not truthful.
          if (APPLY) {
            await prisma.generatedContent.update({ where: { id: row.id }, data: { status: "draft" } });
            c.downgraded++;
          }
          c.needsAttention.push({ productId: row.productId, title: row.productTitle, reason: "stored FAQ produces no schema" });
        } else if (live.value) {
          c.alreadyOk++; // metafield already present — idempotent skip
        } else if (APPLY) {
          try {
            await writeFaqMetafield(session, expected);
            const verify = await readFaqMetafield(session, row.productId); // confirm it landed
            if (verify.value) c.repaired++;
            else throw new Error("write reported success but metafield still empty on re-read");
          } catch (writeErr) {
            await prisma.generatedContent.update({ where: { id: row.id }, data: { status: "draft" } });
            c.downgraded++;
            c.needsAttention.push({ productId: row.productId, title: row.productTitle, reason: writeErr.message });
          }
        } else {
          // dry-run: would repair
          c.needsAttention.push({
            productId: row.productId,
            title: row.productTitle,
            reason: live.productMissing ? "product not found on Shopify (would downgrade)" : "metafield missing (would repair)",
          });
        }
      } catch (readErr) {
        c.needsAttention.push({ productId: row.productId, title: row.productTitle, reason: `check failed: ${readErr.message}` });
      }
      await sleep(THROTTLE_MS);
    }

    report.push(c);
    console.log(
      `- ${shop}: ${c.checked} checked · ${c.alreadyOk} already-ok · ` +
        `${APPLY ? `${c.repaired} repaired · ${c.downgraded} downgraded` : `${c.needsAttention.length} would-act`} `,
    );
  }

  console.log("\n=== JSON report ===");
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", generatedAt: new Date().toISOString(), shops: report }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await prisma.$disconnect();
  process.exit(1);
});
