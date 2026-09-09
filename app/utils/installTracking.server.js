/**
 * Install-source tracking — the shop record.
 *
 * Shopify appends four attribution params to the app URL when an install
 * starts on the App Store (docs: apps/launch/marketing/track-listing-traffic):
 *   surface_type            home | search | search_ad | category | collection |
 *                           story | partners | app_details | app_group
 *   surface_detail          the search query / category title / section handle
 *   surface_inter_position  section, or results page number
 *   surface_intra_position  position within that section / page
 * Links on surfaces we own (navaal.ai pages, Bilby reports, outreach emails)
 * go through our /go redirector (app/routes/go.jsx), which sets the navaal_ref
 * cookie and forwards to the App Store listing with ?ref=. The ref reaches the
 * install request either on the URL (if Shopify passes it through) or via that
 * cookie (when the browser sends it into the embedded context — Chrome/Edge in
 * a normal window do; Safari and Firefox generally do not). Attribution of our
 * own links is therefore real but partial, and is reported as measured.
 *
 * All of it — plus the HTTP referer (origin + path only, never the query
 * string, which can carry a session token) and the landing path — is captured
 * on the FIRST authenticated request for a shop and persisted on the Shop row.
 * That first-install attribution is immutable: it is never back-filled from a
 * later visit and never overwritten by a reinstall (reinstalls get their own
 * reinstallSource/reinstallReferer and are counted in installCount).
 *
 * Where it runs: inside the app's authenticate.admin wrapper (shopify.server.js),
 * after the Shopify library has authenticated the request. A brand-new install
 * (managed installation → token exchange) has no OAuth callback; its first
 * authenticated request IS the install event. The afterAuth hook (fires when a
 * new session is created) flags the shop so the tracker takes the DB path even
 * when the request carries no attribution params (reinstall detection).
 *
 * Truth rules:
 *  - A shop that was installed BEFORE this shipped is recorded as
 *    installSource "pre_tracking" with installedAt = its earliest known
 *    activity (Plan/GrowthState/BrandVoice createdAt) — never as a fresh
 *    install, never attributed to whatever the request happens to carry.
 *  - Every write is idempotent under the two parallel document loaders
 *    (app.jsx + app._index.jsx) and under duplicate webhook delivery.
 *  - ref / utm_source values are CHANNEL handles we mint (site page, Bilby,
 *    outreach campaign) — never per-recipient tokens — so they survive
 *    shop/redact as aggregate data.
 *  - Never throws. Tracking must not break authentication.
 */
import { createHash } from "node:crypto";
import prisma from "../db.server.js";
import logger from "./logger.server.js";

const SURFACE_PARAMS = {
  surface_type: "surfaceType",
  surface_detail: "surfaceDetail",
  surface_intra_position: "surfaceIntraPosition",
  surface_inter_position: "surfaceInterPosition",
};
export const REF_COOKIE = "navaal_ref";
export const REF_COOKIE_MAX_AGE = 30 * 24 * 3600;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
// A shop first seen with activity older than this predates tracking.
const PRE_TRACKING_WINDOW_MS = 10 * 60 * 1000;

const clip = (v, n) => (v == null || v === "" ? null : String(v).slice(0, n));

function cookieValue(request, name) {
  const c = request.headers?.get?.("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function sanitizeRef(raw) {
  if (!raw) return null;
  const v = String(raw).trim();
  return REF_RE.test(v) ? v : null;
}

/** Referer with the query string and fragment dropped (could carry id_token). */
function safeReferer(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return clip(`${u.origin}${u.pathname}`, 512);
  } catch {
    return null;
  }
}

/**
 * Read every attribution signal a request can carry. Pure; safe on any Request.
 */
export function extractInstallSignals(request) {
  const sig = {
    surfaceType: null,
    surfaceDetail: null,
    surfaceIntraPosition: null,
    surfaceInterPosition: null,
    ref: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    referer: null,
    landingPath: null,
    hasAttribution: false,
  };
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return sig;
  }
  const sp = url.searchParams;
  sig.landingPath = clip(url.pathname, 200);
  for (const [param, field] of Object.entries(SURFACE_PARAMS)) {
    sig[field] = clip(sp.get(param), 255);
  }
  sig.ref = sanitizeRef(sp.get("ref")) || sanitizeRef(cookieValue(request, REF_COOKIE));
  sig.utmSource = clip(sp.get("utm_source"), 100);
  sig.utmMedium = clip(sp.get("utm_medium"), 100);
  sig.utmCampaign = clip(sp.get("utm_campaign"), 100);
  sig.referer = safeReferer(request.headers?.get?.("referer"));
  sig.hasAttribution = !!(sig.surfaceType || sig.surfaceDetail || sig.ref || sig.utmSource || sig.utmCampaign);
  return sig;
}

/** One label per install that answers "where did this install come from?". */
export function classifyInstallSource(sig) {
  if (sig.ref) return `ref:${sig.ref}`;
  if (sig.surfaceType) return `app_store:${sig.surfaceType}`;
  if (sig.surfaceDetail) return "app_store:unknown_surface";
  if (sig.utmSource) return `utm:${sig.utmSource}`;
  return "unknown";
}

function attributionFields(sig) {
  return {
    surfaceType: sig.surfaceType,
    surfaceDetail: sig.surfaceDetail,
    surfaceIntraPosition: sig.surfaceIntraPosition,
    surfaceInterPosition: sig.surfaceInterPosition,
    installRef: sig.ref,
    utmSource: sig.utmSource,
    utmMedium: sig.utmMedium,
    utmCampaign: sig.utmCampaign,
    installReferer: sig.referer,
    installLandingPath: sig.landingPath,
  };
}

// ── Process-local state (cheap hot path) ─────────────────────────────────────
// `seen`: shops whose Shop row is known to exist — the common request skips the
// DB entirely. `freshAuth`: shops for which the library's afterAuth hook just
// fired (a NEW session was created: install, reinstall, or token re-exchange) —
// consumed by the very next trackShopAuth for that shop so it always checks DB.
const seen = new Set();
const freshAuth = new Set();

/** Called from shopifyApp({ hooks: { afterAuth } }). */
export function noteAfterAuth(shop) {
  if (shop) freshAuth.add(shop);
}

/** Test-only: reset process-local state. */
export function _resetInstallTrackingForTests() {
  seen.clear();
  freshAuth.clear();
}

async function earliestKnownActivity(shop) {
  const [plan, growth, voice] = await Promise.all([
    prisma.plan.findUnique({ where: { shop }, select: { createdAt: true } }),
    prisma.growthState.findUnique({ where: { shop }, select: { createdAt: true } }),
    prisma.brandVoice.findUnique({ where: { shop }, select: { createdAt: true } }),
  ]);
  const times = [plan, growth, voice]
    .map((r) => (r?.createdAt ? new Date(r.createdAt).getTime() : null))
    .filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.min(...times)) : null;
}

async function createShopRow(shop, sig) {
  const now = new Date();
  const earliest = await earliestKnownActivity(shop);
  const preTracking = !!earliest && now.getTime() - earliest.getTime() > PRE_TRACKING_WINDOW_MS;
  const data = preTracking
    ? { shop, installedAt: earliest, installSource: "pre_tracking" }
    : { shop, installedAt: now, installSource: classifyInstallSource(sig), ...attributionFields(sig) };
  try {
    // createMany + skipDuplicates = INSERT ... ON CONFLICT DO NOTHING on the
    // unique shop column: the two parallel document loaders cannot race into a
    // unique-violation error line, and exactly ONE of them (count 1) logs the
    // install event. The other just reads the row back.
    const { count } = await prisma.shop.createMany({ data: [data], skipDuplicates: true });
    const row = await prisma.shop.findUnique({ where: { shop } });
    if (count === 1) logger.info(
      {
        shop,
        event: preTracking ? "shop_record_backfilled" : "shop_installed",
        installSource: row.installSource,
        surfaceType: row.surfaceType,
        surfaceDetail: row.surfaceDetail,
        installRef: row.installRef,
        installReferer: row.installReferer,
        installLandingPath: row.installLandingPath,
      },
      preTracking ? "Shop record backfilled (installed before tracking)" : "Shop installed — source tracked"
    );
    return row;
  } catch (err) {
    // A parallel loader for the same document request created it first.
    if (err?.code === "P2002") return prisma.shop.findUnique({ where: { shop } });
    throw err;
  }
}

// Reinstall: count it and record ITS source, without touching the immutable
// first-install attribution. The write is conditional on uninstalledAt still
// being set, so the two parallel loaders of the same document request (or two
// machines) can both reach here and exactly one increments; the other re-reads.
async function recordReinstall(existing, sig) {
  logger.info(
    { shop: existing.shop, event: "ttv_reset_on_reinstall", firstDraftSeenAt: existing.firstDraftSeenAt ?? null, firstPublishAt: existing.firstPublishAt ?? null, quickStartDraftCount: existing.quickStartDraftCount ?? 0, productCountAtFirstLoad: existing.productCountAtFirstLoad ?? null },
    "reinstall: activation milestones reset"
  );
  const r = await prisma.shop.updateMany({
    where: { shop: existing.shop, uninstalledAt: { not: null } },
    data: {
      uninstalledAt: null,
      reinstalledAt: new Date(),
      installCount: { increment: 1 },
      reinstallSource: classifyInstallSource(sig),
      reinstallReferer: sig.referer,
      // A reinstall is a new activation clock (the uninstall deleted the content).
      // Review-ask fields are NOT reset: "never retry within the cooldown" survives reinstall.
      productCountAtFirstLoad: null,
      quickStartStartedAt: null,
      quickStartDraftCount: 0,
      firstDraftSeenAt: null,
      firstDraftSource: null,
      firstPublishAt: null,
      firstPublishSource: null,
    },
  });
  const row = await prisma.shop.findUnique({ where: { shop: existing.shop } });
  if (r.count > 0) {
    logger.info(
      { shop: existing.shop, event: "shop_reinstalled", reinstallSource: row?.reinstallSource, installCount: row?.installCount },
      "Shop reinstalled — source tracked"
    );
  }
  return row;
}

/**
 * Record / update the shop record for an authenticated admin request.
 * Never throws. Returns the Shop row when the DB path ran, else null.
 */
export async function trackShopAuth(request, shop) {
  if (!shop) return null;
  try {
    const fresh = freshAuth.delete(shop);
    // Hot path: a known shop on an ordinary request — nothing to learn.
    if (!fresh && seen.has(shop)) return null;

    const sig = extractInstallSignals(request);
    const existing = await prisma.shop.findUnique({ where: { shop } });
    if (!existing) {
      const created = await createShopRow(shop, sig);
      seen.add(shop);
      return created;
    }
    seen.add(shop);
    if (existing.uninstalledAt) return await recordReinstall(existing, sig);
    return existing;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "install tracking failed (non-fatal)");
    return null;
  }
}

/**
 * app/uninstalled: keep the row, stamp uninstalledAt. Idempotent under
 * duplicate delivery: only a live row is stamped, and a delivery that Shopify
 * triggered BEFORE the shop's latest reinstall is ignored (a late duplicate of
 * an old uninstall must not mark a reinstalled shop as gone). Never throws.
 * @param {string} shop
 * @param {Date|string|null} [triggeredAt] X-Shopify-Triggered-At of the delivery
 */
export async function markShopUninstalled(shop, triggeredAt = null) {
  seen.delete(shop);
  try {
    const t = triggeredAt ? new Date(triggeredAt) : null;
    const validT = t && Number.isFinite(t.getTime()) ? t : null;
    const where = validT
      ? { shop, uninstalledAt: null, OR: [{ reinstalledAt: null }, { reinstalledAt: { lt: validT } }] }
      : { shop, uninstalledAt: null };
    const r = await prisma.shop.updateMany({ where, data: { uninstalledAt: validT ?? new Date() } });
    logger.info({ shop, event: "shop_uninstalled", matched: r.count }, "Shop uninstalled");
    return r.count;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "could not stamp uninstalledAt (non-fatal)");
    return 0;
  }
}

/**
 * shop/redact: anonymise the row inside the redaction transaction. Aggregate
 * install stats (source channel, dates) survive; everything that could
 * identify the store — its domain, referers, landing path, the App Store search
 * query, campaign-level utm — is cleared.
 */
export async function redactShopRecord(tx, shop) {
  const hash = createHash("sha256").update(shop).digest("hex").slice(0, 24);
  seen.delete(shop);
  return tx.shop.updateMany({
    where: { shop },
    data: {
      shop: `redacted:${hash}:${Date.now().toString(36)}`,
      surfaceDetail: null,
      utmMedium: null,
      utmCampaign: null,
      installReferer: null,
      installLandingPath: null,
      reinstallReferer: null,
      redactedAt: new Date(),
    },
  });
}
