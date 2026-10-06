#!/usr/bin/env node
/**
 * P38 — who was touched while the worker's Redis client was dead
 * (2026-10-01 11:40Z until the fix deploys).
 *
 * Three questions, each answered from the system rather than guessed:
 *   1. which shops tried to generate, and what happened to each job
 *   2. which shops installed, uninstalled or are on a paid plan in the window
 *   3. which emails the app sent to anyone outside navaal.ai (Resend's own log)
 *
 * READ ONLY. Unlike the CI diags this prints shop domains and recipient
 * addresses, because the owner needs to know who to contact. Do not paste the
 * output into a CI log or a public channel.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/p38-affected-shops.mjs"
 *   optional: SINCE=2026-10-01T11:40:00Z
 */
import prisma from "../app/db.server.js";

const SINCE = new Date(process.env.SINCE || "2026-10-01T11:40:00Z");

// ── 1. Generation jobs ──────────────────────────────────────────────────────
const jobs = await prisma.generationJob.findMany({
  where: { createdAt: { gte: SINCE } },
  select: {
    id: true, shop: true, status: true, source: true, totalProducts: true, completedProducts: true,
    failedProducts: true, errorLog: true, createdAt: true, startedAt: true, completedAt: true,
  },
  orderBy: { createdAt: "asc" },
});

// ── 2. Shops in the window, and every paid plan ─────────────────────────────
const shopsInWindow = await prisma.shop.findMany({
  where: {
    OR: [{ installedAt: { gte: SINCE } }, { reinstalledAt: { gte: SINCE } }, { uninstalledAt: { gte: SINCE } }],
  },
  select: { shop: true, kind: true, installedAt: true, reinstalledAt: true, uninstalledAt: true, firstPublishAt: true },
});
const paid = await prisma.plan.findMany({
  where: { planName: { not: "free" } },
  select: { shop: true, planName: true, status: true },
});

const shops = new Set([...jobs.map((j) => j.shop), ...shopsInWindow.map((s) => s.shop), ...paid.map((p) => p.shop)]);

// Warnings and errors the log sink kept for those shops.
const logs = await prisma.logEvent.findMany({
  where: { createdAt: { gte: SINCE }, shop: { in: [...shops] }, level: { in: ["warn", "error", "fatal"] } },
  select: { shop: true, level: true, event: true, msg: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});

const perShop = {};
for (const shop of shops) {
  const s = shopsInWindow.find((x) => x.shop === shop);
  const p = paid.find((x) => x.shop === shop);
  const shopJobs = jobs.filter((j) => j.shop === shop);
  const shopLogs = logs.filter((l) => l.shop === shop);
  const msgCounts = {};
  for (const l of shopLogs) msgCounts[`${l.level}: ${l.event ?? l.msg}`] = (msgCounts[`${l.level}: ${l.event ?? l.msg}`] ?? 0) + 1;
  perShop[shop] = {
    plan: p ? `${p.planName}:${p.status}` : "free",
    kind: s?.kind ?? null,
    installedAt: s?.installedAt ?? null,
    reinstalledAt: s?.reinstalledAt ?? null,
    uninstalledAt: s?.uninstalledAt ?? null,
    firstPublishAt: s?.firstPublishAt ?? null,
    jobs: shopJobs.map((j) => ({
      id: j.id, source: j.source, status: j.status, createdAt: j.createdAt, startedAt: j.startedAt, completedAt: j.completedAt,
      products: `${j.completedProducts}/${j.totalProducts} done, ${j.failedProducts} failed`,
      firstError: (() => {
        try { return JSON.parse(j.errorLog || "[]")[0]?.error ?? null; } catch { return "unparseable errorLog"; }
      })(),
    })),
    warningsAndErrors: msgCounts,
  };
}

// ── 3. Resend: everything sent outside navaal.ai ────────────────────────────
// Resend's GET /emails list endpoint, paged with `after`. If the key cannot
// list (a sending-only key), that is reported, not treated as "nothing sent".
async function resendEmails() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: "RESEND_API_KEY not set on this machine" };
  const out = [];
  let after = null;
  for (let page = 0; page < 50; page++) {
    const url = new URL("https://api.resend.com/emails");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return { error: `Resend list ${r.status}: ${(await r.text()).slice(0, 200)}`, partial: out };
    const body = await r.json();
    const data = body.data ?? [];
    let older = false;
    for (const e of data) {
      if (new Date(e.created_at) < SINCE) { older = true; continue; }
      out.push(e);
    }
    if (older || !body.has_more || data.length === 0) break;
    after = data.at(-1).id;
  }
  const external = out.filter((e) => (e.to ?? []).some((t) => !/@navaal\.ai$/i.test(t)));
  const internalBySubject = {};
  for (const e of out.filter((x) => !external.includes(x))) {
    const k = String(e.subject).replace(/\d+/g, "N");
    internalBySubject[k] = (internalBySubject[k] ?? 0) + 1;
  }
  return {
    totalSinceWindow: out.length,
    external: external.map((e) => ({ to: e.to, subject: e.subject, at: e.created_at, lastEvent: e.last_event })),
    internalBySubject,
  };
}

console.log(
  JSON.stringify(
    {
      readAt: new Date().toISOString(),
      since: SINCE.toISOString(),
      jobsInWindow: jobs.length,
      jobsByStatus: jobs.reduce((a, j) => ((a[j.status] = (a[j.status] ?? 0) + 1), a), {}),
      shops: perShop,
      emails: await resendEmails(),
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
