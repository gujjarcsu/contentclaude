// TEST-STORE ONLY, manual, never CI. Moves a dev shop's monthly credit usage to
// a target by inserting / deleting synthetic UsageRecord rows, so the quota
// surfaces can be photographed without spending real generations. Refuses to
// touch anything that is not a recognised test store.
//
//   fly ssh console -a contentclaude -C "sh -c 'SEED_SHOP=navaal-qa-fresh.myshopify.com node /app/scripts/test-seed-usage--writes-test-store-only.mjs'"
//   ... SEED_TARGET=85 ...        the 80–100% warning state (H5)
//   ... SEED_TARGET=100 ...       the 100% card (H6); omit SEED_TARGET for the cap
//   ... SEED_ACTION=restore ...   removes the synthetic rows again
//
// ── Phase 14 item 3: THREE DEFECTS THAT MADE THIS SEED THE WRONG NUMBER ──────
//
//  1. It read `plan.monthlyLimit`. B2 renamed that field to `monthlyCredits` on
//     the Prisma client (schema.prisma keeps the old DB column name via @map, so
//     nothing errored). `plan.monthlyLimit` was therefore `undefined`, the
//     `?? 25` default took over, and a Free store on 100 credits was seeded to
//     25 — a store that looks two-thirds empty while claiming to be at its cap.
//     The guard that should have caught this (`lockedPricing.test.js`, "nothing
//     anywhere still says monthlyLimit") only walked `app/`; it walks `scripts/`
//     now too.
//
//  2. It COUNTED ROWS. `plans.server.js` SUMS the `credits` column — a blog post
//     is 3 credits in one row, alt text is 0 — so on any store with real usage
//     the two numbers disagree and the seed overshoots by the difference.
//
//  3. It had no partial target, so it could only produce 100%. H5 needs the
//     80–100% warning (`UpgradePrompt.jsx` surface (a)) BEFORE the 100% card,
//     and there was no supported way to reach it.
//
// The refusal regex is unchanged and stays: `askebs.myshopify.com` can never
// match it, by design.
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

/** What the app itself counts as spent: the SUM of the credits column. */
async function spentCredits() {
  const agg = await p.usageRecord.aggregate({ where: { shop, month }, _sum: { credits: true } });
  return agg?._sum?.credits ?? 0;
}

if (action === "restore") {
  const r = await p.usageRecord.deleteMany({ where: { shop, month, contentType: MARKER } });
  console.log(JSON.stringify({ shop, month, removed: r.count, spentAfter: await spentCredits() }));
} else {
  const plan = await p.plan.findUnique({ where: { shop } });
  // monthlyCredits, not monthlyLimit. No `?? 25`: a missing plan row is a
  // reason to stop, not a reason to invent a smaller cap and seed the wrong
  // screen — which is exactly what the old default did on every run.
  const cap = plan?.monthlyCredits;
  if (!Number.isFinite(cap) || cap <= 0) {
    console.error("Refusing: no plan row (or no credit cap) for", shop, "— install the app on it first.");
    await p.$disconnect();
    process.exit(3);
  }

  const raw = process.env.SEED_TARGET;
  const target = raw === undefined || raw === "" ? cap : Number(raw);
  if (!Number.isFinite(target) || target < 0) {
    console.error("Refusing: SEED_TARGET must be a number of credits, got:", raw);
    await p.$disconnect();
    process.exit(4);
  }
  if (target > cap) {
    console.error(`Refusing: SEED_TARGET ${target} is above this shop's cap of ${cap}.`);
    await p.$disconnect();
    process.exit(5);
  }

  const before = await spentCredits();
  const need = Math.max(0, Math.round(target) - before);
  if (need > 0) {
    // credits defaults to 1 per row in the schema, and that is stated here
    // rather than relied on silently: one row per credit.
    await p.usageRecord.createMany({
      data: Array.from({ length: need }, () => ({ shop, month, contentType: MARKER, productId: null, tokensUsed: 0, credits: 1 })),
    });
  }
  const after = await spentCredits();
  const pct = Math.round((after / cap) * 100);
  console.log(
    JSON.stringify({
      shop,
      month,
      cap,
      target: Math.round(target),
      spentBefore: before,
      seeded: need,
      spentAfter: after,
      pct,
      // What the merchant should now see, so the recording can be checked
      // against it rather than against a guess.
      expect: after >= cap ? "100% card" : pct >= 80 ? "80–100% warning banner" : "no quota surface",
      note: need === 0 && target > before ? "already at or above the target — nothing seeded" : undefined,
    }),
  );
}
await p.$disconnect();
