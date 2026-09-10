/**
 * A2.3 — walking a catalogue, and saying so when you stopped early.
 *
 * Two screens each had their own copy of this loop, and they had drifted:
 *
 *   `app.products.jsx`  went through `shopifyQuery`, so a throttle backed off
 *                       and retried (Phase 4 item 6).
 *   `app.optimize.jsx`  used raw `admin.graphql`. The same fix was applied to
 *                       one and missed on the other, so the FIRST throttle
 *                       silently truncated a bulk run: the merchant asked to
 *                       optimize everything and got whatever had been read
 *                       before Shopify said no.
 *
 * Both also stopped at `MAX_PAGES = 80` — 20,000 products — **and said nothing**.
 * On a 50,000-product catalogue "Optimize store" would enqueue at most 20,000
 * and report success. That is a cap presented as a total (L5) on the one action
 * that spends a merchant's money.
 *
 * So this is one enumerator, used by both, and its result carries WHY it
 * stopped. A caller that ignores `truncated` is a bug the tests can see.
 */
import { shopifyQuery } from "./shopifyQuery.server.js";
import { productsPage } from "./shopifyQuery.server.js";

/** Shopify's ceiling for a products connection. */
export const ENUM_PAGE_SIZE = 250;

/**
 * How many pages one enumeration will walk.
 *
 * 80 pages x 250 = 20,000 products. Chosen to bound a loader, not because a
 * catalogue stops there — which is exactly why exceeding it must be REPORTED
 * rather than absorbed.
 */
export const ENUM_MAX_PAGES = 80;

/**
 * A2.5 — the wall-clock bound, because the page cap is not one.
 *
 * 80 sequential requests cost 6 ms of OUR loop and an unmeasured amount of
 * network. At a realistic 100-300 ms per Shopify round trip that is 8-24
 * seconds inside a form action, with the merchant watching a spinner and no
 * request timeout configured anywhere to stop it.
 *
 * So the walk is bounded by TIME as well as pages, which is the pattern
 * `catalogGaps.server.js` already uses (`budgetMs = 4000`). Hitting the budget
 * is reported exactly like hitting the page cap — it is the same promise
 * (we did not cover everything) with a different cause.
 *
 * 20 s: comfortably more than a healthy 80-page walk needs, and short enough
 * that a slow day ends in a message rather than an abandoned tab.
 */
export const ENUM_BUDGET_MS = 20_000;

export const ENUM_STOP = Object.freeze({
  COMPLETE: "complete",
  PAGE_CAP: "page_cap",
  TIME_BUDGET: "time_budget",
  THROTTLED: "throttled",
  ERROR: "error",
});

/**
 * Walk a shop's products, newest-updated first, returning ids.
 *
 * Never throws. Always says how it finished.
 *
 * @returns {Promise<{ids: string[], stop: string, pages: number, truncated: boolean,
 *   throttled: boolean, message: string|null}>}
 */
export async function enumerateProductIds(
  graphql,
  {
    shop,
    query = null,
    maxPages = ENUM_MAX_PAGES,
    budgetMs = ENUM_BUDGET_MS,
    select = null,
    label = "enumerate products",
    now = () => Date.now(),
  } = {},
) {
  const startedAt = now();
  const ids = [];
  const nodes = [];
  let cursor = null;
  let hasNextPage = true;
  let pages = 0;
  let stop = ENUM_STOP.COMPLETE;
  let throttled = false;
  // `shopifyQuery`'s own reason: throttled / no_data / transport / errors. A
  // throttle, a malformed response and a dead connection need different words,
  // and collapsing them into one "error" loses the caller's ability to say
  // anything specific.
  let reason = null;

  const gql = `query enumerateProducts($cursor: String, $q: String) {
  products(first: ${ENUM_PAGE_SIZE}, after: $cursor, sortKey: UPDATED_AT, reverse: true, query: $q) {
    pageInfo { hasNextPage endCursor }
    edges { node { id description(truncateAt: 20) } }
  }
}`;

  while (hasNextPage) {
    if (pages >= maxPages) {
      stop = ENUM_STOP.PAGE_CAP;
      break;
    }
    // Checked BEFORE the request, not after: stopping after the request that
    // blew the budget would still have paid for it.
    if (pages > 0 && now() - startedAt >= budgetMs) {
      stop = ENUM_STOP.TIME_BUDGET;
      break;
    }
    pages += 1;

    const res = await shopifyQuery(graphql, gql, { cursor, q: query }, { shop, label });
    const page = productsPage(res);
    if (!page.ok) {
      throttled = !!page.throttled;
      reason = page.reason ?? "no_data";
      stop = throttled ? ENUM_STOP.THROTTLED : ENUM_STOP.ERROR;
      break;
    }

    for (const { node } of page.edges) {
      if (typeof select === "function" && !select(node)) continue;
      ids.push(node.id);
      nodes.push(node);
    }
    hasNextPage = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor ?? null;
  }

  const truncated = stop !== ENUM_STOP.COMPLETE;

  return {
    ids,
    nodes,
    pages,
    stop,
    truncated,
    throttled,
    reason,
    message: describeStop(stop, ids.length),
  };
}

/**
 * What the merchant is told. Null when nothing was cut short — a message that
 * always appears is one nobody reads.
 */
export function describeStop(stop, count) {
  if (stop === ENUM_STOP.COMPLETE) return null;
  if (stop === ENUM_STOP.PAGE_CAP) {
    return `This run covers the ${count} most recently updated products. Your catalog is larger than one run can cover, so run it again afterwards to reach the rest.`;
  }
  if (stop === ENUM_STOP.TIME_BUDGET) {
    return `Reading your catalog was taking a while, so this run covers the ${count} most recently updated products. Run it again to reach the rest.`;
  }
  if (stop === ENUM_STOP.THROTTLED) {
    return `Shopify started rate-limiting your store part-way through, so this run covers ${count} products rather than your whole catalog. Run it again in a few minutes to reach the rest.`;
  }
  return `Shopify stopped answering part-way through, so this run covers ${count} products rather than your whole catalog.`;
}
