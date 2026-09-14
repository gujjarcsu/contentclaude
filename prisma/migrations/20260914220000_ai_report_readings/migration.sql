-- P3.3 (Phase 8) — the two AI-visibility reports that have no API. One JSON
-- column on GrowthState holding what the merchant read, with dates. We teach
-- the report; we never scrape it. Additive, defaulted, safe under a rolling deploy.
ALTER TABLE "GrowthState" ADD COLUMN "aiReportReadings" TEXT NOT NULL DEFAULT '{}';
