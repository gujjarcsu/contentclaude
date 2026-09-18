-- P27 item 1 — a durable ledger of every HMAC-verified webhook delivery.
--
-- Before this table the Shopify rail recorded nothing about arrivals. Duplicate
-- detection was a Redis claim key with a TTL; when Redis was absent every
-- redelivery was treated as fresh, and when Redis was present the record of the
-- arrival vanished with the key. So "did the billing webhook arrive on the 16th"
-- had no answer anywhere in the system — only Shopify knew.
--
-- One row per delivery that passed the HMAC check, written BEFORE the handler
-- runs, including topics this app ignores. Duplicates are rows too: a
-- redelivery is a fact about Shopify's retry behaviour worth keeping.

CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT,
    "topic" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "apiVersion" TEXT,
    "triggeredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "bodyBytes" INTEGER,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- "what arrived in the last hour", the retention sweep, and the silence alarm.
CREATE INDEX "WebhookDelivery_receivedAt_idx" ON "WebhookDelivery"("receivedAt");
-- "what has this shop sent us", used by the reconciliation.
CREATE INDEX "WebhookDelivery_shop_receivedAt_idx" ON "WebhookDelivery"("shop", "receivedAt");
-- "has any billing webhook arrived at all", which is the question that started this.
CREATE INDEX "WebhookDelivery_topic_receivedAt_idx" ON "WebhookDelivery"("topic", "receivedAt");
-- The durable half of duplicate detection: when Redis is unavailable the ledger
-- answers "have we seen this webhook id from this shop before".
CREATE INDEX "WebhookDelivery_webhookId_shop_idx" ON "WebhookDelivery"("webhookId", "shop");
