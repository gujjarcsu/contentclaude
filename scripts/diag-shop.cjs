// READ-ONLY diagnosis for a shop. No writes. Run on the Fly machine.
// Prints: DB plan, sessions (offline token present?), and Shopify's live
// active subscriptions (with the `test` flag) + partnerDevelopment.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const shop = process.env.DIAG_SHOP || "cpbgzr-pu.myshopify.com";
  const out = { shop };

  const plan = await p.plan.findUnique({ where: { shop } }).catch((e) => ({ error: e.message }));
  out.dbPlan = plan;

  const sessions = await p.session.findMany({
    where: { shop },
    select: { id: true, isOnline: true, expires: true, scope: true, accessToken: true },
  }).catch((e) => [{ error: e.message }]);
  out.sessions = sessions.map((s) => ({
    id: s.id, isOnline: s.isOnline, expires: s.expires, hasToken: !!s.accessToken,
  }));

  const offline = sessions.find((s) => s && s.isOnline === false && s.accessToken);
  if (offline) {
    try {
      const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": offline.accessToken },
        body: JSON.stringify({
          query: `{
            currentAppInstallation {
              activeSubscriptions { id name status test createdAt currentPeriodEnd }
              allSubscriptions: activeSubscriptions { id }
            }
            shop { plan { partnerDevelopment displayName shopifyPlus } }
          }`,
        }),
      });
      out.shopifyStatus = res.status;
      out.shopify = await res.json();
    } catch (e) {
      out.shopifyError = e.message;
    }
  } else {
    out.shopify = "NO OFFLINE TOKEN (shop may be uninstalled)";
  }

  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
  process.exit(0);
})();
