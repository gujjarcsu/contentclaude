-- Phase 11 Part B — who a shop is, explicitly: ours | shopify | real | unclassified.
-- Additive with a default, so every existing row reads unclassified until it is
-- classified; nothing is inferred into the column. Safe under a rolling deploy.
ALTER TABLE "Shop" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'unclassified';
