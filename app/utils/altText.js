// Client-safe helpers for alt-text result payloads.

// Entries created BEFORE the P0-1 fix reference legacy ProductImage GIDs —
// that era's mutation (productImageUpdate) had been removed from the API, so
// none of those writes ever reached Shopify, even though the stored payload
// is success-shaped. Post-fix entries always use MediaImage GIDs.
export const LEGACY_ALT_ENTRY_MARKER = "gid://shopify/ProductImage/";

export const LEGACY_ALT_ERROR =
  "This earlier attempt never reached Shopify — generate again to apply alt text.";

export function isLegacyAltTextEntry(entry) {
  return (
    !entry?.error &&
    typeof entry?.imageId === "string" &&
    entry.imageId.includes(LEGACY_ALT_ENTRY_MARKER)
  );
}

/**
 * Normalize a stored alt-text result payload for display: legacy
 * success-shaped entries that never actually wrote anything are converted to
 * failed entries, so the badge derives to "Not applied" instead of repeating
 * the original false-success bug to a reviewer.
 */
export function normalizeAltTextResults(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((r) => (isLegacyAltTextEntry(r) ? { ...r, error: LEGACY_ALT_ERROR } : r));
}
