/**
 * P5.2 — the store-scan cache key, and the invalidator that was missing.
 *
 * `startscan:<shop>` was the only cache key in this app that was written and
 * never cleared. Every other one has an invalidator — `bv:` on a settings save,
 * `plan:` and `canGenerate:` on a billing change, `catalogGaps:` through its
 * own helper, the llms.txt keys on a regeneration. This one did not, and it
 * backs the biggest number on the first screen a merchant sees.
 *
 * The consequence: a merchant publishes content, goes back to Home, and the
 * store score is the one from BEFORE they published, for up to ten minutes,
 * with nothing on screen saying so. That is the worst possible window to be
 * stale in — they have just done the thing the app exists to make them do, and
 * the number that proves it worked has not moved. The obvious reading is that
 * it did not work.
 *
 * ── Why this is its own module ─────────────────────────────────────────────
 *
 * The key lives with the invalidator so neither can drift from the other, and
 * the module is deliberately tiny: `startState.server.js` carries the scanner,
 * the GraphQL document and the scorer, and the three publish paths that need to
 * clear this cache have no business importing any of that. A route bundle
 * pulling in a catalogue scanner to delete a Redis key is how a small fix grows
 * a large blast radius.
 *
 * The alternative — writing the string `startscan:${shop}` at each call site —
 * is the defect P5.0 was spent fixing, one file over.
 */
import { invalidateCache } from "./cache.server.js";

/** The one definition. `startState.server.js` reads it too; nobody types it. */
export const storeScanKey = (shop) => `startscan:${shop}`;

/**
 * Drop the cached store scan so the next read of Home re-scores the catalogue.
 *
 * Never throws, and is never meant to be awaited into a merchant's critical
 * path: a stale score is a bad experience, and a publish that fails because a
 * cache delete failed is a worse one. Call it as `void invalidateStoreScan(shop)`.
 *
 * @returns {Promise<boolean>} whether the key was actually cleared
 */
export async function invalidateStoreScan(shop) {
  if (!shop) return false;
  try {
    await invalidateCache(storeScanKey(shop));
    return true;
  } catch {
    return false;
  }
}
