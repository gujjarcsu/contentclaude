-- P2.5 — the one check no app can make. Search Console's "Search generative AI
-- control" (worldwide 31 Aug 2026) has no API — verified 2026-09-14 against the
-- Search Console API v1 reference index, which lists searchanalytics.query,
-- sitemaps.*, sites.* and urlInspection.index.inspect and nothing else — so the
-- merchant answers one question and we keep the answer and its date. Two
-- nullable columns, additive, no backfill: safe under a rolling deploy.
ALTER TABLE "GrowthState" ADD COLUMN "gscAiControl" TEXT;
ALTER TABLE "GrowthState" ADD COLUMN "gscAiControlAt" TIMESTAMP(3);
