#!/usr/bin/env node
/**
 * One-time migration: mark pre-fix alt-text rows as failed.
 *
 * Rows written before the P0-1 fix used the removed `productImageUpdate`
 * mutation — nothing ever reached Shopify — but were stored success-shaped
 * with status "published". Detect them by their legacy ProductImage GIDs
 * (post-fix rows use MediaImage GIDs), annotate every entry with an error,
 * and downgrade the row to "draft" so no surface can claim success for them.
 *
 * ALL SHOPS. Dry-run by default; pass --apply to write.
 *
 *   node scripts/fix-legacy-alttext-rows.mjs          # dry-run
 *   node scripts/fix-legacy-alttext-rows.mjs --apply  # perform
 */
import { PrismaClient } from "@prisma/client";
import {
  LEGACY_ALT_ENTRY_MARKER,
  normalizeAltTextResults,
} from "../app/utils/altText.js";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const rows = await prisma.generatedContent.findMany({
  where: { contentType: "altText", generatedContent: { contains: LEGACY_ALT_ENTRY_MARKER } },
  select: { id: true, shop: true, productId: true, status: true, generatedContent: true },
});

console.log(`${APPLY ? "APPLY" : "DRY-RUN"}: ${rows.length} legacy alt-text row(s) found across all shops`);

let updated = 0;
for (const row of rows) {
  let parsed;
  try {
    parsed = JSON.parse(row.generatedContent);
  } catch {
    console.log(`  SKIP (unparseable payload): ${row.shop} ${row.productId}`);
    continue;
  }
  const normalized = normalizeAltTextResults(parsed);
  console.log(`  ${row.shop} ${row.productId}: status ${row.status} -> draft, ${normalized.filter((r) => r.error).length}/${normalized.length} entries marked failed`);
  if (APPLY) {
    await prisma.generatedContent.update({
      where: { id: row.id },
      data: { generatedContent: JSON.stringify(normalized), status: "draft" },
    });
    updated++;
  }
}

console.log(APPLY ? `Done — ${updated} row(s) updated.` : "Dry-run only — re-run with --apply to write.");
await prisma.$disconnect();
