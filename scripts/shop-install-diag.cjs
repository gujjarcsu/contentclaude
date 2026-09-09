// READ-ONLY: print the Shop (install-attribution) records. No writes.
// Run on the Fly machine (it has DATABASE_URL + the generated Prisma client):
//   fly ssh sftp shell -a contentclaude   ->  put scripts/shop-install-diag.cjs /app/shop-install-diag.cjs
//   fly ssh console -a contentclaude -C "node /app/shop-install-diag.cjs"
// Optional: DIAG_SHOP=<domain> to print one shop; DIAG_LIMIT=<n> (default 20).
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const shop = process.env.DIAG_SHOP;
  const take = Number(process.env.DIAG_LIMIT || 20);
  const rows = shop
    ? [await p.shop.findUnique({ where: { shop } })]
    : await p.shop.findMany({ orderBy: { createdAt: "desc" }, take });
  const total = await p.shop.count();
  const bySource = await p.shop.groupBy({ by: ["installSource"], _count: { _all: true } });
  console.log(JSON.stringify({
    total,
    bySource: Object.fromEntries(bySource.map((r) => [r.installSource, r._count._all])),
    rows: rows.filter(Boolean).map((r) => ({
      shop: r.shop, installedAt: r.installedAt, installSource: r.installSource,
      surfaceType: r.surfaceType, surfaceDetail: r.surfaceDetail,
      surfaceIntraPosition: r.surfaceIntraPosition, surfaceInterPosition: r.surfaceInterPosition,
      installRef: r.installRef, utmSource: r.utmSource, installReferer: r.installReferer,
      installLandingPath: r.installLandingPath, installCount: r.installCount,
      reinstalledAt: r.reinstalledAt, uninstalledAt: r.uninstalledAt, redactedAt: r.redactedAt,
    })),
  }, null, 2));
  await p.$disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
