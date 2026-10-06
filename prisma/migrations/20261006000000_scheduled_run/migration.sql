-- P38 — scheduled-job claims move from Redis to Postgres. See the ScheduledRun
-- model in schema.prisma for why. Additive only: a new table, nothing altered.

CREATE TABLE "ScheduledRun" (
    "job" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledRun_pkey" PRIMARY KEY ("job","period")
);
