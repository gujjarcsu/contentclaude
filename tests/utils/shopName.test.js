/**
 * The shop-name bug, both halves, by name.
 *
 * Seen in production 2026-09-14:
 *   contentpilot-dev2 — renamed to "Northline Supply" in the admin, still
 *                       greeted "E2E Test Store". Old and new name in the SAME
 *                       screenshot.
 *   navaal-ttv-03     — greeted by its raw handle.
 *
 * And the same value authors every published blog post, so the second case put
 * "navaal-ttv-03" on a merchant's public storefront.
 */
import { describe, it, expect } from "vitest";
import { handleOf, isPlaceholderName, greetingName, authorName } from "../../app/utils/shopName.js";

describe("handleOf", () => {
  it("takes the handle off a myshopify domain", () => {
    expect(handleOf("contentpilot-dev2.myshopify.com")).toBe("contentpilot-dev2");
  });

  it("does not throw on rubbish", () => {
    expect(handleOf(null)).toBe("");
    expect(handleOf(undefined)).toBe("");
    expect(handleOf("")).toBe("");
  });
});

describe("isPlaceholderName — a stored name equal to the handle was seeded, not chosen", () => {
  const shop = "navaal-ttv-03.myshopify.com";

  it("treats the raw handle as a placeholder", () => {
    expect(isPlaceholderName("navaal-ttv-03", shop)).toBe(true);
  });

  it("treats a prettified handle as a placeholder too", () => {
    // "navaal-ttv-03" and "Navaal Ttv 03" are the same non-choice.
    expect(isPlaceholderName("Navaal Ttv 03", shop)).toBe(true);
    expect(isPlaceholderName("NAVAAL_TTV_03", shop)).toBe(true);
  });

  it("treats empty and whitespace as placeholders", () => {
    expect(isPlaceholderName("", shop)).toBe(true);
    expect(isPlaceholderName("   ", shop)).toBe(true);
    expect(isPlaceholderName(null, shop)).toBe(true);
  });

  it("treats a real brand name as chosen", () => {
    expect(isPlaceholderName("Northline Supply", shop)).toBe(false);
  });
});

describe("greetingName — the live name wins so a rename shows up", () => {
  const shop = "contentpilot-dev2.myshopify.com";

  it("THE REPORTED BUG: a renamed store is greeted by its NEW name", () => {
    // Live admin says "Northline Supply"; the value captured at install still
    // says "E2E Test Store". Before this fix the stale one was displayed.
    expect(greetingName("Northline Supply", "E2E Test Store", shop)).toBe("Northline Supply");
  });

  it("falls back to the merchant's own brand name when the live name is unreadable", () => {
    expect(greetingName(null, "E2E Test Store", shop)).toBe("E2E Test Store");
  });

  it("THE SECOND BUG: never greets with the raw handle", () => {
    const ttv = "navaal-ttv-03.myshopify.com";
    // Both sources are placeholders, so there is no honest name to use.
    expect(greetingName(null, "navaal-ttv-03", ttv)).toBeNull();
    expect(greetingName("navaal-ttv-03", "navaal-ttv-03", ttv)).toBeNull();
  });

  it("returns null rather than an empty greeting when nothing is known", () => {
    // The caller renders "Welcome back!", which is always true.
    expect(greetingName(null, null, shop)).toBeNull();
    expect(greetingName("", "", shop)).toBeNull();
  });

  it("ignores a live name that is only the handle", () => {
    expect(greetingName("contentpilot-dev2", "Northline Supply", shop)).toBe("Northline Supply");
  });
});

describe("authorName — precedence flips, because authorship is a branding choice", () => {
  const shop = "contentpilot-dev2.myshopify.com";

  it("a name the merchant typed beats the shop's own name", () => {
    // The reverse of greetingName on purpose: the merchant chose this to appear
    // on their published articles.
    expect(authorName("Northline Supply", "Northline Outfitters", shop)).toBe("Northline Outfitters");
  });

  it("uses the live shop name when the stored one was only seeded", () => {
    expect(authorName("Northline Supply", "contentpilot-dev2", shop)).toBe("Northline Supply");
  });

  it("ALWAYS returns a string — ArticleCreateInput.author is non-null", () => {
    // A missing author was a hard GraphQL error and a 500 on publish, so the
    // handle stays the last resort. It must never return null or empty.
    const out = authorName(null, null, shop);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    expect(out).toBe("contentpilot-dev2");
  });

  it("still returns a usable string for a junk shop value", () => {
    expect(authorName(null, null, "")).toBe("");
  });
});
