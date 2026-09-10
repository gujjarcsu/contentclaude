-- INFRA2 — durable log retention.
--
-- New file, new name. Nothing here edits an applied migration (L8).
--
-- Additive only: a new table and its indexes. No existing table is touched, so
-- the old build keeps serving normally while this is applied.
CREATE TABLE IF NOT EXISTS "LogEvent" (
    "id"        TEXT NOT NULL,
    "level"     TEXT NOT NULL,
    "event"     TEXT,
    "shop"      TEXT,
    "msg"       TEXT NOT NULL,
    "data"      JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LogEvent_createdAt_idx"        ON "LogEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "LogEvent_shop_createdAt_idx"   ON "LogEvent"("shop", "createdAt");
CREATE INDEX IF NOT EXISTS "LogEvent_event_createdAt_idx"  ON "LogEvent"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "LogEvent_level_createdAt_idx"  ON "LogEvent"("level", "createdAt");
