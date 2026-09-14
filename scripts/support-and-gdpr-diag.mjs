#!/usr/bin/env node
/**
 * P6.2 — two questions about production that the owner has to be able to ask.
 *
 * 1. **Is anybody waiting on a reply?** The listing promises one business day.
 *    A promise with no way to see what is outstanding is a promise nobody can
 *    keep — and the worst case is not "slow", it is a question that was STORED
 *    and never EMAILED, which is invisible unless something looks for it.
 *
 * 2. **Do the GDPR webhooks actually DO something?** Returning 200 is what an
 *    empty handler does too. `customers/data_request` and `customers/redact`
 *    are required for submission and are the easiest pair in the app to fake
 *    without noticing, because a handler that returns 200 and writes nothing
 *    passes every delivery check Shopify runs.
 *
 * READ ONLY. It writes nothing.
 *
 * PRIVACY. It prints counts, shop HANDLES with the domain stripped, and
 * subjects. It prints **no merchant email address and no message body** — those
 * belong in the inbox, not in a CI log.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/support-and-gdpr-diag.mjs"
 */
import prisma from "../app/db.server.js";

const handle = (s) => String(s ?? "").replace(/\.myshopify\.com$/, "");
const out = { readAt: new Date().toISOString() };

// ── 1. Support ─────────────────────────────────────────────────────────────
const open = await prisma.supportRequest.findMany({
  where: { status: "open" },
  orderBy: { createdAt: "asc" },
  take: 50,
  select: { id: true, shop: true, subject: true, planName: true, emailedAt: true, createdAt: true },
});

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

out.support = {
  open: open.length,
  // THE ONE THAT MATTERS MOST: stored, but the email never went. Nobody knows
  // these exist unless something asks.
  storedButNotEmailed: open.filter((r) => !r.emailedAt).length,
  // The promise is one business day. Anything past that is already late.
  olderThanOneDay: open.filter((r) => now - new Date(r.createdAt).getTime() > DAY).length,
  oldest: open[0] ? { ageHours: Math.round((now - new Date(open[0].createdAt).getTime()) / 3600000) } : null,
  // No email address, no message body.
  queue: open.map((r) => ({
    ref: r.id,
    shop: handle(r.shop),
    plan: r.planName ?? "unknown",
    subject: r.subject,
    emailed: !!r.emailedAt,
    ageHours: Math.round((now - new Date(r.createdAt).getTime()) / 3600000),
  })),
};

// ── 2. GDPR ────────────────────────────────────────────────────────────────
const byType = await prisma.gDPRRequest.groupBy({
  by: ["requestType"],
  _count: { requestType: true },
  _max: { processedAt: true },
});

const EXPECTED = ["customer_data_request", "customer_redact", "shop_redact"];
const seen = Object.fromEntries(
  byType.map((r) => [r.requestType, { rows: r._count.requestType, mostRecent: r._max.processedAt }]),
);

out.gdpr = {
  // A handler that returns 200 and writes nothing looks identical to a working
  // one from Shopify's side. A row is the difference between "delivered" and
  // "did something".
  rowsWrittenByType: Object.fromEntries(
    EXPECTED.map((t) => [
      t,
      seen[t]
        ? { rows: seen[t].rows, mostRecent: seen[t].mostRecent }
        : { rows: 0, mostRecent: null, note: "NEVER DELIVERED — unproven, not broken" },
    ]),
  ),
  totalRows: byType.reduce((n, r) => n + r._count.requestType, 0),
};

// Does the audit row hold what it should, and NOT hold what it must not?
const sample = await prisma.gDPRRequest.findFirst({
  where: { requestType: "customer_redact" },
  orderBy: { processedAt: "desc" },
  select: { payload: true },
});
if (sample) {
  let parsed = null;
  try {
    parsed = JSON.parse(sample.payload);
  } catch {
    parsed = null;
  }
  out.gdpr.auditRowShape = {
    fields: parsed ? Object.keys(parsed).sort() : null,
    // The handler's own claim, checked: Shopify's payload carries the customer's
    // email and phone, and persisting them verbatim would make this table the
    // one place in the app holding customer PII — contradicting its purpose.
    holdsNoCustomerEmail: parsed ? !JSON.stringify(parsed).match(/@/) : null,
  };
}

// ── 3. Review ask — has the mechanism ever FIRED? ──────────────────────────────────
// P7 C1. reviewAsk.server.js exists and meets the rules on paper; a mechanism
// that has never run is indistinguishable from one that does not exist.
// Counts by outcome code, and how many shops have ever been asked. No shop.
const asks = await prisma.reviewRequestAttempt.groupBy({
  by: ["code"],
  _count: { code: true },
});
const askedShops = await prisma.reviewRequestAttempt.findMany({ distinct: ["shop"], select: { shop: true } });
out.reviewAsk = {
  attempts: asks.reduce((n, r) => n + r._count.code, 0),
  shopsEverAsked: askedShops.length,
  byCode: Object.fromEntries(asks.map((r) => [r.code ?? "pending", r._count.code])),
};

out.verdict = [
  out.support.storedButNotEmailed > 0
    ? `${out.support.storedButNotEmailed} support question(s) STORED BUT NEVER EMAILED — pick these up.`
    : "No support question is stuck unemailed.",
  out.support.olderThanOneDay > 0
    ? `${out.support.olderThanOneDay} open past one business day.`
    : "Nothing open past one business day.",
  `GDPR audit rows: ${out.gdpr.totalRows}. A type showing 0 has never been DELIVERED — that is unproven, not broken.`,
  out.reviewAsk.attempts > 0
    ? `Review ask has fired ${out.reviewAsk.attempts} time(s) across ${out.reviewAsk.shopsEverAsked} shop(s).`
    : "Review ask has NEVER fired in production — the mechanism is unproven.",
].join(" ");

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
