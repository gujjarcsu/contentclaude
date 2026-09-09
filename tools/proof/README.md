# tools/proof — Playwright proof harnesses

Thirty-two one-off scripts written to **prove** something: that a bug reproduces, that a fix holds, that
the App Store reviewer's exact path works. They were built for a moment and kept because the next
rejection asks the same question.

They are **not tests**. Nothing in CI runs them. They drive a real browser against a real store with a
saved admin session, and several of them **write to a live shop**. Read the header of a script before you
run it — every one says what it touches.

They moved here from `scripts/` on 2026-09-09 (Phase 1 item 9). `scripts/` is now only the small number
of operational scripts that run **on the Fly machine** against the database; this directory is only
things that drive a browser **from a laptop**. Two different jobs that had been living in one pile.

## Which of these touch production

**A saved admin session is a real login.** These scripts act as the store owner.

| Risk | Scripts | What they do |
|---|---|---|
| **Writes to a live shop** | `store-install-from-appstore`, `store-uninstall-app`, `billing-*`, `reattach-record`, `attach-*` | Install, uninstall, approve and cancel real subscriptions. `billing-*` moves a real store between plans. |
| **Reads a live shop** | `gauntlet-*`, `proof-items*`, `verify-*`, `repro-*`, `title-click-*`, `incognito-*`, `reconcile-probe`, `_rectest` | Navigate the admin and screenshot. No writes, but a real session. |
| **Local only** | `extract-reviewer-frames`, `record-reviewer-proof`, `billing-review-recording` | Turn an existing `.webm` into frames. Touch nothing remote. |
| **Session management** | `login-cdp`, `refresh-session` | `login-cdp` opens a browser for **a human** to log in, and writes `tests/e2e/.auth/shopify.json`. No agent ever types those credentials. |

**Run against `navaal-qa-fresh.myshopify.com`, never a real merchant store.** The one exception is a
reviewer-path reproduction that must be done on the store the reviewer used, and that is a decision to
make deliberately, not by leaving a default in place.

## Before running anything

```bash
node tools/proof/login-cdp.mjs     # a human logs in; writes tests/e2e/.auth/shopify.json
```

The saved session expires. When a harness fails at the first navigation with a login screen, that is
what happened — re-run the line above rather than debugging the harness.

## Output

Each harness writes screenshots, video frames and a `results.json` into a directory beside the repo
root — `gauntlet-*/`, `billing-*/`, `proof-*/` and so on. **All of those patterns are gitignored**, and
`.dockerignore` excludes this whole directory, because these outputs once reached 186 MB and were being
uploaded to Fly as build context on every deploy.

The results files worth keeping from past runs are in `docs/history/proof-results/`.
