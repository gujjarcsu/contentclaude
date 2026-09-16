#!/usr/bin/env node
/**
 * Phase 14 item 7 — THE HALF OF THE RESTORE DRILL THAT WAS NEVER DONE.
 *
 * A4 proved a branch can be created from a point in time in 23 seconds
 * (`restore-drill-2026-09-16T0127Z`, `br-calm-rice-a7raewsp`). It did not prove
 * the branch CONTAINS anything, and a restore you have not read is not a
 * restore — which is the whole point of the line. The brief: compare it against
 * production, record the comparison, then delete the branch, because a drill
 * that leaves litter is half a drill.
 *
 * READ-ONLY. Every statement is a SELECT. Run it twice and diff:
 *
 *   # production (this is the side already recorded, from the Fly machine)
 *   node /app/scripts/restore-drill-compare.mjs > production.json
 *
 *   # the drill branch — needs a compute endpoint on it and its connection
 *   # string; the branch CW created deliberately has neither, so this is the
 *   # owner's step, in the Neon console.
 *   COMPARE_DATABASE_URL='<branch connection string>' \
 *     node /app/scripts/restore-drill-compare.mjs > drill.json
 *
 *   diff <(jq -S . production.json) <(jq -S . drill.json)
 *
 * What a PASS looks like: identical `columns` (the schema came across), and
 * `rows` within the drift you expect from the ten minutes between the point in
 * time and now — every count on the branch ≤ production, none of them zero for
 * a table production has rows in. A table that is empty on the branch and full
 * on production is a failed restore, however green the branch's status was.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.COMPARE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No connection string: set COMPARE_DATABASE_URL (or run where DATABASE_URL is set).");
  process.exit(2);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

/** Every table, from the live catalogue — so a new model cannot be silently missed. */
const tables = await prisma.$queryRawUnsafe(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   ORDER BY table_name`,
);

/** Every column, so a schema difference shows as a difference and not as a row count. */
const columns = await prisma.$queryRawUnsafe(
  `SELECT table_name || '.' || column_name AS col FROM information_schema.columns
   WHERE table_schema = 'public' ORDER BY 1`,
);

const rows = {};
for (const { table_name: t } of tables) {
  // Identifier is quoted; it comes from information_schema, not from input.
  const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`);
  rows[t] = r?.[0]?.n ?? null;
}

console.log(
  JSON.stringify(
    {
      readAt: new Date().toISOString(),
      // never the connection string, never a password: the host only, so the
      // two sides of the diff can be told apart.
      host: (() => {
        try {
          return new URL(url).host;
        } catch {
          return "unparseable";
        }
      })(),
      tableCount: tables.length,
      columnCount: columns.length,
      columns: columns.map((c) => c.col),
      rows,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
