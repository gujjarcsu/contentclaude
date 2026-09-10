/**
 * Group 4.5 — the app must not degrade good copy.
 *
 * The case this exists for, observed on a real store's Review screen:
 *
 *   merchant: "Buy the Agena Cistern by Lukka Bathware in White. Ships in 2
 *              business days. Free Punchbowl pickup & price match - EBS."
 *   ours:     "Shop the Lukka Bathware Agena cistern — dual flush, WaterMark
 *              certified, WELS rated. Clean square design for modern bathrooms.
 *              Available at EBS."
 *
 * Better on keywords, worse commercially: two-day dispatch, free local pickup
 * and price match deleted, replaced with "Available at EBS." For an app sold on
 * search performance that is a click-through regression presented as an
 * improvement, and the merchant finds out from their own sales.
 *
 * ── What these print if the thing they watch is broken ───────────────────
 *
 * Remove the `droppedClaims` call from `assessContent` and the two gate cases
 * fail: the Agena rewrite passes clean with no reason and nothing withheld.
 *
 * ── What they cannot prove ───────────────────────────────────────────────
 *
 * That CLAIM_PATTERNS covers every promise a merchant can make. It covers
 * shipping, pickup, price, warranty, returns, certification, compliance,
 * provenance, trade terms and stock. A promise phrased outside those shapes is
 * invisible to this, and the merchant would not be warned. That is a coverage
 * limit, and it is why `recurringClaims` exists as the second, pattern-free
 * route: anything a shop repeats across its catalogue is treated as a promise
 * whether or not it matches a pattern.
 */
import { describe, it, expect } from "vitest";
import {
  claimsIn,
  droppedClaims,
  describeDropped,
  recurringClaims,
  sentences,
} from "../../app/utils/standingClaims.js";
import { assessContent } from "../../app/utils/contentQuality.js";
import { HAND_WRITTEN, COMPLIANCE_CLAIMS } from "../fixtures/storeShapes.js";

const MERCHANT =
  "Buy the Agena Cistern by Lukka Bathware in White. Ships in 2 business days. " +
  "Free Punchbowl pickup & price match - EBS.";

const OURS_BAD =
  "Shop the Lukka Bathware Agena cistern — dual flush, WaterMark certified, WELS rated. " +
  "Clean square design for modern bathrooms. Available at EBS.";

const OURS_GOOD =
  "Shop the Lukka Bathware Agena cistern — dual flush, WaterMark certified. " +
  "Dispatched within 2 business days, with free local pickup and our price match promise.";

describe("the Agena case, exactly as it happened", () => {
  it("sees what the merchant promised", () => {
    const kinds = claimsIn(MERCHANT).map((c) => c.kind);
    expect(kinds).toContain("shipping");
    expect(kinds).toContain("pickup");
    expect(kinds).toContain("price");
  });

  it("catches the rewrite that dropped all three", () => {
    const dropped = droppedClaims(MERCHANT, OURS_BAD).map((c) => c.kind);
    expect(dropped).toEqual(expect.arrayContaining(["shipping", "pickup", "price"]));
  });

  it("quotes the merchant's own words back, not a category name", () => {
    // "You removed a shipping claim" is a category. "Ships in 2 business days"
    // is the sentence they wrote, and it is the one they can act on.
    expect(describeDropped(droppedClaims(MERCHANT, OURS_BAD))).toContain("Ships in 2 business days");
  });

  it("does NOT complain when the rewrite keeps every promise, said differently", () => {
    // The gate is useless if it demands the exact sentence. "Dispatched within
    // 2 business days" keeps the promise; failing it would train merchants to
    // switch the gate off.
    expect(droppedClaims(MERCHANT, OURS_GOOD)).toEqual([]);
  });

  it("one sentence can carry several promises", () => {
    // An earlier version stopped at the FIRST matching pattern per sentence, so
    // a good rewrite that packed shipping, pickup and price into one sentence
    // was reported as dropping two of them. Found by running it against the
    // real before/after pair, not by a test.
    const kinds = claimsIn("Dispatched within 2 business days, with free local pickup and price match.").map(
      (c) => c.kind,
    );
    expect(new Set(kinds)).toEqual(new Set(["shipping", "pickup", "price"]));
  });

  it("says nothing about copy that made no promises", () => {
    expect(droppedClaims("A square cistern in white.", "A white cistern, square.")).toEqual([]);
    expect(describeDropped([])).toBeNull();
  });
});

describe("the gate treats compliance differently from commerce", () => {
  const assess = (existing, proposed) =>
    assessContent({
      description: proposed,
      product: { title: "Agena Cistern White", vendor: "Lukka Bathware", productType: "Cisterns" },
      existingDescription: existing,
      score: 85,
    });

  it("a dropped SHIPPING claim warns but still saves", () => {
    // It must not block: an honest rewrite that simply said it another way
    // would be blocked too, and that is how a gate gets disabled.
    const a = assess(MERCHANT, OURS_BAD);
    expect(a.droppedClaimKinds).toEqual(expect.arrayContaining(["shipping", "pickup", "price"]));
    expect(a.hardFailures).toEqual([]);
    expect(a.pass).toBe(true);
    expect(a.reasons.join(" ")).toMatch(/removes something your own description promised/i);
  });

  it("a dropped COMPLIANCE claim is a hard failure", () => {
    // "Installation by a licensed plumber is required by law" is not a style
    // choice, and on some products dropping it is a legal exposure for the
    // merchant, not just a worse description.
    const existing = COMPLIANCE_CLAIMS[0].description;
    const a = assess(existing, "A five star rated tap in a modern finish for contemporary bathrooms.");
    expect(a.hardFailures.length).toBeGreaterThan(0);
    expect(a.pass).toBe(false);
  });

  it("keeping the certification keeps it passing", () => {
    const existing = COMPLIANCE_CLAIMS[0].description;
    const a = assess(
      existing,
      "WaterMark certified WMKA12345 and WELS rated at 5 star, 6.0 litres per minute. " +
        "Complies with AS/NZS 3718. Installation by a licensed plumber is required by law.",
    );
    expect(a.hardFailures).toEqual([]);
  });

  it("says nothing when there was no existing copy to protect", () => {
    // Generating for a genuinely empty product cannot drop anything.
    const a = assess("", OURS_BAD);
    expect(a.droppedClaims).toEqual([]);
    expect(a.pass).toBe(true);
  });
});

describe("learning a shop's promises without being told", () => {
  it("a sentence repeated across the catalogue is a policy", () => {
    // HAND_WRITTEN carries the same warranty, dispatch and pickup sentence on
    // every product. Appearing once is prose; appearing on all of them is a
    // promise the shop makes.
    const found = recurringClaims(HAND_WRITTEN.map((p) => p.description));
    expect(found.length).toBeGreaterThan(0);
    const kinds = found.map((f) => f.kind);
    expect(kinds).toContain("shipping");
  });

  it("refuses to call anything a policy on too small a sample", () => {
    // Three products repeating a sentence is a coincidence, not a policy.
    expect(recurringClaims(["Ships in 2 business days."])).toEqual([]);
    expect(recurringClaims([])).toEqual([]);
    expect(recurringClaims(null)).toEqual([]);
  });

  it("ignores a phrase that appears on only one product", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Product ${i} is blue and made of steel.`);
    many.push("This one alone offers free overnight shipping and a price match promise.");
    const found = recurringClaims(many).map((f) => f.text);
    expect(found.join(" ")).not.toMatch(/overnight/i);
  });

  it("splits on real sentence boundaries and separators", () => {
    expect(sentences("A. B! C? D | E")).toEqual(["A.", "B!", "C?", "D", "E"]);
  });
});
