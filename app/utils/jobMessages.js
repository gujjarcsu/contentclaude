/**
 * Phase 12 Part D (D1) — the merchant sentences the server writes into a
 * job, a draft or an action result, in one pure module.
 *
 * They were literals inside bulkProcessor.server.js, quickStart.server.js,
 * generationQueue.server.js and shopifyQuery.server.js — server modules the
 * client bundle cannot import. A screen that reads one of these back (the
 * Jobs page's error log, the first-run card, an action's error banner)
 * needs the KEY to translate it, so the keys live here, marked with T(),
 * and the server modules import them. The English text is unchanged: T is
 * the identity and the tests that lock these strings still pass.
 *
 * PURE.
 */
import { T, enT } from "../i18n/index.js";

/** Bulk jobs — one row per product in GenerationJob.errorLog. */
export const JOB_MESSAGES = Object.freeze({
  productNotFound: T("Product not found in Shopify"),
  enhanceSkipped: T("[NO CHARGE] No existing description to enhance"),
  brandVoiceMissing: T("Brand voice not configured. Go to Settings to set up your brand voice before running a bulk job."),
  contention: T("Temporary server contention — will retry on next job run."),
  cancelled: T("Cancelled by merchant."),
  jobsRunning: T("You already have jobs running — please wait for them to finish, then try again."),
  quotaReached: T("Monthly generation limit reached. Upgrade at /app/plans."),
});

/** Merchant-safe failure copy for the first-run drafts (exact strings — locked by tests). Never an internal error message. */
export const QUICK_START_MESSAGES = Object.freeze({
  timeout: T("This one took too long — no credit was used."),
  busy: T("Our AI is busy — no credit was used. Retry in a minute."),
  empty: T("The AI returned an empty draft — no credit was used."),
  notFound: T("This product no longer exists in your store."),
  contention: T("Busy for a moment — no credit was used."),
  generic: T("We couldn't write this one — no credit was used."),
  save: T("We couldn't save this draft — no credit was used."),
  invalid: T("Invalid product."),
  rateLimited: (seconds, t = enT) => t("Too many at once — try again in {seconds}s.", { seconds }),
});

/** The Shopify read layer's one merchant sentence. */
export const SHOPIFY_THROTTLED = T("Shopify is rate-limiting this store right now.");

/** Every key above, for the stored-sentence translator (app/i18n/stored.js). */
export const JOB_MESSAGE_KEYS = Object.freeze([
  ...Object.values(JOB_MESSAGES),
  ...Object.values(QUICK_START_MESSAGES).filter((v) => typeof v === "string"),
  "Too many at once — try again in {seconds}s.",
  SHOPIFY_THROTTLED,
]);
