// READ-ONLY: list a shop's ACTIVE products with description length / SEO gaps
// through the shop's own offline token (no writes). Run on the Fly machine:
//   fly ssh console -a contentclaude -C "sh -c 'DIAG_SHOP=navaal-qa-fresh.myshopify.com node /app/scripts/store-products-diag.cjs'"
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const shop = process.env.DIAG_SHOP || "navaal-qa-fresh.myshopify.com";
  const sess = await p.session.findFirst({ where: { shop, isOnline: false } });
  if (!sess?.accessToken) { console.log(JSON.stringify({ shop, error: "no offline session" })); process.exit(0); }
  const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": sess.accessToken },
    body: JSON.stringify({ query: `{ productsCount { count } products(first: 50, sortKey: UPDATED_AT, reverse: true) { edges { node { id title status description(truncateAt: 80) seo { title description } featuredMedia { preview { image { url } } } } } } }` }),
  });
  const body = await res.json();
  const nodes = (body?.data?.products?.edges ?? []).map((e) => e.node);
  const rows = await p.generatedContent.findMany({ where: { shop }, select: { productId: true, contentType: true, status: true } });
  console.log(JSON.stringify({
    shop,
    httpStatus: res.status,
    productsCount: body?.data?.productsCount?.count ?? null,
    aiRows: rows.length,
    products: nodes.map((n) => ({
      id: n.id.split("/").pop(), title: n.title, status: n.status,
      descLen: (n.description || "").trim().length, seoTitle: !!n.seo?.title, seoDesc: !!n.seo?.description, image: !!n.featuredMedia?.preview?.image?.url,
    })),
    errors: body?.errors ?? null,
  }, null, 2));
  await p.$disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
