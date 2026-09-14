/**
 * Which name to show a merchant, and which to publish as an author.
 *
 * THE BUG THIS EXISTS FOR. The dashboard greeted `brandVoice.storeName`, a value
 * captured ONCE at install by `ensureInferredBrandVoice` and never refreshed —
 * that upsert's `update` branch is empty on purpose, so the merchant's own
 * settings are never overwritten. Correct for a settings field; wrong for a
 * greeting. Two failures followed, both seen in production on 2026-09-14:
 *
 *   1. STALE FOREVER. `contentpilot-dev2` renamed to "Northline Supply" in the
 *      admin. The hero still said "Welcome back, E2E Test Store!" — the old name
 *      and the new one visible in the same screenshot.
 *   2. THE RAW HANDLE. When Shopify returned no name at install, the fallback
 *      stored the handle, so `navaal-ttv-03` was greeted as "navaal-ttv-03".
 *
 * And the same value is the AUTHOR of every blog post this app publishes
 * (`app.blog.jsx`), so failure 2 puts "navaal-ttv-03" on the merchant's public
 * storefront, permanently, in content they cannot easily edit.
 *
 * THE SEPARATION. Shopify's live shop name is authoritative for *identifying*
 * the store. `brandVoice.storeName` is a merchant-editable brand-voice field
 * (Settings has an input for it) and is authoritative for *authorship*. They are
 * different questions and this module answers them differently. Refreshing
 * `brandVoice.storeName` from Shopify would clobber a name the merchant chose.
 *
 * PURE MODULE. No I/O, no imports. The live fetch lives in shopName.server.js.
 */

/** The handle portion of a myshopify domain: "acme-co.myshopify.com" -> "acme-co". */
export function handleOf(shop) {
  return String(shop || "").split(".")[0];
}

/**
 * Is this stored name a placeholder rather than something the merchant chose?
 *
 * We cannot ask the database "did a human type this", so we use the one signal
 * that is reliable: a stored name identical to the shop handle was seeded by
 * `ensureInferredBrandVoice`'s fallback, not chosen. Compared case- and
 * separator-insensitively, because "navaal-ttv-03" and "Navaal Ttv 03" are the
 * same non-choice.
 */
export function isPlaceholderName(name, shop) {
  const n = String(name || "").trim();
  if (!n) return true;
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, "");
  return norm(n) === norm(handleOf(shop));
}

/**
 * The name to greet a merchant by, or null to greet them without one.
 *
 * Live name wins: it is what their admin says right now, so a rename shows up.
 * A merchant's own brand name is the fallback. If neither is real we return
 * NULL and the caller greets without a name — "Welcome back!" is always true,
 * where "Welcome back, navaal-ttv-03!" is a bug a merchant can see.
 */
export function greetingName(liveName, storedName, shop) {
  const live = String(liveName || "").trim();
  if (live && !isPlaceholderName(live, shop)) return live;
  const stored = String(storedName || "").trim();
  if (stored && !isPlaceholderName(stored, shop)) return stored;
  return null;
}

/**
 * The author name to publish on a blog post.
 *
 * Precedence flips here, deliberately. Authorship is a branding decision, so a
 * name the merchant typed into Settings beats the shop's own name. Shopify's
 * `ArticleCreateInput.author` is non-null — a missing author was a hard GraphQL
 * error and a 500 on publish — so this always returns a string, and the handle
 * remains the last resort rather than the first.
 */
export function authorName(liveName, storedName, shop) {
  const stored = String(storedName || "").trim();
  if (stored && !isPlaceholderName(stored, shop)) return stored;
  const live = String(liveName || "").trim();
  if (live && !isPlaceholderName(live, shop)) return live;
  return handleOf(shop);
}
