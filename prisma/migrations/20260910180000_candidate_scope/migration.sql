-- Group 1.2 — the drafts opt-in for the candidate primitive.
--
-- New file, new name. Nothing here edits an applied migration.
--
-- Nullable-with-default and no backfill: every existing shop keeps the safe
-- behaviour (active products only) without a data migration, and a shop that
-- wants drafts included opts in from Settings.
ALTER TABLE "BrandVoice" ADD COLUMN IF NOT EXISTS "includeDraftProducts" BOOLEAN NOT NULL DEFAULT false;
