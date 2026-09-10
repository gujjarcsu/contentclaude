/**
 * Group 1 — the candidate primitive.
 *
 * ── What these tests would print if the thing they watch were broken ──────
 *
 * Revert `scopeQueryFor` to returning "" (which is what the app effectively did
 * — an unfiltered `productsCount`) and the first four cases fail naming the
 * exact query that went missing. Revert `readCount` to `payload?.count ?? 0`
 * and the precision cases fail. Revert `actionFor` to the old two-state
 * "has our content or needs content" and every ENHANCE case fails.
 *
 * The store-shape cases are written against the named fixtures rather than
 * inline objects, so "which merchant does this protect" is answerable from the
 * test name. A shape with no case here is a defect not yet found.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCOPE,
  normaliseScope,
  scopeQueryFor,
  scopeLabelFor,
  collectionScopeQueryFor,
  isCandidate,
  actionFor,
  hasRealContent,
  readCount,
  formatCount,
  CONTENT_ACTION,
  CONTENT_ACTION_TONE,
} from "../../app/utils/candidates.js";
import {
  ALL_ACTIVE,
  ALL_DRAFT,
  MAJORITY_ARCHIVED,
  ACTIVE_NOT_PUBLISHED,
  MULTI_CHANNEL,
  B2B_ONLY,
  NO_CONTENT,
  BLANK_MARKUP_CONTENT,
  HAND_WRITTEN,
} from "../fixtures/storeShapes.js";

const countOf = (list, scope) => list.filter((p) => isCandidate(p, scope)).length;

describe("the query that replaces an unfiltered productsCount", () => {
  it("selects active products published to the online store, by default", () => {
    // This exact string is the fix. An empty query here IS the original bug.
    expect(scopeQueryFor()).toBe("status:active AND published_status:published");
    expect(scopeQueryFor({})).toBe("status:active AND published_status:published");
  });

  it("widens to drafts only when the merchant asks", () => {
    // Some merchants draft in bulk and publish in batches. A default is not a law.
    expect(scopeQueryFor({ includeDrafts: true })).toBe(
      "(status:active OR status:draft) AND published_status:published",
    );
  });

  it("drops the status clause entirely when every status is wanted", () => {
    // `status:active OR status:draft OR status:archived` is every product, and
    // sending it as a filter invites Shopify to do work for no reason.
    expect(scopeQueryFor({ includeDrafts: true, includeArchived: true })).toBe("published_status:published");
  });

  it("can drop the publication requirement for a merchant who wants everything", () => {
    expect(scopeQueryFor({ includeDrafts: true, includeArchived: true, requireOnlineStore: false })).toBe("");
  });

  it("names the population in words the merchant can check", () => {
    // Group 2.1: a number whose population is unstated cannot be verified.
    expect(scopeLabelFor()).toBe("active products published to your online store");
    expect(scopeLabelFor({ includeDrafts: true })).toBe(
      "active and draft products published to your online store",
    );
    expect(scopeLabelFor({ requireOnlineStore: false })).toBe("active products");
  });

  it("collections have no status, only publication", () => {
    expect(collectionScopeQueryFor()).toBe("published_status:published");
    expect(collectionScopeQueryFor({ requireOnlineStore: false })).toBe("");
  });

  it("the default scope is frozen, so no caller can mutate everyone else's", () => {
    expect(Object.isFrozen(DEFAULT_SCOPE)).toBe(true);
    expect(normaliseScope(undefined)).toEqual({
      includeDrafts: false,
      includeArchived: false,
      requireOnlineStore: true,
    });
  });
});

describe("store shapes: which products may an action touch", () => {
  it("all-active, all published: every product is a candidate", () => {
    expect(countOf(ALL_ACTIVE)).toBe(ALL_ACTIVE.length);
  });

  it("a store being built (all drafts): NOTHING is a candidate", () => {
    // The old code would have offered to optimize all twenty. Every generation
    // would have been spent on a page with no public URL.
    expect(countOf(ALL_DRAFT)).toBe(0);
  });

  it("all-drafts becomes optimisable the moment the merchant opts in", () => {
    expect(countOf(ALL_DRAFT, { includeDrafts: true, requireOnlineStore: false })).toBe(ALL_DRAFT.length);
  });

  it("opting into DRAFTS never opts into archived", () => {
    // A1.2 — the over-correction case. A merchant who drafts in bulk wants
    // their drafts counted; nobody wants an archived product optimized, and
    // widening one axis must not quietly widen the other.
    const archived = { status: "ARCHIVED", publishedOnOnlineStore: true };
    expect(isCandidate(archived, { includeDrafts: true })).toBe(false);
    expect(scopeQueryFor({ includeDrafts: true })).not.toMatch(/archived/);
    // And the drafts it DOES admit still need a public page.
    expect(isCandidate({ status: "DRAFT", publishedOnOnlineStore: false }, { includeDrafts: true })).toBe(false);
    expect(isCandidate({ status: "DRAFT", publishedOnOnlineStore: true }, { includeDrafts: true })).toBe(true);
  });

  it("majority-archived: only the active, published slice counts", () => {
    // The real proportions that produced the defect. 32 products, 14 candidates.
    expect(MAJORITY_ARCHIVED.length).toBe(32);
    expect(countOf(MAJORITY_ARCHIVED)).toBe(14);
  });

  it("ACTIVE but not on the online store is NOT a candidate", () => {
    // The axis the app ignored entirely. These have no public page at all.
    expect(ACTIVE_NOT_PUBLISHED.every((p) => p.status === "ACTIVE")).toBe(true);
    expect(countOf(ACTIVE_NOT_PUBLISHED)).toBe(0);
  });

  it("multi-channel: exactly the online-store half", () => {
    expect(countOf(MULTI_CHANNEL)).toBe(MULTI_CHANNEL.length / 2);
  });

  it("a trade-only B2B catalogue is not a consumer SEO population", () => {
    expect(countOf(B2B_ONLY)).toBe(0);
  });

  it("an unknown publication state is EXCLUDED, not assumed published", () => {
    // Counting an unknown as a candidate is exactly how the original defect
    // happened: absence of evidence read as evidence of eligibility.
    expect(isCandidate({ status: "ACTIVE" })).toBe(false);
    expect(isCandidate({ status: "ACTIVE", publishedOnOnlineStore: undefined })).toBe(false);
    expect(isCandidate({ status: "ACTIVE", publishedOnOnlineStore: true })).toBe(true);
  });

  it("an unrecognised status is not silently a candidate", () => {
    expect(isCandidate({ status: "SOMETHING_NEW", publishedOnOnlineStore: true })).toBe(false);
  });

  it("an empty catalogue is zero candidates, not a crash", () => {
    expect(countOf([])).toBe(0);
  });
});

describe("'has no content' and 'not yet optimized by us' are different states", () => {
  it("a product the merchant wrote copy for offers ENHANCE, not GENERATE", () => {
    // The defect: a store where all 100 sampled products had descriptions was
    // told 3,146 of them "Need Content".
    expect(actionFor({ hasOwnContent: true, hasOurContent: false })).toBe(CONTENT_ACTION.ENHANCE);
  });

  it("a genuinely empty product offers GENERATE", () => {
    expect(actionFor({ hasOwnContent: false, hasOurContent: false })).toBe(CONTENT_ACTION.GENERATE);
  });

  it("anything we have written is OPTIMIZED regardless of what preceded it", () => {
    expect(actionFor({ hasOwnContent: true, hasOurContent: true })).toBe(CONTENT_ACTION.OPTIMIZED);
    expect(actionFor({ hasOwnContent: false, hasOurContent: true })).toBe(CONTENT_ACTION.OPTIMIZED);
  });

  it("defaults to GENERATE only when it genuinely knows nothing", () => {
    expect(actionFor()).toBe(CONTENT_ACTION.GENERATE);
  });

  it("ENHANCE is NOT critical-toned", () => {
    // Red says "you have a problem". A merchant's own writing is not a problem,
    // and telling them it is loses the install in the first thirty seconds.
    expect(CONTENT_ACTION_TONE[CONTENT_ACTION.ENHANCE]).not.toBe("critical");
    expect(CONTENT_ACTION_TONE[CONTENT_ACTION.GENERATE]).toBe("critical");
  });

  it("whitespace and empty markup are not content", () => {
    expect(hasRealContent("")).toBe(false);
    expect(hasRealContent("   ")).toBe(false);
    expect(hasRealContent("<p>&nbsp;</p>  <br>")).toBe(false);
    expect(hasRealContent("<p>Real words.</p>")).toBe(true);
    expect(hasRealContent(null)).toBe(false);
    expect(hasRealContent(undefined)).toBe(false);
  });

  it("store shape: a catalogue of hand-written copy has ZERO products to generate", () => {
    const actions = HAND_WRITTEN.map((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }));
    expect(actions.every((a) => a === CONTENT_ACTION.ENHANCE)).toBe(true);
    expect(actions.filter((a) => a === CONTENT_ACTION.GENERATE)).toHaveLength(0);
  });

  it("store shape: an empty catalogue is all GENERATE", () => {
    const actions = NO_CONTENT.map((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }));
    expect(actions.every((a) => a === CONTENT_ACTION.GENERATE)).toBe(true);
  });

  it("store shape: blank markup counts as GENERATE, not ENHANCE", () => {
    const actions = BLANK_MARKUP_CONTENT.map((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }));
    expect(actions.every((a) => a === CONTENT_ACTION.GENERATE)).toBe(true);
  });
});

describe("Shopify's count precision, which the app never read", () => {
  it("an exact count is exact", () => {
    expect(readCount({ count: 1350, precision: "EXACT" })).toEqual({ count: 1350, exact: true });
  });

  it("AT_LEAST means Shopify hit a limit — the number is a floor, not a total", () => {
    // "A limit was imposed and reached." A 50,000-product merchant was being
    // shown a capped number as their catalogue total, on the very header they
    // would use to check it.
    expect(readCount({ count: 10000, precision: "AT_LEAST" })).toEqual({ count: 10000, exact: false });
    expect(formatCount(readCount({ count: 10000, precision: "AT_LEAST" }))).toBe("10000+");
  });

  it("a missing payload is null, NEVER zero", () => {
    // Zero is a claim: "you have no products". "We could not read it" is a
    // different claim, and the app must not make the first one on the second's
    // evidence — the same shape as the 4.3 baseline that would have read 0 -> 84.
    expect(readCount(null)).toBeNull();
    expect(readCount(undefined)).toBeNull();
    expect(readCount({})).toBeNull();
    expect(readCount({ count: "12" })).toBeNull();
    expect(formatCount(null)).toBe("—");
  });

  it("treats a count with no precision field as exact", () => {
    // Older API versions omit it. Absent is not AT_LEAST.
    expect(readCount({ count: 7 })).toEqual({ count: 7, exact: true });
  });
});
