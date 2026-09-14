-- A2 — retire the baselines that were taken on a rubric that no longer exists.
--
-- New file, new name. Nothing here edits an applied migration (L8).
--
-- WHY. Until 2026-09-14 the store score was Math.round((seo + geo) / 2) — an
-- average of two rubrics. Home reported that average while the SEO Audit
-- reported calculateSeoScore alone, which is why the same store read 48 on one
-- screen and 90 on the other in the same minute.
--
-- The store score is now the single reviewed rubric (geoRubric.js, rebuilt in
-- P1.3 on what W1 measured). Every stored baseline below was captured on the old
-- averaged scale.
--
-- THE THING THIS MIGRATION REFUSES TO DO is re-point those numbers at the new
-- scale. A baseline is a claim about a moment in the past; rewriting it to a
-- number that was never measured would manufacture a delta the merchant never
-- earned. storeScore.server.js is explicit that a missing baseline returns
-- { available: false } and Home shows NOTHING, precisely because "0 -> 84" is
-- the most persuasive lie the app could tell. A WRONG delta is worse than no
-- delta, so these are nulled and the next scan re-stamps them honestly.
--
-- Both are self-healing, by design that already exists:
--   Shop.storeScoreAtInstall   — getStoreScore() re-stamps via an updateMany
--                                gated on `storeScoreAtInstall: null`
--                                (first-writer-wins), so the next dashboard load
--                                captures a fresh baseline on the new scale.
--   ProductScore               — recordProductScores() upserts with the before
--                                fields in CREATE only, so the rows must be
--                                removed rather than nulled: a nulled
--                                scoreBefore could never be set again, and the
--                                per-product delta would be gone for ever.
--                                Deleting lets the next scan recreate each row
--                                with before = after = the new score, which is
--                                an honest fresh baseline.
--
-- No merchant-owned data is touched. ProductScore is our own scoreboard, not
-- anything in the merchant's Shopify catalogue (L7).

UPDATE "Shop"
   SET "storeScoreAtInstall"   = NULL,
       "storeScoreAtInstallAt" = NULL
 WHERE "storeScoreAtInstall" IS NOT NULL;

DELETE FROM "ProductScore";
