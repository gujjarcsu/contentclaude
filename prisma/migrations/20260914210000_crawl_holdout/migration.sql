-- P3.1 / P3.2 / P3.6 (Phase 8) — the crawl-time holdout and the Bing key.
--
-- Shop: the merchant's Bing Webmaster API key, encrypted like the AI key; the
-- site as Bing knows it; the merchant's switch; the proof milestone the review
-- ask is gated on; when the weekly report last went. CrawlExperiment: one per
-- shop per batch of changed URLs, with its seed. CrawlExperimentUrl: one per
-- URL, its arm and the times. All additive, no backfill: safe under a rolling
-- deploy.
ALTER TABLE "Shop" ADD COLUMN "bingKeyCiphertext" TEXT;
ALTER TABLE "Shop" ADD COLUMN "bingKeyIv" TEXT;
ALTER TABLE "Shop" ADD COLUMN "bingKeyTag" TEXT;
ALTER TABLE "Shop" ADD COLUMN "bingKeyValidatedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "bingSiteUrl" TEXT;
ALTER TABLE "Shop" ADD COLUMN "bingEnabledAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "provedResultAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "lastWeeklyReportAt" TIMESTAMP(3);

CREATE TABLE "CrawlExperiment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "summary" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlExperiment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrawlExperiment_shop_status_idx" ON "CrawlExperiment"("shop", "status");
CREATE INDEX "CrawlExperiment_shop_startedAt_idx" ON "CrawlExperiment"("shop", "startedAt");

CREATE TABLE "CrawlExperimentUrl" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "arm" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "firstCrawledAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "bingStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlExperimentUrl_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrawlExperimentUrl_experimentId_url_key" ON "CrawlExperimentUrl"("experimentId", "url");
CREATE INDEX "CrawlExperimentUrl_shop_experimentId_idx" ON "CrawlExperimentUrl"("shop", "experimentId");
CREATE INDEX "CrawlExperimentUrl_shop_firstCrawledAt_idx" ON "CrawlExperimentUrl"("shop", "firstCrawledAt");
ALTER TABLE "CrawlExperimentUrl" ADD CONSTRAINT "CrawlExperimentUrl_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "CrawlExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
