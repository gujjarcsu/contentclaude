#!/usr/bin/env node
/**
 * INFRA2 — read the durable log.
 *
 * Fly keeps roughly the last 100 lines, so `fly logs` cannot answer "what
 * happened at 03:45" once it is 04:00. This queries the `LogEvent` table, which
 * keeps WARN-and-above plus every deliberately tagged event for 30 days.
 *
 * Run it where DATABASE_URL exists — on the machine:
 *
 *   fly ssh console --app contentclaude -C "node /app/scripts/logs.mjs --since 2h"
 *   fly ssh console --app contentclaude -C "node /app/scripts/logs.mjs --event autopilot_withheld"
 *   fly ssh console --app contentclaude -C "node /app/scripts/logs.mjs --shop x.myshopify.com --level warn"
 *   fly ssh console --app contentclaude -C "node /app/scripts/logs.mjs --around 2026-09-10T03:45 --window 10m"
 *
 * Read-only. It never writes and never prints a secret: the rows were written
 * through pino's redaction, so tokens were already censored before storage.
 */
import prisma from "../app/db.server.js";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(String(process.argv[i]).replace(/^--/, ""), process.argv[i + 1]);
}

/** "90m", "2h", "3d" → milliseconds. Pure. */
function duration(text, fallback) {
  const m = /^(\d+)\s*(m|h|d)$/.exec(String(text ?? "").trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  return m[2] === "m" ? n * 60_000 : m[2] === "h" ? n * 3_600_000 : n * 86_400_000;
}

const LIMIT = Math.min(Number(args.get("limit") || 200), 2000);
const around = args.get("around") ? new Date(args.get("around")) : null;
const windowMs = duration(args.get("window"), 10 * 60_000);

const where = {};
if (around && Number.isFinite(around.getTime())) {
  where.createdAt = { gte: new Date(+around - windowMs), lte: new Date(+around + windowMs) };
} else {
  where.createdAt = { gte: new Date(Date.now() - duration(args.get("since"), 2 * 3_600_000)) };
}
if (args.get("event")) where.event = args.get("event");
if (args.get("shop")) where.shop = args.get("shop");
if (args.get("level")) {
  // "warn" means warn and above, which is what anyone asking for it means.
  const order = ["trace", "debug", "info", "warn", "error", "fatal"];
  const from = order.indexOf(String(args.get("level")).toLowerCase());
  if (from >= 0) where.level = { in: order.slice(from) };
}

const rows = await prisma.logEvent.findMany({
  where,
  orderBy: { createdAt: "desc" },
  take: LIMIT,
});

if (rows.length === 0) {
  // Never say "nothing happened" when the truth is "nothing matched". The
  // window and the filters are printed so the reader can widen them.
  console.log(`No rows matched. window=${JSON.stringify(where.createdAt)} filters=${JSON.stringify({ event: where.event, shop: where.shop, level: where.level })}`);
  console.log("Note: this table only holds WARN-and-above plus deliberately tagged events, never every request.");
} else {
  for (const r of rows.reverse()) {
    const when = r.createdAt.toISOString().replace("T", " ").slice(0, 23);
    const tag = r.event ? ` [${r.event}]` : "";
    const shop = r.shop ? ` {${r.shop}}` : "";
    const extra = r.data && Object.keys(r.data).length ? ` ${JSON.stringify(r.data)}` : "";
    console.log(`${when} ${r.level.toUpperCase().padEnd(5)}${tag}${shop} ${r.msg}${extra}`);
  }
  console.log(`\n${rows.length} row(s)${rows.length === LIMIT ? ` — capped at --limit ${LIMIT}, there may be more` : ""}`);
}

await prisma.$disconnect();
