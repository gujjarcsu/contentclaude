/**
 * Which UsageRecord the generation running right now belongs to.
 *
 * THE PROBLEM THIS SOLVES. `UsageRecord.tokensUsed` is a column that exists, is
 * typed, is indexed and is named as if it measures something — and it is written
 * as the LITERAL 0 at both of the only two places it is ever written. It has
 * never held a real value. A column that looks like data but is always zero is
 * worse than no column: it is a trap for whoever queries it next.
 *
 * WHY NOT A SIMPLE OBSERVER. `ai.server.js` already emits every call's real
 * token counts, and it would be easy to point a module-level callback at the
 * database. That would be WRONG: the bulk processor runs generations
 * concurrently, a single module-level observer has no idea which generation a
 * callback belongs to, and the tokens would be attributed to whichever record
 * happened to be assigned last. Mis-attributed numbers are worse than absent
 * ones, because they look right.
 *
 * AsyncLocalStorage is the standard-library answer: the context follows the
 * async call chain, so N concurrent generations each see their own record id
 * with no plumbing through every function signature.
 *
 * WHY NOT DROP THE COLUMN INSTEAD. That was the other option, and it is
 * defensible — the `ai.usage` event carries strictly more (the model, the
 * input/output split, and the cost in micro-USD). It was rejected because
 * dropping a column is an irreversible migration against a production database
 * that, as of 2026-09-14, has real merchants on it. Filling the column is
 * additive, reversible, and makes the name true.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** @type {AsyncLocalStorage<{usageRecordId: string, shop: string}>} */
export const usageContext = new AsyncLocalStorage();

/**
 * Run `fn` with the usage record it should charge tokens to.
 *
 * When there is no record id — a path that generates without taking a credit —
 * `fn` runs unwrapped. Absence of accounting must never stop a generation.
 */
export function withUsageRecord({ usageRecordId, shop }, fn) {
  if (!usageRecordId) return fn();
  return usageContext.run({ usageRecordId, shop }, fn);
}

/** The record the current generation belongs to, or null outside one. */
export function currentUsageRecord() {
  return usageContext.getStore() ?? null;
}
