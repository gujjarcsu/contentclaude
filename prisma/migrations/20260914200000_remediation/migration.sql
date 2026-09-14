-- P2.6 — bulk remediation, with review. One column: the merchant's statement
-- that a product has no GTIN by design (own brand, handmade), so the finding
-- stops. Additive, defaulted, safe under a rolling deploy.
ALTER TABLE "ProductWatch" ADD COLUMN "gtinExempt" BOOLEAN NOT NULL DEFAULT false;
