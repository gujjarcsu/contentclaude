-- C0.7 / P5.5 — bring-your-own AI key at Pro.
--
-- Five nullable columns, no default, no backfill: every existing row keeps a
-- NULL key and the feature is simply off for them. Additive and safe under a
-- rolling deploy, which matters because there is a live paid subscriber on this
-- app (B8, 2026-09-14) and machines serving the old build must keep working
-- while these columns exist.
--
-- Deliberately absent: any column holding a prefix, a last-4 or a length of the
-- merchant's key. 04-DECISIONS.md: "not the key, not a prefix, not a length."
ALTER TABLE "Shop" ADD COLUMN "aiKeyCiphertext" TEXT;
ALTER TABLE "Shop" ADD COLUMN "aiKeyIv" TEXT;
ALTER TABLE "Shop" ADD COLUMN "aiKeyTag" TEXT;
ALTER TABLE "Shop" ADD COLUMN "aiKeyValidatedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "aiKeyFailedAt" TIMESTAMP(3);
