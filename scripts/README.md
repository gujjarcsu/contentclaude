# scripts — operational scripts that run on the machine

Seven scripts. Each one runs **on the Fly machine**, where `DATABASE_URL` and the generated Prisma client
already exist:

```bash
fly ssh console -a contentclaude -C "node /app/scripts/<name>.mjs"
```

Anything you upload to `/app` is wiped by the next deploy, so upload, run, read the output, and do not
expect it to still be there tomorrow:

```bash
MSYS_NO_PATHCONV=1 fly ssh sftp put ./scripts/<name>.mjs /app/<name>.mjs -a contentclaude
```

Browser-driving proof harnesses are **not** here — they are in `tools/proof/`, they run from a laptop,
and several of them write to a live shop. The split is deliberate: these two things had been in one pile
and it was not possible to tell at a glance which was which.

## The names say what they do

A script name that does not say whether it writes is a trap at 2am. These say it.

| Script | Default | What it does |
|---|---|---|
| `backfill-faq-metafields--dry-run-default.mjs` | **dry run** | Repairs FAQ metafields that were recorded as published but are missing live. Idempotent, resumable. `--apply` to write. |
| `fix-legacy-alttext-rows--dry-run-default.mjs` | **dry run** | Marks pre-fix alt-text rows failed — they were stored as published but never reached Shopify. `--apply` to write. |
| `test-seed-usage--writes-test-store-only.mjs` | **writes** | Inserts synthetic usage rows to exhaust a dev shop's quota, so the upgrade prompts can be photographed without spending 25 real generations. **Refuses any shop it does not recognise as a test store.** `SEED_ACTION=restore` removes them. |
| `ttv-report.mjs` | read-only | Time-to-first-value, review-ask outcomes, upgrade funnel. No writes. |
| `diag-shop.cjs` | read-only | One shop's install, plan and session state. |
| `shop-install-diag.cjs` | read-only | Install and reinstall history. |
| `store-products-diag.cjs` | read-only | Product and generated-content counts for a shop. |

Anything with `--apply`: **run it without the flag first and read the output.** Both backfills print
exactly what they would change.
