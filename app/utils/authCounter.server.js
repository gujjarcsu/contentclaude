/**
 * authCounter.server.js — the live signal a self-check cannot produce.
 *
 * `checkSessionTokenSecret()` proves this build can verify a token it signed itself. With the WRONG
 * secret that still passes perfectly, which is exactly how the 2026-09-16 outage stayed invisible.
 * The one in-process observable that separates "right secret" from "wrong secret" is the rejection
 * rate at the door: with a wrong secret, authentication does not degrade, it fails for everybody.
 *
 * So the single wrapped choke point in shopify.server.js counts attempts and rejections into a
 * rolling ten-minute window, and the deep health check reads it. In-memory on purpose: it must
 * survive Redis being down, because "Redis is down" is one of the states this is here to see
 * through. Per-process, so a two-machine deployment gives two views of the same truth rather than
 * one averaged one — and either machine alone is enough to raise it.
 *
 * Counts only. No shop, no token, no secret, nothing identifying.
 */
const WINDOW_MS = 10 * 60 * 1000;
let bucket = { since: Date.now(), attempts: 0, rejected: 0 };

function roll() {
  if (Date.now() - bucket.since > WINDOW_MS) bucket = { since: Date.now(), attempts: 0, rejected: 0 };
}

export function authAttempt() { roll(); bucket.attempts++; }
export function authRejected() { roll(); bucket.rejected++; }

/** Shape the health check reads. Never throws. */
export async function readAuthCounter() {
  roll();
  return { attempts: bucket.attempts, rejected: bucket.rejected, windowMs: WINDOW_MS };
}
