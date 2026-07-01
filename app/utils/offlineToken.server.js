// Single source of truth for keeping a shop's OFFLINE access token valid.
//
// Expiring offline tokens live ~1 hour. The embedded flow refreshes them via the
// authenticate.admin wrapper (shopify.server.js). Background work (bulk jobs,
// autopilot) holds a token for much longer than an hour, so it must refresh too —
// otherwise a long job 401s on every product once the token lapses.
//
// The refresh_token grant is the reliable mechanism (proven in production).

import prisma from "../db.server.js";
import logger from "./logger.server.js";

// Refresh proactively when the token is within this window of expiry.
export const REFRESH_WITHIN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Exchange the stored refresh token for a fresh access token and persist it.
 * Returns { accessToken, expires } on success, or null on any failure.
 */
export async function refreshOfflineToken(shop) {
  try {
    const sess = await prisma.session.findFirst({ where: { shop, isOnline: false } });
    if (!sess?.refreshToken) return null;

    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        grant_type: "refresh_token",
        refresh_token: sess.refreshToken,
      }),
    });
    if (!res.ok) return null;

    const j = await res.json();
    if (!j?.access_token) return null;

    const expires = j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : sess.expires;
    await prisma.session.update({
      where: { id: sess.id },
      data: {
        accessToken: j.access_token,
        expires,
        ...(j.refresh_token ? { refreshToken: j.refresh_token } : {}),
      },
    });
    return { accessToken: j.access_token, expires };
  } catch (err) {
    logger.warn({ shop, err: err.message }, "offline token refresh failed");
    return null;
  }
}

/**
 * Load the shop's offline session, proactively refreshing the token if it's
 * expired or within REFRESH_WITHIN_MS of expiry. Returns the session (with a
 * valid accessToken) or null if there is no session.
 */
export async function getFreshOfflineSession(shop) {
  const sess = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  if (!sess) return null;

  const nearExpiry = !sess.expires || sess.expires.getTime() - Date.now() < REFRESH_WITHIN_MS;
  if (nearExpiry && sess.refreshToken) {
    const refreshed = await refreshOfflineToken(shop);
    if (refreshed) {
      sess.accessToken = refreshed.accessToken;
      sess.expires = refreshed.expires;
    }
  }
  return sess;
}
