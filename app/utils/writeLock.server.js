/**
 * Phase 14 item 1 — THE WRITE LOCK, AT THE ONE PLACE THE APP TALKS TO SHOPIFY.
 *
 * `REMEDIATION_LOCKED_SHOPS` names stores that are monitored but never written
 * to from here. Until 2026-09-16 that was enforced by `assertWritable(shop)` at
 * five call sites, **all of them inside `remediation.server.js`**. The four
 * other paths that write a merchant's catalogue — Review, the product page, a
 * bulk job and autopilot — imported neither `assertWritable` nor
 * `isRemediationLocked` (grep count 0 on each). So the lock stopped catalogue
 * *fixes* and nothing else, while the doctrine in `CW-STANDING-PROMPT.md` §2
 * read as an absolute. Cowork found the gap while explaining the secret to the
 * owner, who had just locked a store holding **a client's real catalogue**.
 *
 * Five call sites become six. A factory does not: there are exactly THREE ways
 * this app can obtain a Shopify GraphQL callable, and all three are wrapped —
 *
 *   1. `authenticate.admin(request)`   → every route (shopify.server.js)
 *   2. `unauthenticated.admin(shop)`   → llms.txt rendering (shopify.server.js)
 *   3. `shopifyGraphql(session)`       → the worker (bulkProcessor.server.js)
 *
 * so a route or job added next month is covered without touching this file.
 *
 * READS STAY OPEN, deliberately: a locked shop is still audited, scored,
 * walked nightly and shown on every screen. The lock is about writing, and a
 * store we cannot see is a store we cannot report on. `isMutationDocument`
 * (pure, in remediation.js) makes that distinction and is the whole decision.
 *
 * The lock is a development-time belt, not a property of the store: removing a
 * domain from the secret restores writing, which is what happens the day the
 * owner's client deliberately adopts the app.
 */
import logger from "./logger.server.js";
import { FIX_ERRORS, isLockedShop, isMutationDocument, parseLockedShops } from "./remediation.js";

/**
 * Read once at module load, like every other secret this app reads. `fly
 * secrets import` restarts the machine, so a changed lock is live on the next
 * boot and never mid-request — which is the behaviour we want from a guard.
 */
const LOCKED = parseLockedShops(process.env.REMEDIATION_LOCKED_SHOPS);

export class RemediationLocked extends Error {
  constructor(shop) {
    super(FIX_ERRORS.monitoredOnly);
    this.name = "RemediationLocked";
    this.shop = shop;
    this.locked = true;
  }
}

/** Throws before any write for a locked shop. The message is merchant-safe. */
export function assertWritable(shop) {
  if (isLockedShop(shop, LOCKED)) {
    logger.warn({ shop, event: "remediation_refused_locked" }, "remediation refused: locked shop");
    throw new RemediationLocked(shop);
  }
}

export function isRemediationLocked(shop) {
  return isLockedShop(shop, LOCKED);
}

/**
 * P3 (Phase 8) — is the lock CONFIGURED at all? The brief: nothing is
 * submitted to Bing "while REMEDIATION_LOCKED_SHOPS is unset". A lock that
 * does not exist protects nothing, so the holdout refuses to run until the
 * owner has set it — even to an empty list is not enough; it must be present.
 */
export function lockConfigured() {
  return typeof process.env.REMEDIATION_LOCKED_SHOPS === "string" && process.env.REMEDIATION_LOCKED_SHOPS.trim().length > 0;
}

/** The extensions code on a refusal, so a log or a test can tell it from Shopify's own errors. */
export const LOCKED_ERROR_CODE = "SHOP_WRITE_LOCKED";

/**
 * A refusal shaped exactly like a Shopify GraphQL failure, so every caller
 * already handles it.
 *
 * The first draft of this guard THREW. That is right for `assertWritable`,
 * whose one caller (`app.fix.jsx`) catches `RemediationLocked` and answers 403
 * — but wrong at the choke point, where the callers are eight route actions
 * and two jobs that do not catch. A throw there renders the error boundary:
 * "An unexpected error occurred", which is both a 500 and a lie, since nothing
 * unexpected happened.
 *
 * A top-level `errors` entry is what Shopify itself sends when it refuses an
 * operation outright, and this app has spent three phases making every caller
 * read that correctly (`readMutationResult`, `publishProductWithRetry`). So the
 * refusal travels the tested path: Review reports a failed publish and keeps
 * the draft, a bulk job logs "saved as a draft", the product page prints the
 * sentence. No call site changes, and no write leaves the process.
 */
function lockedResponse() {
  const body = {
    data: null,
    errors: [
      {
        message: FIX_ERRORS.monitoredOnly,
        extensions: { code: LOCKED_ERROR_CODE },
      },
    ],
  };
  return {
    status: 200,
    locked: true,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Did this GraphQL result come from our own lock rather than from Shopify? */
export function isLockedResult(json) {
  return (
    Array.isArray(json?.errors) &&
    json.errors.some((e) => e?.extensions?.code === LOCKED_ERROR_CODE)
  );
}

/**
 * Wrap an `admin.graphql`-shaped callable so a mutation against a locked shop
 * never leaves the process. Reads pass straight through, unwrapped in effect.
 *
 * Returns the SAME callable when the shop is not locked — no closure, no cost,
 * on the path every merchant uses.
 *
 * @param {(query: string, opts?: object) => Promise<any>} graphql
 * @param {string} shop
 */
export function guardShopWrites(graphql, shop) {
  if (typeof graphql !== "function") return graphql;
  if (!isLockedShop(shop, LOCKED)) return graphql;
  return async function guardedGraphql(query, ...rest) {
    if (isMutationDocument(query)) {
      logger.warn(
        { shop, event: "shopify_write_refused_locked" },
        "Shopify write refused: locked shop",
      );
      return lockedResponse();
    }
    return graphql(query, ...rest);
  };
}
