-- P6.2 — a merchant's question, recorded before it is emailed.
--
-- The listing promises "Email support from the founder" and "Questions answered
-- within 1 business day". A mailto: link is not a mechanism behind that: if the
-- merchant's mail client is unconfigured, or Resend is down, or it lands in
-- spam, nobody knows a question was asked. The row is the record; the email is
-- an attempt on top of it.
--
-- New table, no backfill, nothing else touched — safe under a rolling deploy
-- with a live paid subscriber on the app.
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "replyTo" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "planName" TEXT,
    "appSha" TEXT,
    "emailedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportRequest_shop_idx" ON "SupportRequest"("shop");
CREATE INDEX "SupportRequest_status_createdAt_idx" ON "SupportRequest"("status", "createdAt");
CREATE INDEX "SupportRequest_emailedAt_idx" ON "SupportRequest"("emailedAt");
