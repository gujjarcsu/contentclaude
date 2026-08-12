/**
 * E2E defect A regression — legacy (pre-fix) alt-text rows are success-shaped
 * but never wrote anything: the mutation they used had been removed from the
 * API. They must NEVER render as applied.
 */
import { describe, it, expect } from "vitest";
import { normalizeAltTextResults, isLegacyAltTextEntry, LEGACY_ALT_ERROR } from "../../app/utils/altText.js";

describe("defect A: legacy alt-text rows can never render success", () => {
  const legacyEntry = { imageId: "gid://shopify/ProductImage/123", url: "https://cdn/x.jpg", altText: "A nice photo" };
  const modernOk = { imageId: "gid://shopify/MediaImage/456", url: "https://cdn/y.jpg", altText: "Applied for real" };
  const modernFailed = { imageId: "gid://shopify/MediaImage/789", url: "https://cdn/z.jpg", altText: "x", error: "Shopify couldn't apply this alt text. Please try again." };

  it("marks success-shaped legacy ProductImage entries as failed", () => {
    const out = normalizeAltTextResults([legacyEntry]);
    expect(out[0].error).toBe(LEGACY_ALT_ERROR);
    // Badge derivation: zero non-error entries => "Not applied"
    expect(out.filter((r) => !r.error).length).toBe(0);
  });

  it("leaves modern MediaImage entries untouched (success and failure alike)", () => {
    const out = normalizeAltTextResults([modernOk, modernFailed]);
    expect(out[0].error).toBeUndefined();
    expect(out[1].error).toBe(modernFailed.error);
  });

  it("mixed rows keep accurate per-entry truth", () => {
    const out = normalizeAltTextResults([legacyEntry, modernOk]);
    expect(out.filter((r) => !r.error).length).toBe(1);
    expect(isLegacyAltTextEntry(legacyEntry)).toBe(true);
    expect(isLegacyAltTextEntry(modernOk)).toBe(false);
  });

  it("tolerates junk payloads", () => {
    expect(normalizeAltTextResults(null)).toEqual([]);
    expect(normalizeAltTextResults(undefined)).toEqual([]);
    expect(normalizeAltTextResults("not-an-array")).toEqual([]);
  });
});
