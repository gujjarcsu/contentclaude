-- P2.3 / P2.2 / P2.1 — the catalogue watch.
--
-- ProductWatch: one row per product the daily watch has seen — the last
-- snapshot it took (capped description length, type, alt text, handle) and the
-- set of things that currently need the merchant, as JSON. CrawlerAccess: one
-- row per shop per run so a change in what a crawler can reach is a diff, not
-- a guess. Both additive, no backfill, no existing table touched — safe under a
-- rolling deploy.
CREATE TABLE "ProductWatch" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "handle" TEXT NOT NULL DEFAULT '',
    "descLen" INTEGER NOT NULL DEFAULT 0,
    "hasType" BOOLEAN NOT NULL DEFAULT false,
    "hasAlt" BOOLEAN NOT NULL DEFAULT false,
    "createdAtShop" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attention" TEXT NOT NULL DEFAULT '{}',
    "grade" TEXT,
    "blocking" INTEGER NOT NULL DEFAULT 0,
    "degrading" INTEGER NOT NULL DEFAULT 0,
    "cosmetic" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductWatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductWatch_shop_productId_key" ON "ProductWatch"("shop", "productId");
CREATE INDEX "ProductWatch_shop_lastSeenAt_idx" ON "ProductWatch"("shop", "lastSeenAt");

CREATE TABLE "CrawlerAccess" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "results" TEXT NOT NULL DEFAULT '{}',
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "robotsSeen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CrawlerAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrawlerAccess_shop_checkedAt_idx" ON "CrawlerAccess"("shop", "checkedAt");
