#!/usr/bin/env node
/**
 * FR8 (Phase 10) — what does each product on a dev store ACTUALLY score?
 *
 * CW read "This product: 21/100" on every first-run row of navaal-qa-fresh and
 * 21 is also that store's score. Either the row shows the store score (a
 * false claim) or every product genuinely scores 21 (a uniform catalogue).
 * This prints the truth: the same scan the first run uses, scored per
 * product with the same scorer, as numbers only — index, GEO, SEO, combined,
 * and how many DISTINCT combined scores there are. No titles, no handles.
 *
 * READS ONLY: one Admin GraphQL query through the stored offline token.
 * Refuses any shop that is not one of our dev stores by name pattern.
 *
 *   SHOP=navaal-qa-fresh.myshopify.com node /app/scripts/first-run-scores-diag.mjs
 */
import prisma from "../app/db.server.js";
import { getFreshOfflineSession } from "../app/utils/offlineToken.server.js";
import { offlineGraphql } from "../app/utils/catalogueWatch.server.js";
import { scanStoreForStart, pickWeakest, START_TARGETS } from "../app/utils/startState.server.js";

const shop = String(process.env.SHOP ?? "").trim().toLowerCase();
const DEV_PATTERN = /^(navaal-ttv-\d+|navaal-qa-[a-z0-9-]+|navaal-shape-[a-z0-9-]+|contentpilot-dev\d*)\.myshopify\.com$/;
const out = { at: new Date().toISOString() };
if (!DEV_PATTERN.test(shop)) {
  out.verdict = "REFUSED — SHOP is not one of our dev stores by name pattern. Nothing read.";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(2);
}
const session = await getFreshOfflineSession(shop).catch(() => null);
if (!session?.accessToken) {
  out.verdict = "No offline session for that shop.";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}
const admin = { graphql: offlineGraphql(session) };
const scan = await scanStoreForStart(admin, shop, { skipCache: true });
if (scan.error || scan.empty) {
  out.verdict = scan.empty ? "The store has no products in scope." : "The scan failed.";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}
out.storeScore = scan.storeScore;
out.storeGeo = scan.storeGeo;
out.storeSeo = scan.storeSeo;
out.scanned = scan.totalScanned;
out.perProduct = scan.scored.map((p, i) => ({ i: i + 1, geo: p.scores.geo, seo: p.scores.seo, combined: p.scores.combined, descChars: String(p.description ?? "").length, hasImage: !!p.imageUrl, tags: (p.tags ?? []).length }));
const distinct = [...new Set(out.perProduct.map((p) => p.combined))].sort((a, b) => a - b);
out.distinctCombinedScores = distinct;
out.targets = pickWeakest(scan.scored, START_TARGETS).map((p) => p.scores.combined);
out.verdict =
  distinct.length === 1
    ? `Every one of the ${out.scanned} scanned products scores ${distinct[0]} — the row number equals the store score because the catalogue is uniform, not because the row shows the store score. The three first-run targets would read ${out.targets.join(", ")}.`
    : `${distinct.length} distinct product scores (${distinct.join(", ")}) across ${out.scanned} products; store score ${out.storeScore}. The three first-run targets would read ${out.targets.join(", ")}.`;
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(0);
