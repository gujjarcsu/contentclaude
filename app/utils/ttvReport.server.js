/**
 * Time-to-value + growth report (brief items 3–5). Pure over injected data —
 * no app imports — so it can be unit-tested, run on the pruned Fly image by
 * scripts/ttv-report.mjs, and reused by the daily digest (item 8).
 *
 * Cohort = the last `cohortSize` MEASURED installs: rows whose installSource is
 * not "pre_tracking" (those predate measurement), excluding the owner's own
 * test shops (echoed), ordered by COALESCE(reinstalledAt, installedAt) DESC.
 * Uninstalled shops stay in the cohort (an install that never reached a draft
 * is a real outcome). A milestone earlier than the install moment is flagged
 * inconsistent and excluded from the medians, never dropped silently.
 */

export const DEFAULT_EXCLUDE_SHOPS = ["contentpilot-dev2.myshopify.com", "navaal-qa-fresh.myshopify.com"];

export function installAtOf(row) {
  return row?.reinstalledAt ?? row?.installedAt ?? null;
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
}

function milestoneSection(rows, field, sourceField) {
  const secs = [];
  const bySource = {};
  let reached = 0;
  let notReached = 0;
  let uninstalledWithoutReaching = 0;
  let zeroProducts = 0;
  const inconsistent = [];
  for (const r of rows) {
    const at = installAtOf(r);
    if (r.productCountAtFirstLoad === 0) zeroProducts += 1;
    if (!r[field]) {
      notReached += 1;
      if (r.uninstalledAt) uninstalledWithoutReaching += 1;
      continue;
    }
    const s = (new Date(r[field]).getTime() - new Date(at).getTime()) / 1000;
    if (s < 0) { inconsistent.push({ shop: r.shop, field }); notReached += 1; continue; }
    reached += 1;
    secs.push(s);
    const src = r[sourceField] || "unknown";
    bySource[src] = (bySource[src] || 0) + 1;
  }
  const n = rows.length;
  const med = median(secs);
  // Censored median: not-reached counts as +∞ — prints "not reached" when fewer than half reached.
  const censoredMedian = n === 0 ? null : reached * 2 > n ? Math.round(median([...secs, ...Array(n - reached).fill(Number.POSITIVE_INFINITY)].map((x) => (Number.isFinite(x) ? x : Number.MAX_SAFE_INTEGER)))) : "not reached";
  return {
    n,
    reached,
    notReached,
    uninstalledWithoutReaching,
    zeroProducts,
    medianSeconds: med == null ? null : Math.round(med),
    p90Seconds: percentile(secs, 0.9) == null ? null : Math.round(percentile(secs, 0.9)),
    under120s: secs.filter((s) => s <= 120).length,
    censoredMedian: censoredMedian === "not reached" ? "not reached" : censoredMedian,
    bySource,
    inconsistent,
    ...(reached === 0 ? { note: "no install has reached this milestone yet" } : {}),
  };
}

/** Pure summary over already-selected cohort rows + window rows. */
export function summarizeGrowth({ cohortRows = [], attempts = [], prompts = [], excludedShops = [], cohortRequested = 20, now = new Date() } = {}) {
  const rows = cohortRows.map((r) => ({
    shop: r.redactedAt ? `redacted:${String(r.shop).slice(9, 21)}…` : r.shop,
    redacted: !!r.redactedAt,
    installSource: r.installSource,
    installAt: installAtOf(r),
    uninstalledAt: r.uninstalledAt ?? null,
    productCountAtFirstLoad: r.productCountAtFirstLoad ?? null,
    quickStartStartedAt: r.quickStartStartedAt ?? null,
    quickStartDraftCount: r.quickStartDraftCount ?? 0,
    firstDraftSeenAt: r.firstDraftSeenAt ?? null,
    firstDraftSource: r.firstDraftSource ?? null,
    firstPublishAt: r.firstPublishAt ?? null,
    firstPublishSource: r.firstPublishSource ?? null,
    ttvDraftSeconds: r.firstDraftSeenAt ? Math.round((new Date(r.firstDraftSeenAt) - new Date(installAtOf(r))) / 1000) : null,
    ttvPublishSeconds: r.firstPublishAt ? Math.round((new Date(r.firstPublishAt) - new Date(installAtOf(r))) / 1000) : null,
    reviewAskCount: r.reviewAskCount ?? 0,
    reviewLastCode: r.reviewLastCode ?? null,
    reviewShownAt: r.reviewShownAt ?? null,
  }));
  const attemptsByCode = {};
  const shopsAsked = new Set();
  const shopsShown = new Set();
  for (const a of attempts) {
    const c = a.code ?? "pending";
    attemptsByCode[c] = (attemptsByCode[c] || 0) + 1;
    shopsAsked.add(a.shop);
    if (a.code === "success") shopsShown.add(a.shop);
  }
  const byTrigger = {};
  for (const p of prompts) {
    const t = (byTrigger[p.trigger] ||= { rows: 0, shown: 0, ctaClicked: 0, arrived: 0, subscribeRequested: 0, planChosen: 0, declined: 0 });
    t.rows += 1;
    if ((p.shownCount ?? 0) > 0) t.shown += 1;
    if (p.ctaClickedAt) t.ctaClicked += 1;
    if (p.arrivedAtPlansAt) t.arrived += 1;
    if (p.subscribeRequestedAt) t.subscribeRequested += 1;
    if (p.planChosen) t.planChosen += 1;
    if (p.declinedAt) t.declined += 1;
  }
  return {
    generatedAt: now.toISOString(),
    cohortRequested,
    cohortSize: cohortRows.length,
    smallSample: cohortRows.length < 5,
    excludedShops,
    draft: milestoneSection(cohortRows, "firstDraftSeenAt", "firstDraftSource"),
    publish: milestoneSection(cohortRows, "firstPublishAt", "firstPublishSource"),
    reviewAsk: { attempts: attempts.length, attemptsByCode, shopsAsked: shopsAsked.size, shopsShown: shopsShown.size },
    upgradePrompts: { byTrigger, note: "planChosen counts trial starts; rows for shops that uninstalled were deleted with their data; view-only exposure is never attributed" },
    rows,
  };
}

/**
 * Read the cohort + window rows through an injected Prisma client and summarise.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{cohortSize?: number, excludeShops?: string[], windowDays?: number, now?: Date, diagShop?: string}} [opts]
 */
export async function computeTtvReport(prisma, { cohortSize = 20, excludeShops = DEFAULT_EXCLUDE_SHOPS, windowDays = 30, now = new Date(), diagShop = null } = {}) {
  const all = await prisma.shop.findMany({ where: { installSource: { not: "pre_tracking" }, shop: { notIn: excludeShops } } });
  const sorted = all
    .filter((r) => installAtOf(r))
    .sort((a, b) => new Date(installAtOf(b)).getTime() - new Date(installAtOf(a)).getTime());
  const cohortRows = sorted.slice(0, cohortSize);
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const [attempts, prompts] = await Promise.all([
    prisma.reviewRequestAttempt.findMany({ where: { requestedAt: { gte: since } } }),
    prisma.upgradePrompt.findMany({ where: { lastSeenAt: { gte: since } } }),
  ]);
  const report = summarizeGrowth({ cohortRows, attempts, prompts, excludedShops: excludeShops, cohortRequested: cohortSize, now });
  report.windowDays = windowDays;
  report.measuredInstallsTotal = sorted.length;
  if (diagShop) {
    const [row, shopAttempts, shopPrompts] = await Promise.all([
      prisma.shop.findUnique({ where: { shop: diagShop } }),
      prisma.reviewRequestAttempt.findMany({ where: { shop: diagShop }, orderBy: { requestedAt: "desc" } }),
      prisma.upgradePrompt.findMany({ where: { shop: diagShop }, orderBy: { lastSeenAt: "desc" } }),
    ]);
    report.diag = { shop: diagShop, row, attempts: shopAttempts, prompts: shopPrompts };
  }
  return report;
}
