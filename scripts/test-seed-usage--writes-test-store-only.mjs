// TEST-STORE ONLY, manual, never CI. Exhausts (or restores) a dev shop's monthly
// quota by inserting / deleting synthetic UsageRecord rows, so the
// quota-exhausted upgrade prompts (brief item 5a) can be photographed without
// spending 25 real generations. Refuses to touch anything that is not a
// recognised test store. Run on the Fly machine:
//
//   fly ssh console -a contentclaude -C "sh -c 'SEED_SHOP=navaal-qa-fresh.myshopify.com node /app/scripts/test-seed-usage--writes-test-store-only.mjs'"
//   ... SEED_ACTION=restore ...   removes the synthetic rows again
import { PrismaClient } from "@prisma/client";

const shop = process.env.SEED_SHOP || "";
const action = process.env.SEED_ACTION || "exhaust";
if (!/(contentpilot-dev|navaal-qa|navaal-test)/.test(shop)) {
  console.error("Refusing: SEED_SHOP is not a recognised test store:", shop);
  process.exit(2);
}
const p = new PrismaClient();
const month = new Date().toISOString().slice(0, 7);
const MARKER = "test-seed-usage";

if (action === "restore") {
  const r = await p.usageRecord.deleteMany({ where: { shop, month, contentType: MARKER } });
  console.log(JSON.stringify({ shop, month, removed: r.count }));
} else {
  const plan = await p.plan.findUnique({ where: { shop } });
  const limit = plan?.monthlyLimit ?? 25;
  const used = await p.usageRecord.count({ where: { shop, month } });
  const need = Math.max(0, limit - used);
  if (need > 0) {
    await p.usageRecord.createMany({ data: Array.from({ length: need }, () => ({ shop, month, contentType: MARKER, productId: null, tokensUsed: 0 })) });
  }
  console.log(JSON.stringify({ shop, month, limit, usedBefore: used, seeded: need, usedAfter: used + need }));
}
await p.$disconnect();
