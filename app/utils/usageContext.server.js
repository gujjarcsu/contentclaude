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
 * C0.7 / P5.5 — WHICH API KEY the generation running right now must use.
 *
 * A separate store from `usageContext` on purpose. They have different
 * lifetimes: a generation that takes no credit has no usage record and still
 * needs the merchant's key, and the validation call at save time needs neither.
 * Folding them together would make one of those cases carry a null the other
 * half has to keep checking.
 *
 * The reason this is AsyncLocalStorage rather than a parameter is the same
 * reason `usageContext` is, and it is stronger here: the bulk processor runs
 * generations CONCURRENTLY, and a module-level "current key" would mean one
 * shop's job could be billed to another shop's Anthropic account. That is the
 * worst bug this feature could have, and threading the key through every
 * function signature in ai.server.js would be the only other way to prevent it.
 *
 * @type {AsyncLocalStorage<{key: string, byok: boolean, shop: string}>}
 */
export const keyContext = new AsyncLocalStorage();

/**
 * Run `fn` with the merchant's own API key in scope.
 *
 * With no key, `fn` runs unwrapped and `ai.server.js` falls back to ours —
 * which is right for every shop that has not attached one.
 */
export function withMerchantKey({ key, shop }, fn) {
  if (!key) return fn();
  return keyContext.run({ key, byok: true, shop }, fn);
}

/** The merchant key for the generation running now, or null. */
export function currentMerchantKey() {
  return keyContext.getStore() ?? null;
}

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
