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
import { summarise, parseFindings } from "../app/utils/catalogueWatch.js";

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
// F4 (Phase 9) — per shop, with that shop's first-walk grace, then summed:
// the old single summarise() read "everything is new" on every shop's day one.
const firstWalks = await prisma.productWatch.groupBy({ by: ["shop"], _min: { firstSeenAt: true } });
const firstWalkAt = new Map(firstWalks.map((f) => [f.shop, f._min.firstSeenAt]));
out.acrossShops = { needAttention: 0, sinceYesterday: 0, byKind: {} };
for (const [shopKey, shopRows] of perShop) {
  const s = summarise(shopRows, new Date(), { firstWalkAt: firstWalkAt.get(shopKey) ?? null });
  out.acrossShops.needAttention += s.needAttention;
  out.acrossShops.sinceYesterday += s.sinceYesterday;
  for (const [k, n] of Object.entries(s.byKind)) out.acrossShops.byKind[k] = (out.acrossShops.byKind[k] ?? 0) + n;
}
out.shopsWithAttention = perShop.size;
out.productsWatched = await prisma.productWatch.count();

// P2.2 — grading, as counts. P2.1 — crawler access, as counts of shops.
out.eligibility = {
  graded: await prisma.productWatch.count({ where: { grade: { not: null } } }),
  productsWithBlocking: await prisma.productWatch.count({ where: { blocking: { gt: 0 } } }),
  productsWithDegrading: await prisma.productWatch.count({ where: { degrading: { gt: 0 } } }),
  cosmeticOnly: await prisma.productWatch.count({ where: { blocking: 0, degrading: 0, cosmetic: { gt: 0 } } }),
};
// Which field, on which surface, across every graded product — the first read
// on what real catalogues actually lack. Aggregated; no shop, no product.
const graded = await prisma.productWatch.findMany({ where: { grade: { not: null } }, select: { grade: true } });
const byField = {};
for (const g of graded) {
  for (const f of parseFindings(g.grade)) {
    const key = `${f.surface ?? "shopify"}·${f.field}·${f.grade}`;
    byField[key] = (byField[key] ?? 0) + 1;
  }
}
out.eligibility.byField = Object.fromEntries(Object.entries(byField).sort((a, b) => b[1] - a[1]));

// P2.4 — indexability, as counts. Null is "not checked", so it is counted as such.
out.indexability = {
  sitemapKnown: await prisma.productWatch.count({ where: { inSitemap: { not: null } } }),
  notInSitemap: await prisma.productWatch.count({ where: { inSitemap: false } }),
  pagesChecked: await prisma.productWatch.count({ where: { pageCheckedAt: { not: null } } }),
  noindex: await prisma.productWatch.count({ where: { noindex: true } }),
  missing: await prisma.productWatch.count({ where: { pageStatus: { in: [404, 410] } } }),
  chains: await prisma.productWatch.count({ where: { pageHops: { gte: 2 } } }),
  gtinExempt: await prisma.productWatch.count({ where: { gtinExempt: true } }),
};

const crawlerRows = await prisma.crawlerAccess.findMany({
  where: { checkedAt: { gte: new Date(t0 - 60_000) } },
  select: { blocked: true, robotsSeen: true, results: true },
});
const locked = (r) => {
  try {
    return JSON.parse(r.results)?._storefront?.passwordProtected === true;
  } catch {
    return false;
  }
};
out.crawler = {
  shopsChecked: crawlerRows.length,
  shopsWithABlockedAgent: crawlerRows.filter((r) => r.blocked > 0).length,
  shopsWithRobotsTxt: crawlerRows.filter((r) => r.robotsSeen).length,
  shopsPasswordProtected: crawlerRows.filter(locked).length,
};
out.ms = Date.now() - t0;

out.verdict =
  out.run.walked === 0
    ? "NO SHOP WAS WALKED — every installed shop was skipped or failed. The mechanism is unproven."
    : `Walked ${out.run.walked} shop(s) (${out.run.partial} partial, ${out.run.skipped} skipped, ${out.run.failed} failed). ` +
      `${out.productsWatched} products under watch; ${out.acrossShops.needAttention} need attention across ${out.shopsWithAttention} shop(s). ` +
      `${out.eligibility.graded} graded: ${out.eligibility.productsWithBlocking} with a blocking gap, ${out.eligibility.productsWithDegrading} degrading. ` +
      `Crawlers checked on ${out.crawler.shopsChecked} shop(s); ${out.crawler.shopsWithABlockedAgent} block at least one; ` +
      `${out.crawler.shopsPasswordProtected} password-protected.`;

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(out.run.walked > 0 ? 0 : 1);
