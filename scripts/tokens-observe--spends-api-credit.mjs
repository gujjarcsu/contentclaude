#!/usr/bin/env node
/**
 * C2 — observe `UsageRecord.tokensUsed` NON-ZERO in production.
 *
 * The write path was proved by test in 5bd4fb8, including that it can never fail
 * a generation. It has never been observed non-zero on a real row. A write path
 * proved only by its own test is false green #4 in 07-VERIFICATION.md — "a test
 * suite passing over code that never actually executes" — and this project has
 * been burned by that shape seven times.
 *
 * It matters more than it looks: if this is broken in production then every cost
 * figure in 08-ECONOMICS.md §2, and therefore the entire locked pricing table
 * built on $0.0115 per credit, becomes unverifiable.
 *
 * WHAT IT DOES. One real generation through the REAL gate —
 * withGenerationCredit → the AsyncLocalStorage context → ai.server.js →
 * recordTokensUsed — then reads the row straight back from the database and
 * prints the integer.
 *
 * WHAT IT TOUCHES:
 *   - the Anthropic API (spends a few cents)
 *   - ONE UsageRecord row on the shop you name (consumes one credit)
 *   - NOTHING in Shopify. It never opens an admin client, so it cannot write to
 *     a product, and it must never be pointed at a live commercial catalogue.
 *
 * Usage:
 *   node scripts/tokens-observe--spends-api-credit.mjs <shop-domain>
 */
import prisma from "../app/db.server.js";
import { withGenerationCredit } from "../app/utils/plans.server.js";
import { generateProductContent } from "../app/utils/ai.server.js";

const shop = process.argv[2];
if (!shop) {
  console.error("usage: node scripts/tokens-observe--spends-api-credit.mjs <shop-domain>");
  process.exit(2);
}
if (!/\.myshopify\.com$/.test(shop)) {
  console.error(`refusing "${shop}" — expected a <store>.myshopify.com domain`);
  process.exit(2);
}

// A fixture, not a real product: this script never reads or writes Shopify.
const PRODUCT = {
  title: "Merino Wool Crew Neck Sweater",
  description: "<p>A crew neck sweater knitted from extra-fine merino wool.</p>",
  productType: "Sweaters",
  vendor: "Northfield Knitwear",
  tags: ["merino"],
  price: "89.00",
};
const BRAND_VOICE = { storeName: "Northfield Knitwear", brandTone: "plain-spoken", language: "en" };

const productId = `gid://shopify/Product/c2-observe-${Date.now()}`;

const before = new Date();
const outcome = await withGenerationCredit(
  shop,
  { contentType: "description", productId },
  async () => generateProductContent(PRODUCT, BRAND_VOICE, ["description"], { interactive: false }),
);

if (!outcome.allowed) {
  console.log(JSON.stringify({ shop, observed: false, reason: "quota gate refused", gate: outcome.gate }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}

// Read the row BACK from the database rather than trusting the return value.
const row = await prisma.usageRecord.findFirst({
  where: { shop, productId },
  select: { id: true, contentType: true, credits: true, tokensUsed: true, createdAt: true },
});

const verdict =
  !row
    ? "NO ROW — the gate said allowed but nothing was written"
    : row.tokensUsed > 0
      ? `OBSERVED: tokensUsed = ${row.tokensUsed}`
      : "STILL ZERO — the write path is broken in production regardless of the tests (P0)";

console.log(
  JSON.stringify(
    {
      shop,
      startedAt: before.toISOString(),
      refunded: !!outcome.refunded,
      row,
      // THE INTEGER C2 IS ABOUT.
      tokensUsed: row?.tokensUsed ?? null,
      credits: row?.credits ?? null,
      verdict,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
process.exit(row && row.tokensUsed > 0 ? 0 : 1);
