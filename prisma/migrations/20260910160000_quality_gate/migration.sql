-- Phase 4 item 4.1 — the quality gate.
--
--   simhash      64-bit fingerprint of the product-agnostic text, hex. This is
--                what makes the duplicate check affordable: comparing a new
--                description against the shop's recent work costs 16 bytes per
--                row instead of loading the descriptions themselves, and turns
--                an O(N^2) text comparison into a bounded set of integer
--                distances.
--   qualityNote  plain-language reason a draft was flagged "needs a look".
--                NULL means it passed the gate.
--
-- Both nullable, no backfill. A row written before the gate existed has no
-- fingerprint and no note, which is the truth: it was never assessed. It is
-- excluded from duplicate comparison rather than treated as unique, because
-- treating unknown as unique is how a duplicate check silently stops working.
--
-- The index is (shop, updatedAt) because the comparison window is "this shop's
-- most recent N descriptions", which is the query it has to serve.
--
-- NEW migration file; nothing applied is edited (docs/RUNBOOK.md Rule 1).
ALTER TABLE "GeneratedContent" ADD COLUMN IF NOT EXISTS "simhash" TEXT;
ALTER TABLE "GeneratedContent" ADD COLUMN IF NOT EXISTS "qualityNote" TEXT;

CREATE INDEX IF NOT EXISTS "GeneratedContent_shop_contentType_updatedAt_idx"
  ON "GeneratedContent" ("shop", "contentType", "updatedAt" DESC);
