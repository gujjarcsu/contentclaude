#!/usr/bin/env node
/**
 * Phase 14 item 7, second cut — the same read, with every shell failure mode removed.
 *
 * The first version took the connection string from an environment variable and
 * handed it to `new PrismaClient({ datasources: ... })`. On Windows that failed
 * three times with Prisma validating `env("DATABASE_URL")` anyway. Rather than
 * keep guessing at PowerShell quoting, this version:
 *
 *   - reads the string from a FILE, so nothing is typed into a shell, nothing
 *     lands in shell history, and no quoting rule can mangle it;
 *   - repairs the two shapes people actually paste — Neon's `psql '<url>'`
 *     command form, and a string wrapped in quotes — instead of erroring;
 *   - sets process.env.DATABASE_URL itself BEFORE the client is constructed,
 *     which is the thing Prisma actually reads;
 *   - says plainly what it found if the string is still not a Postgres URL.
 *
 * READ-ONLY: every statement is a SELECT. It prints the host, never the string.
 *
 *   node scripts/restore-drill-compare2.mjs C:\path\to\branch-url.txt > drill.json
 */
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/restore-drill-compare2.mjs <file containing the connection string>");
  process.exit(2);
}

let raw = fs.readFileSync(file, "utf8");
// A file saved by Notepad can carry a BOM, CRLF and a trailing newline.
raw = raw.replace(/^\uFEFF/, "").trim();
// Neon offers a `psql '<url>'` form; people copy the whole line.
raw = raw.replace(/^psql\s+/i, "").trim();
// And a shell-quoted or double-quoted string.
raw = raw.replace(/^['"]/, "").replace(/['"]$/, "").trim();
// Some copies arrive as KEY=value.
raw = raw.replace(/^[A-Z_]+=/, "").trim();

if (!/^postgres(ql)?:\/\//.test(raw)) {
  console.error(
    `That file does not contain a Postgres connection string.\n` +
      `It is ${raw.length} characters and starts with: ${JSON.stringify(raw.slice(0, 12))}\n` +
      `Expected it to start with postgresql:// — copy the plain connection string from Neon's\n` +
      `Connection details box (not the psql, Prisma or .env variant) into the file, nothing else.`,
  );
  process.exit(3);
}

// Prisma reads env("DATABASE_URL") from process.env when the client is built.
process.env.DATABASE_URL = raw;
process.env.DIRECT_URL = raw;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: raw });

const tables = await prisma.$queryRawUnsafe(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   ORDER BY table_name`,
);
const columns = await prisma.$queryRawUnsafe(
  `SELECT table_name || '.' || column_name AS col FROM information_schema.columns
   WHERE table_schema = 'public' ORDER BY 1`,
);
const rows = {};
for (const { table_name: t } of tables) {
  const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`);
  rows[t] = r?.[0]?.n ?? null;
}

console.log(
  JSON.stringify(
    {
      readAt: new Date().toISOString(),
      host: (() => { try { return new URL(raw).host; } catch { return "unparseable"; } })(),
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
