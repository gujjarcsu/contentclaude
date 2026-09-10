/**
 * The 2026-09-09 schema-drift incident, as tests.
 *
 * A migration that had ALREADY BEEN APPLIED was edited to add a second
 * `ALTER TABLE`. Prisma records migrations by NAME in `_prisma_migrations`, so
 * it saw the name, skipped the file, and never ran the added statement. The
 * database record proves it: that migration is stored with
 * `applied_steps_count = 1`, the single statement it contained when it ran.
 *
 * The deploy then shipped code expecting `BrandVoice.publishWithoutReview`, and
 * every `/app` load returned 500 with `P2022: column does not exist` for
 * roughly eight hours.
 *
 * Three things were supposed to catch it and did not:
 *
 *   - `prisma migrate status` said "Database schema is up to date!" — it
 *     compares names, not columns;
 *   - `/api/health?deep=1` said `ok` — its database check is `SELECT 1`, which
 *     needs no columns;
 *   - the post-deploy smoke job and the five-minute `/app` probe both passed,
 *     because both sent a non-browser user-agent, got 410 Gone from the Shopify
 *     bot filter, and treated 410 as healthy. Neither ever reached a loader.
 *
 * Sentry was the only thing that noticed, and only because a person read it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { prisma } = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { checkSchemaDrift, logSchemaDriftAtStartup } = await import("../../app/utils/schemaDrift.server.js");
const { EXPECTED_COLUMNS } = await import("../../app/utils/schemaColumns.generated.js");

/** Every expected column present. */
const allPresent = () =>
  EXPECTED_COLUMNS.map((c) => {
    const i = c.indexOf(".");
    return { table_name: c.slice(0, i), column_name: c.slice(i + 1) };
  });

beforeEach(() => {
  vi.clearAllMocks();
  // The cache is 30s and module-scoped; force past it in every test.
});

describe("drift is detected, and it is an error", () => {
  it("a database with every column is ok", async () => {
    prisma.$queryRaw.mockResolvedValue(allPresent());
    const r = await checkSchemaDrift({ force: true });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.checked).toBe(EXPECTED_COLUMNS.length);
  });

  it("the exact incident: one column missing is reported by name", async () => {
    prisma.$queryRaw.mockResolvedValue(
      allPresent().filter(
        (c) => !(c.table_name === "BrandVoice" && c.column_name === "publishWithoutReview"),
      ),
    );

    const r = await checkSchemaDrift({ force: true });

    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["BrandVoice.publishWithoutReview"]);
  });

  it("several missing columns are all reported, not just the first", async () => {
    prisma.$queryRaw.mockResolvedValue(allPresent().slice(0, 5));
    const r = await checkSchemaDrift({ force: true });
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBe(EXPECTED_COLUMNS.length - 5);
  });

  it("an unreachable database does not masquerade as drift", async () => {
    // The database check already reports that, and two alarms for one outage
    // trains the owner to ignore both. But it must not claim the schema is
    // verified either — hence the `error` field.
    prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));
    const r = await checkSchemaDrift({ force: true });
    expect(r.error).toMatch(/connection refused/);
    expect(r.missing).toEqual([]);
  });

  it("asks the database once per check, not once per column", async () => {
    prisma.$queryRaw.mockResolvedValue(allPresent());
    await checkSchemaDrift({ force: true });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("only looks at the current schema, so another tenant cannot mask a gap", async () => {
    prisma.$queryRaw.mockResolvedValue(allPresent());
    await checkSchemaDrift({ force: true });
    const sql = prisma.$queryRaw.mock.calls[0][0].join("?");
    expect(sql).toMatch(/information_schema\.columns/);
    expect(sql).toMatch(/current_schema\(\)/);
  });
});

describe("startup says so, loudly, but does not crash-loop", () => {
  it("logs an error naming the missing columns and the likely cause", async () => {
    prisma.$queryRaw.mockResolvedValue(
      allPresent().filter(
        (c) => !(c.table_name === "BrandVoice" && c.column_name === "publishWithoutReview"),
      ),
    );
    const logger = (await import("../../app/utils/logger.server.js")).default;

    const r = await logSchemaDriftAtStartup();

    expect(r.ok).toBe(false);
    expect(logger.error).toHaveBeenCalled();
    const [meta, msg] = logger.error.mock.calls.at(-1);
    expect(meta.event).toBe("schema_drift");
    expect(msg).toMatch(/P2022/);
    expect(msg).toMatch(/edited after it was applied/);
    expect(msg).toMatch(/RUNBOOK/);
  });

  it("returns rather than exiting — a crash loop is worse than a degraded app", async () => {
    // min_machines_running is 1. Exiting on drift takes the app down entirely,
    // when usually one column is missing and most of the app still works. Deep
    // health returns 503 regardless, so the deploy is still marked failed.
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(logSchemaDriftAtStartup()).resolves.toBeDefined();
  });
});

describe("the expected-column list cannot fall behind the schema", () => {
  it("the committed file matches what the generator produces", () => {
    // If this fails, run: node scripts/generate-schema-columns.mjs
    expect(() =>
      execFileSync("node", ["scripts/generate-schema-columns.mjs", "--check"], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("it includes the column the incident was about", () => {
    expect(EXPECTED_COLUMNS).toContain("BrandVoice.publishWithoutReview");
    expect(EXPECTED_COLUMNS).toContain("GrowthState.geoNoteDismissedAt");
  });

  it("it covers every model, not just the ones somebody remembered", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
    const tables = new Set(EXPECTED_COLUMNS.map((c) => c.slice(0, c.indexOf("."))));
    for (const m of models) {
      expect(tables.has(m), `no columns generated for model ${m}`).toBe(true);
    }
  });
});

describe("deep health reports drift as an error, not a degrade", () => {
  const src = readFileSync("app/routes/api.health.jsx", "utf8");

  it("sets healthy = false, which is the 503", () => {
    const block = src.slice(src.indexOf("checkSchemaDrift"));
    expect(block).toMatch(/healthy = false/);
  });

  it("a deploy whose schema does not match cannot report ok", () => {
    // `degraded` would have kept the smoke job green, which is precisely how
    // eight hours passed.
    const block = src.slice(src.indexOf("checkSchemaDrift"), src.indexOf("checks.build"));
    const degradedBeforeError = block.indexOf("degraded = true");
    const healthyFalse = block.indexOf("healthy = false");
    expect(healthyFalse).toBeGreaterThan(-1);
    // degraded is only used for "the probe itself could not run"
    if (degradedBeforeError > -1) {
      expect(block).toMatch(/error: "unavailable"/);
    }
  });

  it("names the missing columns in the response so the smoke job can print them", () => {
    expect(src).toMatch(/missingColumns/);
    expect(src).toMatch(/missing: drift\.missing/);
  });
});

describe("migrations are immutable, and CI enforces it", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("CI fails when a migration already on main is modified", () => {
    expect(ci).toMatch(/diff-filter=MD origin\/main\.\.\.HEAD -- 'prisma\/migrations/);
  });

  it("CI has the full history it needs to make that comparison", () => {
    // With the default shallow clone, origin/main...HEAD cannot be computed and
    // the guard would silently pass.
    expect(ci).toMatch(/fetch-depth: 0/);
  });

  it("the exception is opt-in per commit and says so in the log", () => {
    expect(ci).toMatch(/\[migration-restore\]/);
    expect(ci).toMatch(/::warning::/);
  });

  it("the offending ALTER now lives in its own migration", () => {
    const dirs = readdirSync("prisma/migrations").filter((d) =>
      existsSync(`prisma/migrations/${d}/migration.sql`),
    );
    const owner = dirs.find((d) =>
      readFileSync(`prisma/migrations/${d}/migration.sql`, "utf8").includes("publishWithoutReview"),
    );
    expect(owner).toBeDefined();
    expect(owner).not.toBe("20260910_geo_note_dismissed");
    expect(owner).toMatch(/^\d{14}_/);
  });

  it("the migration that was already applied contains exactly one statement again", () => {
    // It is recorded in _prisma_migrations with applied_steps_count = 1. The
    // file has to match what actually ran, or the next person reading it is
    // misled about the state of production.
    const sql = readFileSync("prisma/migrations/20260910_geo_note_dismissed/migration.sql", "utf8");
    // Strip comment lines first: a chunk is comments PLUS its statement, so
    // testing whether the chunk starts with "--" throws the statement away too.
    const code = sql
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const statements = code.split(";").filter((s) => s.trim());
    expect(statements).toHaveLength(1);
    expect(sql).toMatch(/GrowthState.*geoNoteDismissedAt/);
    expect(sql).not.toMatch(/publishWithoutReview/);
  });

  it("the replacement is idempotent, because the column was added by hand", () => {
    const dirs = readdirSync("prisma/migrations");
    const owner = dirs.find(
      (d) =>
        existsSync(`prisma/migrations/${d}/migration.sql`) &&
        readFileSync(`prisma/migrations/${d}/migration.sql`, "utf8").includes("publishWithoutReview"),
    );
    const sql = readFileSync(`prisma/migrations/${owner}/migration.sql`, "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
  });
});

describe("nothing calls /app without a browser user-agent any more", () => {
  it("the operator probe sends one and rejects 410", () => {
    const src = readFileSync("app/utils/scheduler.server.js", "utf8");
    expect(src).toMatch(/BROWSER_UA/);
    expect(src).toMatch(/"user-agent": BROWSER_UA/);
    expect(src).toMatch(/OK_CODES = \[200, 302\]/);
    // The old rule, which passed for eight hours against a dead app.
    expect(src).not.toMatch(/const broken = httpCode >= 500/);
  });

  it("the smoke job sends one and treats 410 as a failure", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toMatch(/Chrome\/131/);
    expect(ci).toMatch(/410\) echo "::error::/);
    expect(ci).not.toMatch(/2\*\|3\*\|401\|410\) echo "ok"/);
  });

  it("the smoke job also checks the schema", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toMatch(/checks\.schema/);
    expect(ci).toMatch(/SCHEMA DRIFT/);
  });

  it("the proof harnesses set one, and blame the bot filter rather than the session", () => {
    for (const f of ["tools/proof/web-vitals.mjs", "tools/proof/mobile-375.mjs"]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} has no browser UA`).toMatch(/userAgent: BROWSER_UA/);
      expect(src, `${f} still blames the session for a 410`).toMatch(/BOT/);
    }
  });
});
