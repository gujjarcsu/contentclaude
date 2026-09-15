#!/usr/bin/env node
/**
 * Phase 11 Part B — classify shops: ours / shopify / real / unclassified.
 *
 * WRITES Shop.kind for the domains named in KINDS, and nothing else. With no
 * KINDS it only LISTS every non-redacted shop with its stored and effective
 * kind, which is how the seed from the ledger is composed.
 *
 *   KINDS="a.myshopify.com=real b.myshopify.com=shopify" node /app/scripts/shop-kind--writes-classification.mjs
 *   node /app/scripts/shop-kind--writes-classification.mjs            # list only
 *
 * Refuses: anything that is not a myshopify domain, a kind outside the four,
 * and "real" on one of our own handles. A refusal writes nothing for that
 * entry; the others still apply. Prints domains (our own database, a private
 * job summary) and never a token or a name.
 */
import prisma from "../app/db.server.js";
import { parseKindAssignments, kindOf, SHOP_KINDS } from "../app/utils/shopKind.js";

const out = { at: new Date().toISOString(), kinds: SHOP_KINDS };
const text = String(process.env.KINDS ?? "").trim();

try {
  if (text) {
    const { assignments, refused } = parseKindAssignments(text);
    out.refused = refused;
    out.written = [];
    for (const { shop, kind } of assignments) {
      const before = await prisma.shop.findUnique({ where: { shop }, select: { kind: true } });
      if (!before) {
        out.refused.push({ input: `${shop}=${kind}`, reason: "no Shop row with that domain" });
        continue;
      }
      const r = await prisma.shop.updateMany({ where: { shop }, data: { kind } });
      out.written.push({ shop, before: before.kind, after: kind, matched: r.count });
    }
  }
  const rows = await prisma.shop.findMany({
    where: { redactedAt: null },
    select: { shop: true, kind: true, installedAt: true, uninstalledAt: true, reinstalledAt: true, installCount: true },
    orderBy: { installedAt: "asc" },
  });
  out.shops = rows.map((r) => ({
    shop: r.shop,
    stored: r.kind,
    effective: kindOf(r),
    installed: !r.uninstalledAt,
    installedAt: r.installedAt?.toISOString() ?? null,
    reinstalledAt: r.reinstalledAt?.toISOString() ?? null,
    uninstalledAt: r.uninstalledAt?.toISOString() ?? null,
    installCount: r.installCount,
  }));
  out.tally = out.shops.reduce((t, s) => ((t[s.effective] = (t[s.effective] ?? 0) + 1), t), {});
  out.verdict = out.written ? `${out.written.length} written, ${out.refused.length} refused` : "list only, nothing written";
  console.log(JSON.stringify(out, null, 2));
} finally {
  await prisma.$disconnect();
}
