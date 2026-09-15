/**
 * Phase 11 Part A — the app and Shopify disagreed about whether a shop was
 * installed, and the app's belief won every time.
 *
 * navaal-qa-fresh: Shopify's Apps page said Installed, the app served its
 * screens there, and Shop.uninstalledAt was set. A row flagged uninstalled is
 * unmonitored, absent from the funnel, refused by every dev-store tool, and —
 * worst — the ten-minute webhook sweep treats any Session it finds for such a
 * row as an unfinished uninstall and deletes every per-shop row. A shop that
 * is really installed recreates a Session on its next visit, so the sweep
 * deletes its drafts and plan again ten minutes later, and again.
 *
 * The flag is a belief. Shopify is the fact: it revokes the offline token at
 * uninstall, so "does shop { name } answer with this token?" is the one
 * question that cannot be wrong for long. Three places now ask it before
 * acting on the belief:
 *
 *   - app/uninstalled: a delivery for a shop whose token still answers is a
 *     late or redelivered webhook for an install that has since been redone.
 *     It is acknowledged, NOT acted on, and re-probed after a short delay in
 *     case Shopify's revocation was slower than its webhook.
 *   - the sweep: a flagged row with a Session is probed before anything is
 *     deleted; an answer restores the row instead.
 *   - nightly: every flagged row with a Session, and every installed row, is
 *     probed; flagged-but-answering rows are restored, installed-but-refused
 *     rows are counted and logged (never stamped — deleting on a 401 is the
 *     mistake in the other direction).
 *
 * No token is ever logged. The probe reads one field and throws nothing.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { getFreshOfflineSession } from "./offlineToken.server.js";
import { restoreInstalledState } from "./installTracking.server.js";

export const INSTALL_PROBE_TIMEOUT_MS = 3000;
export const INSTALL_PROBE_API_VERSION = "2026-04";
/** The webhook's second look, after the 200: long enough for a revocation to land. */
export const UNINSTALL_RECHECK_DELAY_MS = 30_000;

/**
 * Does Shopify still honour this shop's offline token?
 *
 * @returns {Promise<{installed: true|false|null, status?: number, reason?: string}>}
 *   true  — shop { name } answered: the app is installed on this shop
 *   false — 401/403/404: the token is not honoured; the app is not installed
 *   null  — could not tell (no session, timeout, unexpected answer)
 */
export async function probeInstalled(shop, { fetchImpl = fetch, timeoutMs = INSTALL_PROBE_TIMEOUT_MS, loadSession = getFreshOfflineSession } = {}) {
  if (!shop) return { installed: null, reason: "no_shop" };
  let sess;
  try {
    sess = await loadSession(shop);
  } catch (err) {
    return { installed: null, reason: "session_load_failed", detail: err?.message };
  }
  if (!sess?.accessToken) return { installed: null, reason: "no_offline_session" };
  try {
    const res = await fetchImpl(`https://${shop}/admin/api/${INSTALL_PROBE_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Shopify-Access-Token": sess.accessToken },
      body: JSON.stringify({ query: "{ shop { name } }" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 200 && json?.data?.shop?.name) return { installed: true, status: 200 };
    if (res.status === 401 || res.status === 403 || res.status === 404) return { installed: false, status: res.status, reason: "token_not_honoured" };
    return { installed: null, status: res.status, reason: "unexpected_response" };
  } catch (err) {
    return { installed: null, reason: err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : "probe_failed", detail: err?.message };
  }
}

/**
 * The nightly reconciliation, both directions. Restores a flagged row whose
 * token answers; counts (and logs, per shop) an installed row whose token is
 * refused. Never throws; one shop's failure does not stop the others.
 */
export async function reconcileInstallState({ now = new Date(), probe = probeInstalled, limit = 500 } = {}) {
  const out = { flagged: 0, flaggedWithSession: 0, restored: 0, confirmedGone: 0, installed: 0, installedRefused: 0, undecided: 0 };
  try {
    const flagged = await prisma.shop.findMany({ where: { uninstalledAt: { not: null }, redactedAt: null }, select: { shop: true }, take: limit });
    out.flagged = flagged.length;
    for (const { shop } of flagged) {
      try {
        const sess = await prisma.session.findFirst({ where: { shop, isOnline: false }, select: { id: true } });
        if (!sess) continue;
        out.flaggedWithSession += 1;
        const p = await probe(shop);
        if (p.installed === true) {
          await restoreInstalledState(shop, { source: "nightly_reconcile", now });
          out.restored += 1;
        } else if (p.installed === false) out.confirmedGone += 1;
        else out.undecided += 1;
      } catch (err) {
        logger.warn({ shop, err: err?.message, event: "install_reconcile_shop_failed" }, "install reconcile: one flagged shop failed (non-fatal)");
      }
    }
    const installed = await prisma.shop.findMany({ where: { uninstalledAt: null, redactedAt: null }, select: { shop: true }, take: limit });
    out.installed = installed.length;
    for (const { shop } of installed) {
      try {
        const sess = await prisma.session.findFirst({ where: { shop, isOnline: false }, select: { id: true } });
        if (!sess) continue;
        const p = await probe(shop);
        if (p.installed === false) {
          out.installedRefused += 1;
          logger.warn({ shop, status: p.status, event: "install_state_contradicted_reverse" }, "install reconcile: the app believes this shop is installed; Shopify does not honour its token (counted, not stamped)");
        } else if (p.installed === null) out.undecided += 1;
      } catch (err) {
        logger.warn({ shop, err: err?.message, event: "install_reconcile_shop_failed" }, "install reconcile: one installed shop failed (non-fatal)");
      }
    }
  } catch (err) {
    logger.error({ err: err?.message, event: "install_reconcile_failed" }, "install reconcile failed");
  }
  logger.info({ event: "install_state_reconciled", ...out }, "install state reconciled against Shopify");
  return out;
}
