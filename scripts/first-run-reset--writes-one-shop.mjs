#!/usr/bin/env node
/**
 * P2.7 proof tooling — put ONE dev store back on the first-run screen.
 *
 * Home renders the Start state while `Shop.firstDraftSeenAt` is null. There
 * is no other way to see the first run on a store that has already had one,
 * and a screenshot of a mock is not a proof. So this nulls that one column
 * for one named shop, and nothing else.
 *
 * WRITES: Shop.firstDraftSeenAt = null for the named shop — in OUR database.
 * Nothing in Shopify. The next Home load on that store will write up to
 * three drafts through the normal quick-start path (its own credits).
 *
 * REFUSES anything that is not one of our own dev stores by name pattern.
 * The pattern is the guard: a real merchant's store can never match it.
 *
 *   SHOP=navaal-ttv-03.myshopify.com node /app/scripts/first-run-reset--writes-one-shop.mjs
 */
import prisma from "../app/db.server.js";

const shop = String(process.env.SHOP ?? "").trim().toLowerCase();
const DEV_PATTERN = /^(navaal-ttv-\d+|navaal-qa-[a-z0-9-]+|contentpilot-dev\d*)\.myshopify\.com$/;

const out = { at: new Date().toISOString(), shopPattern: DEV_PATTERN.source };
if (!DEV_PATTERN.test(shop)) {
  out.verdict = "REFUSED — SHOP is not one of our dev stores by name pattern. Nothing written.";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(2);
}

const before = await prisma.shop.findUnique({ where: { shop }, select: { firstDraftSeenAt: true, installedAt: true, uninstalledAt: true } });
if (!before || before.uninstalledAt) {
  out.verdict = "REFUSED — shop row missing or uninstalled. Nothing written.";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(2);
}
out.before = { firstDraftSeenAt: before.firstDraftSeenAt?.toISOString() ?? null };
await prisma.shop.update({ where: { shop }, data: { firstDraftSeenAt: null } });
const after = await prisma.shop.findUnique({ where: { shop }, select: { firstDraftSeenAt: true } });
out.after = { firstDraftSeenAt: after?.firstDraftSeenAt?.toISOString() ?? null };
out.verdict = out.after.firstDraftSeenAt === null ? "RESET — the next /app load on this store renders the first run." : "NOT RESET — read back non-null.";
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(out.after.firstDraftSeenAt === null ? 0 : 1);
