/**
 * P27 item 1 — the Shopify webhook door: what got in, what did not, and whether
 * silence means calm or means broken.
 *
 * The inside of every webhook handler on this rail is careful. The door was not.
 * A failed HMAC threw a bare 401 Response and that was the whole of it: no
 * counter, no ledger, no alarm, no trace. Proven on 18 September by posting one
 * deliberately wrong signature at the live door — it answered 401 and the
 * database gained exactly zero rows. So on 16 September, when the client secret
 * was wrong and every signature this app checked disagreed, the app could not
 * have told anyone, and afterwards could not say what it had refused.
 *
 * Three things live here.
 *
 *   1. recordDelivery — one ledger row per HMAC-verified arrival, written before
 *      the handler runs, ignored topics and duplicates included.
 *   2. The refusal counters, one per reason. An invalid HMAC raises itself,
 *      deduped to at most one email an hour. A missing or malformed header does
 *      NOT: the app is on a public URL and is scanned daily (3,000-odd probes
 *      for /wp-login.php and /.env in the last week), and an alarm that fires on
 *      a scanner is an alarm the owner learns to ignore.
 *   3. webhookDoorAlarm — silence read against traffic, never against a clock.
 *
 * NOTHING HERE MAY DESCRIBE THE SECRET. Not its value, not its length, not a
 * prefix, not a fingerprint. The only facts recorded are counts and the reason
 * strings below. A test asserts it.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { sendOperatorEmail } from "./notify.server.js";

/** Reason strings. These are the whole vocabulary of a refusal — see the note above. */
export const DOOR_REASONS = Object.freeze({
  BAD_METHOD: "not a POST",
  NO_SIGNATURE: "no signature header",
  BAD_SIGNATURE: "signature did not verify",
  BAD_SHOP_HEADER: "shop header is not a myshopify domain",
  MALFORMED_BODY: "body is not JSON",
  SHOP_MISMATCH: "signed payload names a different shop than the header",
  STALE: "delivery older than the backstop window",
});

/**
 * Per-process counters. This app runs three machines, so these are a per-machine
 * view and are stated as such wherever they are shown — the durable half of the
 * instrument is the ledger, which every machine writes to the same table.
 */
const counts = {
  badMethod: 0,
  noSignature: 0,
  badSignature: 0,
  badShopHeader: 0,
  malformedBody: 0,
  shopMismatch: 0,
  stale: 0,
  accepted: 0,
  duplicates: 0,
  ledgerWriteFailed: 0,
};
let firstRefusalAt = null;
let lastRefusalAt = null;

/** At most one operator email per key per hour. */
const ALARM_DEDUPE_MS = 60 * 60 * 1000;
const lastRaised = new Map();

async function raiseOncePerHour(key, subject, text, now) {
  const prev = lastRaised.get(key) ?? 0;
  if (now - prev < ALARM_DEDUPE_MS) return { sent: false, reason: "deduped" };
  lastRaised.set(key, now);
  logger.error({ event: "webhook_door_alarm", key }, subject);
  return sendOperatorEmail({ subject, text });
}

function mark(now) {
  if (firstRefusalAt === null) firstRefusalAt = now;
  lastRefusalAt = now;
}

/* ---- the counters ------------------------------------------------------- */

/** Anything but a POST. Counted, never paged — this is what a crawler does. */
export function doorBadMethod(now = Date.now()) {
  counts.badMethod++;
  mark(now);
  return DOOR_REASONS.BAD_METHOD;
}

/**
 * No x-shopify-hmac-sha256 at all, or no secret configured to check it with.
 * Counted, NEVER paged: every vulnerability scanner that finds the URL lands here.
 */
export function doorNoSignature(now = Date.now()) {
  counts.noSignature++;
  mark(now);
  return DOOR_REASONS.NO_SIGNATURE;
}

/**
 * A signature that was present and did not verify. This is the 16 September
 * shape, and the one worth an email: Shopify signs with the same client secret
 * authenticate.admin uses, so a run of these means either the secret is wrong or
 * somebody is forging. Deduped to one an hour.
 */
export function doorBadSignature(now = Date.now()) {
  counts.badSignature++;
  mark(now);
  void raiseOncePerHour(
    "shopify-bad-hmac",
    "Shopify webhook refused: signature did not verify",
    [
      "A webhook arrived carrying a signature that did not verify.",
      "",
      "Refused so far on this machine: " + counts.badSignature + ".",
      "",
      "Shopify signs webhooks with the same client secret the admin session check uses,",
      "so a run of these usually means the app's client secret no longer matches the one",
      "in the Partner dashboard — the 16 September failure. It can also mean a forgery.",
      "",
      "Billing state arrives on this rail. While it is refused, a merchant can change or",
      "cancel a subscription and this app will not know.",
      "",
      "Check: Partners → the app → Client credentials, against the SHOPIFY_API_SECRET",
      "Fly secret. Do not paste either value into a message.",
    ].join("\n"),
    now,
  );
  return DOOR_REASONS.BAD_SIGNATURE;
}

/** Valid-looking request whose shop header is not a myshopify domain. Counted only. */
export function doorBadShopHeader(now = Date.now()) {
  counts.badShopHeader++;
  mark(now);
  return DOOR_REASONS.BAD_SHOP_HEADER;
}

/** Signature verified but the body would not parse. Counted only. */
export function doorMalformedBody(now = Date.now()) {
  counts.malformedBody++;
  mark(now);
  return DOOR_REASONS.MALFORMED_BODY;
}

/**
 * The signature verified but the signed payload names a different shop than the
 * unsigned header. That is not a scanner — it needs a genuine signed body of
 * ours — so it IS paged, deduped hourly.
 */
export function doorShopMismatch(now = Date.now()) {
  counts.shopMismatch++;
  mark(now);
  void raiseOncePerHour(
    "shopify-shop-mismatch",
    "Shopify webhook refused: signed payload names a different shop than the header",
    [
      "A webhook arrived whose signature verified but whose signed body named a",
      "different shop than the x-shopify-shop-domain header.",
      "",
      "Refused so far on this machine: " + counts.shopMismatch + ".",
      "",
      "The HMAC covers the body only. Replaying a genuine signed body of ours under",
      "another merchant's domain is how app/uninstalled would be aimed at the wrong",
      "store. It was refused. This is worth looking at because it cannot happen by",
      "accident the way a scanner probe can.",
    ].join("\n"),
    now,
  );
  return DOOR_REASONS.SHOP_MISMATCH;
}

/** Older than the backstop window. Counted only — a retry storm is Shopify's, not an attack. */
export function doorStale(now = Date.now()) {
  counts.stale++;
  mark(now);
  return DOOR_REASONS.STALE;
}

/** Per-machine counters. Never contains anything derived from the secret. */
export function doorCounts() {
  return {
    ...counts,
    refusedTotal:
      counts.badMethod +
      counts.noSignature +
      counts.badSignature +
      counts.badShopHeader +
      counts.malformedBody +
      counts.shopMismatch +
      counts.stale,
    firstRefusalAt,
    lastRefusalAt,
    note: "per-process; this app runs more than one machine. The ledger is the durable record.",
  };
}

/** Test seam only. */
export function __resetDoor() {
  for (const k of Object.keys(counts)) counts[k] = 0;
  firstRefusalAt = null;
  lastRefusalAt = null;
  lastRaised.clear();
}

/* ---- the ledger --------------------------------------------------------- */

/**
 * One row per HMAC-verified arrival, written before the handler runs.
 *
 * Never throws and never rejects a delivery: a webhook that Shopify signed
 * correctly must not be refused because our own bookkeeping had a bad minute.
 * A failed write is counted so the gap is visible rather than silent.
 */
export async function recordDelivery({ webhookId, topic, shop, apiVersion, triggeredAt, duplicate, bodyBytes }) {
  if (duplicate) counts.duplicates++;
  else counts.accepted++;
  try {
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhookId ?? null,
        topic: String(topic || "").toLowerCase(),
        shop,
        apiVersion: apiVersion ?? null,
        triggeredAt: triggeredAt ? new Date(triggeredAt) : null,
        duplicate: Boolean(duplicate),
        bodyBytes: Number.isFinite(bodyBytes) ? bodyBytes : null,
      },
    });
    return true;
  } catch (err) {
    counts.ledgerWriteFailed++;
    logger.warn(
      { shop, topic, err: err.message, event: "webhook_ledger_write_failed" },
      "Webhook ledger write failed",
    );
    return false;
  }
}

/** Mark a delivery as one a route actually handled. Best-effort, never throws. */
export async function markDeliveryHandled(webhookId, shop) {
  if (!webhookId) return false;
  try {
    const r = await prisma.webhookDelivery.updateMany({
      where: { webhookId, shop, handled: false },
      data: { handled: true },
    });
    return r.count > 0;
  } catch {
    return false;
  }
}

/**
 * Has this webhook id been seen before, according to the ledger?
 *
 * The durable half of duplicate detection. The Redis claim is still the fast
 * path; this is what answers when Redis is absent, which previously meant every
 * redelivery was treated as fresh.
 */
export async function ledgerHasSeen(shop, webhookId) {
  if (!webhookId) return false;
  try {
    const n = await prisma.webhookDelivery.count({ where: { shop, webhookId } });
    return n > 0;
  } catch {
    return false;
  }
}

/* ---- silence read against traffic --------------------------------------- */

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * What the door has done lately, and whether its silence means anything.
 *
 * The distinction this exists for: "no webhooks in 24 hours" is unremarkable for
 * an app whose shops are all idle, and is an emergency for an app that gained
 * two installs and a plan change in the same period. So the answer is an explicit
 * "unmeasured" rather than a calm zero unless there is traffic to measure it
 * against — the same shape the Stripe door already uses.
 *
 * Traffic here is what Shopify would have had a reason to tell us about:
 * installs (Shop rows) and subscription activity (Plan rows created or changed).
 */
export async function webhookDoor(now = Date.now()) {
  const since = new Date(now - WINDOW_MS);
  const [arrivals, lastArrival, byTopic, installs, planMoves] = await Promise.all([
    prisma.webhookDelivery.count({ where: { receivedAt: { gte: since } } }).catch(() => null),
    prisma.webhookDelivery
      .findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true, topic: true } })
      .catch(() => null),
    prisma.webhookDelivery
      .groupBy({ by: ["topic"], where: { receivedAt: { gte: since } }, _count: { _all: true } })
      .catch(() => []),
    prisma.shop.count({ where: { installedAt: { gte: since } } }).catch(() => 0),
    prisma.plan.count({ where: { updatedAt: { gte: since } } }).catch(() => 0),
  ]);

  const traffic = (installs ?? 0) + (planMoves ?? 0);
  const arrivalsState =
    arrivals === null
      ? { state: "unmeasured", why: "the ledger could not be read" }
      : arrivals > 0
        ? { state: "measured", value: arrivals }
        : traffic > 0
          ? { state: "measured", value: 0 }
          : {
              state: "unmeasured",
              why: "no install and no subscription change in 24 hours — there was nothing for Shopify to send",
            };

  return {
    windowHours: WINDOW_MS / 3600000,
    arrivals: arrivalsState,
    traffic: { installs: installs ?? 0, planMoves: planMoves ?? 0, total: traffic },
    lastArrival: lastArrival ? { at: lastArrival.receivedAt.toISOString(), topic: lastArrival.topic } : null,
    byTopic: (byTopic || []).map((r) => ({ topic: r.topic, n: r._count._all })).sort((a, b) => b.n - a.n),
    counts: doorCounts(),
  };
}

/**
 * One sentence, or null when there is nothing wrong. A bad signature outranks a
 * quiet door, because a quiet door is a symptom and a bad signature is a cause.
 */
export async function webhookDoorAlarm(now = Date.now()) {
  const d = await webhookDoor(now);
  const n = d.counts.badSignature;
  if (n > 0) {
    return (
      "money · " +
      n +
      " Shopify webhook" +
      (n === 1 ? " was" : "s were") +
      " refused for a bad signature. Billing state arrives on this rail, so subscription changes are not being recorded."
    );
  }
  const m = d.counts.shopMismatch;
  if (m > 0) {
    return (
      "money · " +
      m +
      " Shopify webhook" +
      (m === 1 ? "" : "s") +
      " named a different shop than the signature covered, and " +
      (m === 1 ? "was" : "were") +
      " refused."
    );
  }
  if (d.arrivals.state === "measured" && d.arrivals.value === 0 && d.traffic.total > 0) {
    const bits = [];
    if (d.traffic.installs) bits.push(d.traffic.installs + " install" + (d.traffic.installs === 1 ? "" : "s"));
    if (d.traffic.planMoves) bits.push(d.traffic.planMoves + " plan change" + (d.traffic.planMoves === 1 ? "" : "s"));
    return (
      "money · " +
      bits.join(" and ") +
      " in the last 24 hours and not one Shopify webhook arrived. The door is not being reached."
    );
  }
  return null;
}
