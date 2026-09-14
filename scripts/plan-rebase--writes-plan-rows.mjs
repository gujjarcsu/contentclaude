#!/usr/bin/env node
/**
 * A1 (Phase 8) — re-base every existing Plan row to the locked table, once.
 *
 * Reasoning in app/utils/planRebase.js. Favourable only: a row is raised to
 * the locked credits for its plan name or left alone. Prints, per plan name,
 * how many rows were below the table before and after, and how many are
 * above it (left alone). Counts only — never a shop domain.
 *
 * WRITES: Plan.monthlyCredits for active rows below the table. Nothing else.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/plan-rebase--writes-plan-rows.mjs"
 */
import prisma from "../app/db.server.js";
import { invalidateCache } from "../app/utils/cache.server.js";
import { lockedCreditsFor, rebasePlan } from "../app/utils/planRebase.js";

const PLAN_NAMES = ["free", "starter", "growth", "pro"];
const out = { at: new Date().toISOString(), locked: Object.fromEntries(PLAN_NAMES.map((p) => [p, lockedCreditsFor(p)])) };

const tally = async (label) => {
  const rows = await prisma.plan.findMany({ select: { shop: true, planName: true, status: true, monthlyCredits: true } });
  const t = {};
  for (const p of PLAN_NAMES) {
    const locked = lockedCreditsFor(p);
    const mine = rows.filter((r) => r.planName === p);
    t[p] = {
      rows: mine.length,
      active: mine.filter((r) => r.status === "active").length,
      belowTable: mine.filter((r) => r.status === "active" && r.monthlyCredits < locked).length,
      atTable: mine.filter((r) => r.monthlyCredits === locked).length,
      aboveTable: mine.filter((r) => r.monthlyCredits > locked).length,
    };
  }
  t.otherPlanNames = rows.filter((r) => !PLAN_NAMES.includes(r.planName)).length;
  out[label] = t;
  return rows;
};

const before = await tally("before");
const plan = rebasePlan(before);
let rebased = 0;
for (const u of plan) {
  // `lt` in the predicate as well as in the plan: a concurrent raise can never
  // be undone by this write, whatever the row said when we read it.
  const r = await prisma.plan.updateMany({ where: { shop: u.shop, status: "active", monthlyCredits: { lt: u.to } }, data: { monthlyCredits: u.to } });
  rebased += r.count;
  try {
    await invalidateCache(`plan:${u.shop}`);
  } catch {
    // the 60 s TTL expires on its own
  }
}
await tally("after");
out.rebased = rebased;
out.plannedRaises = plan.length;
out.lowered = 0; // by construction — see planRebase.js
const stillBelow = Object.values(out.after)
  .filter((v) => typeof v === "object")
  .reduce((n, v) => n + (v.belowTable ?? 0), 0);
out.verdict =
  stillBelow === 0
    ? `Re-based ${rebased} row(s). No active row is below the locked table.`
    : `Re-based ${rebased} row(s) but ${stillBelow} active row(s) are still below the table — read the counts.`;

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(stillBelow === 0 ? 0 : 1);
