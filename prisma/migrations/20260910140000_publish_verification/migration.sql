-- Phase 4 item 4.2 — post-publish verification.
--
-- A publish used to be called successful when Shopify's mutation returned no
-- errors. That proves the request was ACCEPTED; it does not prove the field now
-- holds what we sent. The app was making the stronger claim.
--
-- `productUpdate` returns the updated product in its own response, so the
-- comparison costs no extra Shopify request. What it needs is somewhere to
-- record the outcome:
--
--   verifiedAt   when the value Shopify returned matched what we sent
--   verifyNote   plain-language reason when it did not, shown in Review
--
-- Both nullable with no default. NULL verifiedAt on an older row means "this
-- was published before verification existed", which is the truth — it is not
-- backfilled as verified, because nobody checked those.
--
-- The `status` column also gains a value, 'published_unverified'. No schema
-- change is needed for that (it is a String), but it is recorded here because
-- app/utils/productState.js had to learn the state or it would have fallen
-- through to 'needs_content' and a live product would have read as untouched.
--
-- A NEW migration file. Nothing already applied is edited — docs/RUNBOOK.md
-- Rule 1, and the 2026-09-09 incident that wrote it. IF NOT EXISTS so a re-run
-- is a no-op; additive and nullable, so it cannot break a running deploy.
ALTER TABLE "GeneratedContent" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "GeneratedContent" ADD COLUMN IF NOT EXISTS "verifyNote" TEXT;

-- Review lists rows needing a second look; this keeps that lookup off a scan.
CREATE INDEX IF NOT EXISTS "GeneratedContent_shop_verifyNote_idx"
  ON "GeneratedContent" ("shop", "verifyNote");
