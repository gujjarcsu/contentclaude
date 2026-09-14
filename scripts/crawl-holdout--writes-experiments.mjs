#!/usr/bin/env node
/**
 * P3.1 (Phase 8) — run the crawl-time holdout's daily pass now and print what
 * it did. The same function the 03:00 Sydney job calls, so a green run here is
 * evidence about the job.
 *
 * WRITES: CrawlExperiment / CrawlExperimentUrl rows, and URL submissions to
 * Bing — ONLY for shops whose merchant switched measurement on, never a
 * locked shop, and nothing at all while REMEDIATION_LOCKED_SHOPS is unset.
 * Counts only: no shop domain, no URL.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/crawl-holdout--writes-experiments.mjs"
 */
import prisma from "../app/db.server.js";
import { runCrawlHoldoutForAllShops } from "../app/utils/crawlHoldout.server.js";
import { lockConfigured } from "../app/utils/remediation.server.js";

const t0 = Date.now();
const out = { at: new Date().toISOString(), lockConfigured: lockConfigured() };
out.run = await runCrawlHoldoutForAllShops({ now: new Date() });
out.experiments = {
  running: await prisma.crawlExperiment.count({ where: { status: "running" } }),
  reported: await prisma.crawlExperiment.count({ where: { status: "reported" } }),
  urls: await prisma.crawlExperimentUrl.count(),
  crawled: await prisma.crawlExperimentUrl.count({ where: { firstCrawledAt: { not: null } } }),
};
out.shopsEnabled = await prisma.shop.count({ where: { bingEnabledAt: { not: null }, uninstalledAt: null } });
out.shopsWithProvedResult = await prisma.shop.count({ where: { provedResultAt: { not: null } } });
out.ms = Date.now() - t0;
out.verdict = out.run.lockUnset
  ? "NOTHING RAN — REMEDIATION_LOCKED_SHOPS is unset, so nothing is submitted anywhere. Set it (from a file) and re-run."
  : out.shopsEnabled === 0
    ? "Nothing to do — no shop has switched Bing measurement on yet."
    : `Walked ${out.run.shops} enabled shop(s): ${out.run.started} batch(es) started, ${out.run.checked} checked, ${out.run.reported} reported, ${out.run.skipped} skipped. ${out.experiments.crawled} of ${out.experiments.urls} URLs crawled so far.`;

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(0);
