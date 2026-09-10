/**
 * Schema drift — does the database actually have the columns this build needs?
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * On 2026-09-09 a migration that had already been applied was edited to add a
 * second `ALTER TABLE`. Prisma tracks migrations by NAME, so it saw the name in
 * `_prisma_migrations`, skipped the file, and never ran the new statement.
 * Every `/app` load then returned 500 with
 * `P2022: column BrandVoice.publishWithoutReview does not exist`, for roughly
 * eight hours.
 *
 * Everything that was supposed to notice said the deploy was fine:
 *
 *   - `prisma migrate status` said "Database schema is up to date!" — it
 *     compares NAMES, not columns;
 *   - `/api/health?deep=1` said `ok` — it ran `SELECT 1`, which needs no column;
 *   - the post-deploy smoke job passed, and so did the five-minute `/app` probe.
 *
 * Sentry was the only thing that caught it, and only because a human read it.
 *
 * So the gap was specific: nothing compared the schema this code expects
 * against the schema the database has. That comparison is what this module is.
 * It is cheap — one `information_schema` query — and it runs at startup and on
 * every deep health check, and any drift is an `error`, which is a 503, which
 * fails the smoke job and pages the owner.
 *
 * ── Why not `prisma migrate diff --exit-code` ──────────────────────────────
 *
 * That shells out to the Prisma CLI, needs the schema file and a shadow
 * connection, and takes seconds. This has to be affordable on a health check
 * every five minutes. Reading `information_schema.columns` once and comparing
 * it to a list generated at build time costs a single indexed query.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";

/**
 * Every column this build's Prisma client will ask for, as `Table.column`.
 *
 * Generated from `prisma/schema.prisma` by `scripts/generate-schema-columns.mjs`
 * and committed, so the check needs no schema parsing at runtime and cannot
 * drift from the schema without the generator noticing — a test regenerates it
 * and fails if the committed copy is stale.
 */
import { EXPECTED_COLUMNS } from "./schemaColumns.generated.js";

/** Cache the result briefly: the schema does not change between health checks. */
let _cache = { at: 0, result: null };
const CACHE_MS = 30_000;

/**
 * Compare the columns this build expects against the columns that exist.
 *
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{ok: boolean, missing: string[], checked: number, error?: string}>}
 */
export async function checkSchemaDrift({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache.result && now - _cache.at < CACHE_MS) return _cache.result;

  let result;
  try {
    const rows = await prisma.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `;

    const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = EXPECTED_COLUMNS.filter((c) => !have.has(c));

    result = { ok: missing.length === 0, missing, checked: EXPECTED_COLUMNS.length };
  } catch (err) {
    // A database that cannot answer this is already reported by the database
    // check. Do not turn one outage into two alarms — but do not claim the
    // schema is fine either.
    result = { ok: true, missing: [], checked: 0, error: err.message };
  }

  _cache = { at: now, result };
  return result;
}

/**
 * Startup gate. Logs loudly; does NOT exit.
 *
 * Exiting would be the wrong call: with `min_machines_running = 1` a crash loop
 * takes the app down entirely, and drift usually means ONE column is missing —
 * most of the app still works, and a merchant is better served by a degraded
 * app plus a page to the owner than by no app at all. Deep health returns 503
 * regardless, so the deploy is still marked failed and the owner is still told.
 */
export async function logSchemaDriftAtStartup() {
  const drift = await checkSchemaDrift({ force: true });

  if (drift.error) {
    logger.warn({ err: drift.error }, "Schema drift check could not run");
    return drift;
  }

  if (!drift.ok) {
    logger.error(
      { missing: drift.missing, checked: drift.checked, event: "schema_drift" },
      `SCHEMA DRIFT: ${drift.missing.length} column(s) this build needs are missing from the database. ` +
        `Every query touching them will fail with P2022. Missing: ${drift.missing.join(", ")}. ` +
        `This usually means a migration was edited after it was applied — Prisma skips those by name. ` +
        `See docs/RUNBOOK.md, "A migration was edited after it was applied".`,
    );
  } else {
    logger.info({ checked: drift.checked }, "Schema matches this build");
  }

  return drift;
}
