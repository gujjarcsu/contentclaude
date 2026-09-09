/**
 * App Store review ask — decided SERVER-SIDE inside the publish action the
 * merchant pressed (brief item 4). The client can only call
 * shopify.reviews.request() with an attemptId the server issued, so:
 *   - never on open, never on a button they did not press (structural);
 *   - exactly one call per eligible publish confirmation, even under the two
 *     parallel document loaders (optimistic updateMany on the Shop row);
 *   - every call is a ReviewRequestAttempt row and every returned code is
 *     recorded on it and summarised on the Shop row;
 *   - never retried within Shopify's cooldown: a claim immediately writes a
 *     60-day hold (so a lost callback cannot cause a re-ask) and the reported
 *     code then sets the real hold — terminal codes end asking for good.
 *
 * "Exactly once" = at most one DISPLAYED modal per shop ever (`success` is
 * terminal). Codes that mean "nothing was shown" (recently-installed,
 * mobile-app, cancelled = "modal opening was cancelled", …) get one later
 * chance at a subsequent publish confirmation after their hold; the smallest
 * hold is 1 h / 24 h, so two calls are never minutes apart. Install age is not
 * pre-checked: Shopify enforces the 24 h rule itself (dev stores bypass it),
 * and a recently-installed decline costs one no-op call, after which the hold
 * applies. REVIEW_ASK_POLICY = "strict_once" makes one call, ever, any outcome.
 *
 * Shopify Reviews API codes: success · already-reviewed · annual-limit-reached
 * (3 per 365 d) · cooldown-period (60 d) · merchant-ineligible · mobile-app ·
 * recently-installed (< 24 h) · already-open · open-in-progress · cancelled.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { installAtOf } from "./firstValue.server.js";

export const REVIEW_ASK_POLICY = "once_displayed"; // | "strict_once"
export const REVIEW_ASK_MAX_CALLS = 5;              // local safety cap on CALLS per shop — not Shopify's display limit
export const REVIEW_ASK_SURFACES = ["review_page", "product_page"];
export const TERMINAL_CODES = new Set(["success", "already-reviewed", "merchant-ineligible"]);
const H = 3_600_000;
const D = 24 * H;

/** How long to hold after a given outcome. Pure. → { terminal, shown, nextEligibleAt } */
export function holdFor(code, { installAt = null, now = new Date() } = {}) {
  const t = now.getTime();
  switch (code) {
    case "success":
      return { terminal: true, shown: true, nextEligibleAt: null };
    case "already-reviewed":
    case "merchant-ineligible":
      return { terminal: true, shown: false, nextEligibleAt: null };
    case "annual-limit-reached":
      return { terminal: false, shown: false, nextEligibleAt: new Date(t + 365 * D) };
    case "cooldown-period":
      return { terminal: false, shown: false, nextEligibleAt: new Date(t + 60 * D) };
    case "recently-installed":
      return { terminal: false, shown: false, nextEligibleAt: new Date(Math.max(installAt ? new Date(installAt).getTime() + 25 * H : 0, t + 1 * H)) };
    case "mobile-app":
    case "already-open":
    case "open-in-progress":
    case "cancelled": // docs: "Review modal opening was cancelled" — nothing displayed
    case "skipped-hidden":
      return { terminal: false, shown: false, nextEligibleAt: new Date(t + 1 * D) };
    case "unavailable":
    case "error":
      return { terminal: false, shown: false, nextEligibleAt: new Date(t + 7 * D) };
    default: // unknown → treat as a possible display
      return { terminal: false, shown: false, nextEligibleAt: new Date(t + 60 * D) };
  }
}

/** Pure eligibility over the Shop row (+ legacy GrowthState). → { eligible, reason, nextEligibleAt? } */
export function decideReviewAsk(shopRow, growthState, now = new Date()) {
  if (!shopRow) return { eligible: false, reason: "no_shop_row" };
  if (REVIEW_ASK_POLICY === "strict_once" && shopRow.reviewAskCount >= 1) return { eligible: false, reason: "strict_once" };
  if (shopRow.reviewDoneAt) return { eligible: false, reason: "terminal" };
  const t = now.getTime();
  if (shopRow.reviewNextEligibleAt && new Date(shopRow.reviewNextEligibleAt).getTime() > t) {
    return { eligible: false, reason: "hold", nextEligibleAt: new Date(shopRow.reviewNextEligibleAt) };
  }
  // Legacy: asked under the old code (GrowthState.reviewRequestedAt), outcome unknown → treat as a possible display.
  if (!shopRow.reviewLastAskedAt && growthState?.reviewRequestedAt && new Date(growthState.reviewRequestedAt).getTime() + 60 * D > t) {
    return { eligible: false, reason: "legacy_hold", nextEligibleAt: new Date(new Date(growthState.reviewRequestedAt).getTime() + 60 * D) };
  }
  if (shopRow.reviewAskCount >= REVIEW_ASK_MAX_CALLS) return { eligible: false, reason: "call_cap" };
  return { eligible: true, reason: "eligible" };
}

/**
 * Inside a publish action that succeeded for `publishedCount` products: should
 * THIS response carry a review ask? Returns { attemptId } or null. Never throws.
 */
export async function openReviewAsk({ shop, surface, trigger = "publish", publishedCount = 0, now = new Date() }) {
  try {
    if (!shop || !REVIEW_ASK_SURFACES.includes(surface) || publishedCount < 1) return null;
    if (!prisma.shop?.findUnique || !prisma.reviewRequestAttempt?.create) return null;
    const [row, gs] = await Promise.all([
      prisma.shop.findUnique({ where: { shop } }),
      prisma.growthState?.findUnique ? prisma.growthState.findUnique({ where: { shop }, select: { reviewRequestedAt: true } }).catch(() => null) : null,
    ]);
    const d = decideReviewAsk(row, gs, now);
    if (!d.eligible) {
      logger.info({ shop, event: "review_ask_skipped", reason: d.reason, surface, trigger, nextEligibleAt: d.nextEligibleAt ?? null }, "review ask skipped");
      return null;
    }
    // One open attempt per eligible moment — a DB guarantee, not a client hope.
    const r = await prisma.shop.updateMany({
      where: { shop, reviewAskCount: row.reviewAskCount, reviewDoneAt: null },
      data: {
        reviewAskCount: { increment: 1 },
        reviewLastAskedAt: now,
        reviewLastCode: "pending",
        reviewNextEligibleAt: new Date(now.getTime() + 60 * D), // pending hold: a lost callback can never re-ask inside the cooldown
      },
    });
    if (r.count !== 1) {
      logger.info({ shop, event: "review_ask_skipped", reason: "concurrent", surface, trigger }, "review ask skipped");
      return null;
    }
    const installAt = installAtOf(row);
    const attempt = await prisma.reviewRequestAttempt.create({
      data: {
        shop,
        surface,
        trigger,
        publishedCount,
        attemptNo: row.reviewAskCount + 1,
        installAgeSeconds: installAt ? Math.round((now.getTime() - new Date(installAt).getTime()) / 1000) : null,
        requestedAt: now,
      },
    });
    logger.info({ shop, event: "review_ask_opened", attemptId: attempt.id, surface, trigger, attemptNo: row.reviewAskCount + 1, publishedCount }, "review ask opened");
    return { attemptId: attempt.id };
  } catch (err) {
    logger.warn({ shop, surface, err: err?.message }, "openReviewAsk failed (non-fatal)");
    return null;
  }
}

/**
 * Record the code the client got back from shopify.reviews.request().
 * → { status: 200 | 404 | 409 | 500 }. Idempotent per attempt. Never throws.
 */
export async function recordReviewOutcome(shop, attemptId, { code, success, message } = {}, now = new Date()) {
  try {
    if (!shop || !attemptId || !prisma.reviewRequestAttempt?.findUnique) return { status: 404 };
    const attempt = await prisma.reviewRequestAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.shop !== shop) return { status: 404 };
    if (attempt.code != null) return { status: 409 };
    const safeCode = String(code || "unknown").slice(0, 60);
    const row = await prisma.shop.findUnique({ where: { shop } });
    const hold = holdFor(safeCode, { installAt: installAtOf(row), now });
    const writes = [
      prisma.reviewRequestAttempt.update({
        where: { id: attemptId },
        data: { respondedAt: now, code: safeCode, success: !!success, message: String(message || "").slice(0, 200), nextEligibleAt: hold.nextEligibleAt },
      }),
      prisma.shop.updateMany({
        where: { shop },
        data: {
          reviewLastCode: safeCode,
          reviewNextEligibleAt: hold.nextEligibleAt,
          ...(hold.terminal ? { reviewDoneAt: now } : {}),
          ...(hold.shown ? { reviewShownAt: now } : {}),
        },
      }),
    ];
    if (typeof prisma.$transaction === "function") await prisma.$transaction(writes);
    else await Promise.all(writes);
    logger.info(
      { shop, event: "review_ask_result", attemptId, code: safeCode, success: !!success, surface: attempt.surface, trigger: attempt.trigger, installAgeSeconds: attempt.installAgeSeconds ?? null, nextEligibleAt: hold.nextEligibleAt, terminal: hold.terminal },
      "review ask result"
    );
    return { status: 200, terminal: hold.terminal, shown: hold.shown };
  } catch (err) {
    logger.warn({ shop, attemptId, err: err?.message }, "recordReviewOutcome failed (non-fatal)");
    return { status: 500 };
  }
}
