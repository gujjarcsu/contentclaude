// Client-safe helpers for alt-text result payloads.

// Entries created BEFORE the P0-1 fix reference legacy ProductImage GIDs —
// that era's mutation (productImageUpdate) had been removed from the API, so
// none of those writes ever reached Shopify, even though the stored payload
// is success-shaped. Post-fix entries always use MediaImage GIDs.
export const LEGACY_ALT_ENTRY_MARKER = "gid://shopify/ProductImage/";

export const LEGACY_ALT_ERROR =
  "This earlier attempt never reached Shopify — generate again to apply alt text.";

// Raw technical strings that must NEVER reach a merchant. Legacy rows stored
// the dead mutation's GraphQL error verbatim in their `error` field, so honest
// rendering alone still leaked it — the message text itself must be replaced.
const TECHNICAL_ERROR_RE =
  /productImageUpdate|doesn't exist on type|gid:\/\/|Cannot read|TypeError|\[object Object\]|Unexpected token/i;

export function isLegacyAltTextEntry(entry) {
  // Success-shaped but keyed on a legacy ProductImage GID (dead-mutation era,
  // never actually wrote), OR any entry whose stored error is a raw technical
  // string that must not be shown.
  const legacyId =
    typeof entry?.imageId === "string" && entry.imageId.includes(LEGACY_ALT_ENTRY_MARKER);
  const technicalError =
    typeof entry?.error === "string" && TECHNICAL_ERROR_RE.test(entry.error);
  return (!entry?.error && legacyId) || technicalError;
}

/**
 * Normalize a stored alt-text result payload for display: legacy entries that
 * never actually wrote anything — whether success-shaped (legacy GID) or
 * carrying a raw GraphQL error — become failed entries with a merchant-safe
 * message, so the badge derives to "Not applied" and no technical string
 * leaks to the UI.
 */
export function normalizeAltTextResults(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((r) => (isLegacyAltTextEntry(r) ? { ...r, error: LEGACY_ALT_ERROR } : r));
}
