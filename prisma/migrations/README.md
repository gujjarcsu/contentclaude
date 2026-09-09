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
