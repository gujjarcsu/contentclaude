// READ-ONLY growth report (brief items 3–5). No writes.
//   time to first value (install → first draft / first publish, median over the
//   last 20 MEASURED installs), review-ask attempts by code, upgrade-prompt funnel.
// Run on the Fly machine (DATABASE_URL + generated Prisma client are there):
//   fly ssh console -a contentclaude -C "node /app/scripts/ttv-report.mjs"
// Env: REPORT_COHORT=20  REPORT_DAYS=30  REPORT_FORMAT=json|md
//      REPORT_EXCLUDE_SHOPS=a.myshopify.com,b.myshopify.com  DIAG_SHOP=<domain>
import { PrismaClient } from "@prisma/client";
import { computeTtvReport, DEFAULT_EXCLUDE_SHOPS } from "../app/utils/ttvReport.server.js";

const p = new PrismaClient();
const excludeShops = (process.env.REPORT_EXCLUDE_SHOPS ? process.env.REPORT_EXCLUDE_SHOPS.split(",") : DEFAULT_EXCLUDE_SHOPS).map((s) => s.trim()).filter(Boolean);
const report = await computeTtvReport(p, {
  cohortSize: Number(process.env.REPORT_COHORT || 20),
  windowDays: Number(process.env.REPORT_DAYS || 30),
  excludeShops,
  diagShop: process.env.DIAG_SHOP || null,
});
await p.$disconnect();

if ((process.env.REPORT_FORMAT || "json") === "md") {
  const s = (v) => (v == null ? "—" : typeof v === "number" ? `${v}s` : String(v));
  const d = report.draft, pb = report.publish;
  console.log(`## Navaal growth report — generated ${report.generatedAt}\n`);
  console.log(`Cohort: last ${report.cohortSize} measured installs (requested ${report.cohortRequested}${report.smallSample ? ", small sample" : ""}); excluded: ${report.excludedShops.join(", ") || "none"}\n`);
  console.log(`**Install → first draft:** median ${s(d.medianSeconds)} · p90 ${s(d.p90Seconds)} · reached ${d.reached}/${d.n} · under 2 min ${d.under120s} · censored median ${s(d.censoredMedian)}${d.note ? ` · ${d.note}` : ""}`);
  console.log(`**Install → first publish:** median ${s(pb.medianSeconds)} · p90 ${s(pb.p90Seconds)} · reached ${pb.reached}/${pb.n} · under 2 min ${pb.under120s} · censored median ${s(pb.censoredMedian)}${pb.note ? ` · ${pb.note}` : ""}`);
  console.log(`Uninstalled without a draft: ${d.uninstalledWithoutReaching} · zero-product catalogs: ${d.zeroProducts} · inconsistent rows: ${d.inconsistent.length + pb.inconsistent.length}\n`);
  console.log(`**Review asks (last ${report.windowDays} d):** ${report.reviewAsk.attempts} calls · ${JSON.stringify(report.reviewAsk.attemptsByCode)} · shops asked ${report.reviewAsk.shopsAsked} · shops shown ${report.reviewAsk.shopsShown}`);
  console.log(`**Upgrade prompts (last ${report.windowDays} d):** ${JSON.stringify(report.upgradePrompts.byTrigger)}\n_${report.upgradePrompts.note}_`);
} else {
  console.log(JSON.stringify(report, null, 2));
}
