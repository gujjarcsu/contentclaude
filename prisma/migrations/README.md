# Migrations

Phase 1 item 1. Until 2026-09-09 this project had **no migrations at all**: the release command was
`prisma db push --skip-generate`, which diffs the live database against `schema.prisma` and applies
whatever it decides is needed, with no record and no reverse.

That is fine until the day it is not. `db push` has no history, so there is nothing to roll back to; it
cannot express a data migration; and it is one `--accept-data-loss` away from dropping a column with no
way back. That flag was in fact used once, deliberately, on 2026-08-12 to drop dead columns, and reverted
in the same session — but the fact that it *was* the tool for that job is the point.

## How this is set up

`0_init` is a **baseline**: the full schema as it already existed in production on 2026-09-09. Before
creating it, production was checked against `schema.prisma` with

```
prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script
```

which produced **zero statements** — production and the schema agreed exactly, and there was no
`_prisma_migrations` table. The baseline was then marked as already applied:

```
npx prisma migrate resolve --applied 0_init
```

so `migrate deploy` knows not to try to create tables that exist. The release command is now
`npx prisma migrate deploy`.

## Adding a migration

Never edit `0_init`, and never hand-edit an applied migration.

```
# 1. change prisma/schema.prisma
# 2. generate the migration against a shadow database
npx prisma migrate dev --name add_something_useful
# 3. read the generated SQL before you commit it
# 4. commit prisma/migrations/<timestamp>_add_something_useful/
```

`migrate dev` needs a shadow database it can drop and recreate — never point it at production. Use a
local Postgres, or a second Neon branch.

Push to `main`; CI deploys, and the release command runs `migrate deploy`, which applies exactly the
migrations in this folder that are not yet recorded, in order, inside a transaction where the database
supports it.

## Rolling back

**A migration and the image that expects it must be rolled back together, and the migration goes first.**
Rolling the image back alone, against a schema that has moved on, turns a bad release into a worse one.

Prisma has no `migrate down`. The reverse SQL has to be written, which is why it is worth writing it at
the same time as the forward migration, while the reasoning is fresh.

```
# 1. Generate the reverse script (down = from the new schema back to the previous one).
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-migrations prisma/migrations \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script > down.sql

# 2. Read it. A DROP COLUMN here destroys data — take a Neon branch/backup first.

# 3. Apply it to production.
fly ssh console -a contentclaude -C "npx prisma db execute --file /app/down.sql --schema /app/prisma/schema.prisma"

# 4. Mark the migration as rolled back so migrate deploy does not re-apply it.
fly ssh console -a contentclaude -C "npx prisma migrate resolve --rolled-back <migration_name>"

# 5. Now roll the image back.
fly releases list -a contentclaude
fly releases rollback <version> -a contentclaude
```

**Additive migrations do not need any of this.** A new nullable column or a new index is compatible with
the previous image, so rolling the image back alone is safe and step 1-4 can be skipped. Prefer additive
migrations for exactly this reason: deploy the column, deploy the code that writes it, deploy the code
that requires it, as three separate releases.

## If `migrate deploy` fails during a release

The release command failing means the new version does **not** go live — Fly keeps serving the previous
one. That is the desired behaviour: a schema change that cannot be applied should stop the deploy, not
half-happen.

1. `fly logs -a contentclaude` — the failing statement is in the release-command output.
2. Fix the migration on a branch, verify against a shadow database, push.
3. If a migration is recorded as failed, clear it with
   `npx prisma migrate resolve --rolled-back <name>` before retrying.

---

## Rule 1: an applied migration is immutable

**Never edit a migration file that has already run.** New schema change, new file.

Prisma records migrations by **name** in `_prisma_migrations`. If the name is already there, the file is
skipped — whatever is now inside it. So editing an applied migration means:

- the new statements never run against production;
- `prisma migrate status` still reports **"Database schema is up to date!"**, because it compares names;
- the deploy ships code expecting a schema the database does not have;
- and the first merchant to touch that column gets a 500.

### This has already happened here

On **2026-09-09** a second `ALTER TABLE` was appended to `20260910_geo_note_dismissed`, which had been
applied at 16:21:06 UTC. The statement never ran. Every `/app` load returned
`P2022: column BrandVoice.publishWithoutReview does not exist` for roughly **eight hours**, until the
column was added by hand.

The record is unambiguous — that migration is stored with `applied_steps_count = 1`, the single
statement it contained when it ran. `20260910010000_publish_without_review` is where the second
statement should have gone in the first place.

### What now enforces it

- **CI fails** if any file under `prisma/migrations/` that already exists on `origin/main` is modified
  or deleted. The checkout uses `fetch-depth: 0`, without which the comparison silently passes.
  The one legitimate exception — restoring a wrongly-edited migration — is opted into per commit with
  `[migration-restore]` in the commit message, and CI prints a warning saying so.
- **The app checks at startup and on every deep health check** that every column in the Prisma schema
  exists in the database, and reports `error` (503) if not. `SELECT 1` cannot catch this; comparing
  columns can.
- **The post-deploy smoke job** reads that schema check and fails the deploy on drift.

### Naming

Use a 14-digit timestamp: `20260910010000_publish_without_review`. Prisma orders by name, so a shorter
prefix sorts unpredictably against generated ones.

### Writing one that is safe to re-run

Prefer `ADD COLUMN IF NOT EXISTS` / `DROP ... IF EXISTS` where the change may already have been applied
by hand during an incident. A migration that fails on the very deploy meant to end an outage is worse
than one that is a no-op.
