# Recovered from three stale agent worktrees — 2026-09-09

Three git worktrees sat under `.claude/worktrees/`, all checked out at `ff52f34`, all with uncommitted
changes, all abandoned. `git worktree prune` would have removed the registrations; deleting the
directories would have destroyed the work. Phase 1 item 9 asks for the worktrees to go, and Phase 3 asks
for the quick-start route that lives in one of them, so everything was taken out first.

The worktrees are now pruned. This directory is what was in them.

**These files are not compiled and not imported.** The route and helper are saved with a `.txt` suffix so
that lint, typecheck and the router ignore them until somebody deliberately brings them back. They are a
record, not code that ships.

## What is here

| File | What it was | Base |
|---|---|---|
| `app.quick-start.jsx.txt` | `app/routes/app.quick-start.jsx`, untracked — a quick-start route, 51 lines | `ff52f34` |
| `quickStart.server.js.txt` | `app/utils/quickStart.server.js`, untracked — its helper, 427 lines | `ff52f34` |
| `agent-a2cacc12-plans-metrics.patch` | Modifications to `app.optimize`, `app.plans`, `app.products`, `app.seo-audit`, the `subscriptions_update` webhook, `metrics.server.js` and `plans.server.js` | `ff52f34` |
| `agent-ab616a79-review-jobs.patch` | Modifications to `ReviewRequest.jsx`, `app.jobs`, `app.products_.$id`, `app.review-request`, `app.review` and `bulkProcessor.server.js` | `ff52f34` |

## Before you use any of it

`ff52f34` is old. Phase 0 rewrote billing correctness, quota consumption, job recovery and the review
flow, and Phase 1 rewrote the topology and the polling. **These patches will conflict, and where they
apply cleanly they may still be wrong** — a change that was correct against `ff52f34` can quietly undo a
Phase 0 fix.

Treat them as a description of intent, not as a patch to apply:

```bash
git apply --3way --check docs/history/worktree-recovery/agent-a2cacc12-plans-metrics.patch
```

Read the diff first. If what it wants is already done, delete the patch and say so in `PROGRESS.md`.

The quick-start route is the one piece with a live claim on it: Phase 3 item 3.1 replaces the
`/app/welcome` magic-moment flow, and this is a draft of the replacement. Read it there.
