-- Phase 4 item 4.3 — before/after score, per product and for the store.
--
-- The merchant's proof that the app worked. Until now the app could say how
-- many products it had touched, which is activity, not outcome. "Your store
-- scored 61 when you installed and scores 84 now" is an outcome, and it is the
-- honest trigger for the review ask.
--
-- ProductScore, one row per product:
--   scoreBefore   the product's combined GEO+SEO score the first time we saw
--                 it, captured BEFORE we generated anything for it
--   scoreAfter    its score the last time a catalogue scan looked at it
--
-- scoreBefore is first-writer-wins and never updated. That is the whole point:
-- a "before" that moves is not a before. scoreAfter is refreshed by the scan
-- that already scores every product for the Start state, so keeping it current
-- costs no extra Shopify request.
--
-- Both nullable. A product we have never scored has no row, and a row with a
-- before and no after has been seen once — neither is invented as zero, which
-- would put a fabricated "0 → 84" in front of a merchant.
--
-- On Shop, the store-level pair:
--   storeScoreAtInstall     the store's average the first time we scanned it
--   storeScoreAtInstallAt   when that was, so "since install" can be dated
--
-- A NEW migration file; nothing already applied is edited (docs/RUNBOOK.md
-- Rule 1). IF NOT EXISTS throughout so a re-run is a no-op.
CREATE TABLE IF NOT EXISTS "ProductScore" (
  "id"          TEXT NOT NULL,
  "shop"        TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "productTitle" TEXT NOT NULL DEFAULT '',
  "scoreBefore" INTEGER,
  "scoreAfter"  INTEGER,
  "geoBefore"   INTEGER,
  "seoBefore"   INTEGER,
  "geoAfter"    INTEGER,
  "seoAfter"    INTEGER,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductScore_shop_productId_key"
  ON "ProductScore" ("shop", "productId");
CREATE INDEX IF NOT EXISTS "ProductScore_shop_idx" ON "ProductScore" ("shop");

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "storeScoreAtInstall" INTEGER;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "storeScoreAtInstallAt" TIMESTAMP(3);
