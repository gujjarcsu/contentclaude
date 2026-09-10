-- Phase 4 item 5 — autopilot, bounded.
--
-- Autopilot is the only path in the app where a generation is spent without a
-- merchant clicking anything: products/create fires once per product, and a
-- catalogue import fires it thousands of times in a burst. It already had an
-- entitlement check, a quota fast-fail, per-product idempotency and a
-- concurrent-job cap. What it did not have was a DAILY ceiling, and no way to
-- tell its jobs apart from a merchant's own.
--
--   GenerationJob.source   "autopilot" | "bulk" | "quick_start" | null
--
-- Nullable with no default and no backfill: a job created before this column
-- existed has an unknown source, which is the truth. The daily cap counts only
-- rows explicitly marked "autopilot", so an unknown row can never be counted
-- against a merchant's ceiling — the direction that errs toward doing the work
-- the merchant asked for.
--
-- The index is (shop, source, createdAt) because "how many autopilot jobs has
-- this shop had today" is the only question it has to answer.
--
-- NEW migration file; nothing applied is edited (docs/RUNBOOK.md Rule 1).
ALTER TABLE "GenerationJob" ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE INDEX IF NOT EXISTS "GenerationJob_shop_source_createdAt_idx"
  ON "GenerationJob" ("shop", "source", "createdAt");
