#!/usr/bin/env node
/**
 * P2.3 — run the catalogue watch now, for every installed shop, and print what
 * it found. This is how the subscription is PROVED on production before the
 * 02:00 Sydney hour comes round, and how it is re-run on demand afterwards.
 *
 * It does exactly what the daily job does — the same function — so a green
 * run here is evidence about the job, not about a test double.
 *
 * WRITES: ProductWatch rows (snapshots and attention) for every shop it can
 * reach. Nothing in Shopify. Nothing a merchant sees except, later, a truer
 * number on Home.
 *
 * PRIVACY: counts and kinds only. No shop domain, no handle, no product title.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/catalogue-watch--writes-snapshots.mjs"
 */
import prisma from "../app/db.server.js";
import { runCatalogueWatchForAllShops } from "../app/utils/catalogueWatch.server.js";
import { summarise } from "../app/utils/catalogueWatch.js";

const t0 = Date.now();
const out = { readAt: new Date().toISOString() };

out.run = await runCatalogueWatchForAllShops({ now: new Date() });

// The number every shop would see on Home right now, aggregated — and by kind,
// which is the first read on what actually decays in real catalogues.
const rows = await prisma.productWatch.findMany({
  where: { NOT: { attention: "{}" } },
  select: { shop: true, attention: true },
});
const perShop = new Map();
for (const r of rows) {
  if (!perShop.has(r.shop)) perShop.set(r.shop, []);
  perShop.get(r.shop).push(r);
}
out.acrossShops = summarise(rows);
out.shopsWithAttention = perShop.size;
out.productsWatched = await prisma.productWatch.count();

// P2.2 — grading, as counts. P2.1 — crawler access, as counts of shops.
out.eligibility = {
  graded: await prisma.productWatch.count({ where: { grade: { not: null } } }),
  productsWithBlocking: await prisma.productWatch.count({ where: { blocking: { gt: 0 } } }),
  productsWithDegrading: await prisma.productWatch.count({ where: { degrading: { gt: 0 } } }),
  cosmeticOnly: await prisma.productWatch.count({ where: { blocking: 0, degrading: 0, cosmetic: { gt: 0 } } }),
};
const crawlerRows = await prisma.crawlerAccess.findMany({
  where: { checkedAt: { gte: new Date(t0 - 60_000) } },
  select: { blocked: true, robotsSeen: true },
});
out.crawler = {
  shopsChecked: crawlerRows.length,
  shopsWithABlockedAgent: crawlerRows.filter((r) => r.blocked > 0).length,
  shopsWithRobotsTxt: crawlerRows.filter((r) => r.robotsSeen).length,
};
out.ms = Date.now() - t0;

out.verdict =
  out.run.walked === 0
    ? "NO SHOP WAS WALKED — every installed shop was skipped or failed. The mechanism is unproven."
    : `Walked ${out.run.walked} shop(s) (${out.run.partial} partial, ${out.run.skipped} skipped, ${out.run.failed} failed). ` +
      `${out.productsWatched} products under watch; ${out.acrossShops.needAttention} need attention across ${out.shopsWithAttention} shop(s). ` +
      `${out.eligibility.graded} graded: ${out.eligibility.productsWithBlocking} with a blocking gap, ${out.eligibility.productsWithDegrading} degrading. ` +
      `Crawlers checked on ${out.crawler.shopsChecked} shop(s); ${out.crawler.shopsWithABlockedAgent} block at least one.`;

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(out.run.walked > 0 ? 0 : 1);
