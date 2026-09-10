/**
 * Phase 4 item 4.1 — the quality gate.
 *
 * The duplicate check is the rule most likely to be quietly skipped, and the
 * one that stops the app producing five hundred near-identical descriptions —
 * exactly what a merchant leaves a one-star review about. So it gets the most
 * tests here, in BOTH directions:
 *
 *   - it must catch a template reused across products (the real failure)
 *   - it must NOT fire on two genuinely different descriptions that share a
 *     brand voice (the failure that would make merchants turn the gate off)
 *
 * A duplicate check that always passes is indistinguishable from no duplicate
 * check, and it would be the easiest thing in this project to ship by accident.
 */
import { describe, it, expect } from "vitest";

const {
  assessContent,
  simhash,
  hammingDistance,
  findDuplicate,
  externalLinks,
  placeholdersIn,
  languageLooksRight,
  productAgnosticTokens,
  describeAssessment,
  QUALITY_THRESHOLD,
  DUPLICATE_MAX_DISTANCE,
  META_TITLE_MAX,
} = await import("../../app/utils/contentQuality.js");

const SHOP = "alpine-supply.myshopify.com";

/** A template a bulk run would reuse, with the product's own words swapped in. */
const template = (name, type) =>
  `<p>The ${name} is built for riders who want performance without compromise. ` +
  `Every ${type} we make goes through the same rigorous testing, from the first ` +
  `carved turn on a quiet groomed morning to the last run of the season. ` +
  `We designed the ${name} to remove itself from the equation so you can focus ` +
  `on the run ahead, with a construction that stays predictable at speed and ` +
  `forgiving when you need it to be. Ships free, returns are easy.</p>`;

const GOOD = {
  description:
    "<p>The Minimal Snowboard is a directional twin built for hardpack and spring slush alike. " +
    "<strong>A poplar core</strong> keeps it light underfoot while the carbon stringers stop it " +
    "washing out at speed.</p><ul><li>Directional twin shape</li><li>Poplar and carbon core</li>" +
    "<li>Sintered base</li></ul><p>Riders who spend their days lapping the same groomers will " +
    "notice how little they think about the board, which is the whole point of it.</p>",
  metaTitle: "The Minimal Snowboard | Alpine Supply",
  metaDescription:
    "A directional twin snowboard with a poplar and carbon core, built for hardpack and spring slush. Free shipping and easy returns.",
  product: { title: "The Minimal Snowboard", vendor: "Alpine", productType: "Snowboard" },
  shopDomain: SHOP,
  score: 85,
};

describe("a good description passes", () => {
  it("passes with no reasons", () => {
    const a = assessContent(GOOD);
    expect(a.pass).toBe(true);
    expect(a.reasons).toEqual([]);
    expect(describeAssessment(a)).toBeNull();
  });

  it("produces a fingerprint that can be stored", () => {
    const a = assessContent(GOOD);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("the duplicate check — the failure that actually happens", () => {
  it("catches the same template reused for a different product", () => {
    // This is the one-star-review scenario: a bulk run emitting the same
    // paragraphs with the product name swapped.
    const a = { title: "The Minimal Snowboard", productType: "snowboard" };
    const b = { title: "The Complete Snowboard", productType: "snowboard" };
    const fpA = simhash(template("Minimal Snowboard", "snowboard"), a);
    const fpB = simhash(template("Complete Snowboard", "snowboard"), b);

    expect(hammingDistance(fpA, fpB)).toBeLessThanOrEqual(DUPLICATE_MAX_DISTANCE);
    expect(findDuplicate(fpB, [{ productId: "p1", simhash: fpA }])).toMatchObject({ duplicate: true });
  });

  it("does NOT fire on two genuinely different descriptions in one brand voice", () => {
    // Products in a shop SHOULD sound alike. A gate that fires on shared tone
    // would block every honest description and be turned off within a day.
    const one = simhash(GOOD.description, GOOD.product);
    const two = simhash(
      "<p>The Alpine Ski Wax is a warm-weather fluoro-free wax for spring conditions. " +
        "Rub it on cold, let it sit for a minute, then buff it out with a cork. " +
        "One tin lasts most riders a full season of weekend laps, and it will not " +
        "gum up your base when the snow turns to soup in April.</p>",
      { title: "Alpine Ski Wax", productType: "Accessories" },
    );
    expect(hammingDistance(one, two)).toBeGreaterThan(DUPLICATE_MAX_DISTANCE);
    expect(findDuplicate(two, [{ productId: "p1", simhash: one }]).duplicate).toBe(false);
  });

  it("strips the product's OWN words before fingerprinting", () => {
    // The load-bearing step. Without it every fingerprint is dominated by the
    // product name, no two ever look alike, and the check silently passes
    // everything — which is exactly how this rule gets shipped broken.
    const toks = productAgnosticTokens("The Minimal Snowboard is a great snowboard for riding", {
      title: "The Minimal Snowboard",
      productType: "Snowboard",
    });
    expect(toks).not.toContain("minimal");
    expect(toks).not.toContain("snowboard");
    expect(toks).toContain("riding");
  });

  it("flags the duplicate through the full gate, with words a merchant reads", () => {
    const a = { title: "Board One", productType: "snowboard" };
    const fpA = simhash(template("Board One", "snowboard"), a);
    const assessment = assessContent({
      ...GOOD,
      description: template("Board Two", "snowboard"),
      product: { title: "Board Two", productType: "snowboard" },
      recent: [{ productId: "gid://shopify/Product/1", simhash: fpA }],
    });
    expect(assessment.pass).toBe(false);
    expect(assessment.duplicateOf).toBe("gid://shopify/Product/1");
    expect(describeAssessment(assessment)).toMatch(/almost the same as a description already written/i);
  });

  it("says nothing about text too short to fingerprint, rather than guessing", () => {
    expect(simhash("Too short.", {})).toBeNull();
    expect(findDuplicate(null, [{ simhash: "ffffffffffffffff" }]).duplicate).toBe(false);
  });

  it("treats a missing fingerprint as maximally distant, not as a match", () => {
    expect(hammingDistance(null, "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("ffffffffffffffff", undefined)).toBe(64);
  });

  it("an empty history is not a duplicate", () => {
    expect(findDuplicate(simhash(GOOD.description, GOOD.product), []).duplicate).toBe(false);
  });

  it("is deterministic — the same text always fingerprints the same", () => {
    expect(simhash(GOOD.description, GOOD.product)).toBe(simhash(GOOD.description, GOOD.product));
  });
});

describe("the hard rules", () => {
  it("rejects a page title Shopify would cut", () => {
    const a = assessContent({ ...GOOD, metaTitle: "x".repeat(META_TITLE_MAX + 1) });
    expect(a.pass).toBe(false);
    expect(a.hardFailures[0]).toMatch(/page title is \d+ characters/i);
  });

  it("rejects meta text too short to say anything", () => {
    expect(assessContent({ ...GOOD, metaTitle: "Board" }).pass).toBe(false);
    expect(assessContent({ ...GOOD, metaDescription: "Buy it." }).pass).toBe(false);
  });

  it("rejects a link that leaves the merchant's store", () => {
    const a = assessContent({
      ...GOOD,
      description: `${GOOD.description}<p><a href="https://amazon.com/dp/123">Buy on Amazon</a></p>`,
    });
    expect(a.pass).toBe(false);
    expect(a.hardFailures.join(" ")).toMatch(/amazon\.com/);
  });

  it("allows links to the merchant's OWN store and relative links", () => {
    expect(externalLinks(`<a href="https://${SHOP}/pages/sizing">Sizing</a>`, SHOP)).toEqual([]);
    expect(externalLinks('<a href="/pages/sizing">Sizing</a>', SHOP)).toEqual([]);
    expect(externalLinks(`<a href="https://www.${SHOP}/x">x</a>`, SHOP)).toEqual([]);
  });

  it.each([
    ["lorem ipsum dolor sit amet consectetur", "lorem"],
    ["Buy the [PRODUCT NAME] today for less", "bracket"],
    ["Rendered with {{ product.title }} here", "handlebars"],
    ["TODO: write the real description later", "todo"],
    ["As an AI language model, I cannot write marketing copy", "refusal"],
    ["Insert your product description here now", "insert here"],
  ])("rejects placeholder text: %s", (text) => {
    expect(placeholdersIn(text).length).toBeGreaterThan(0);
    expect(assessContent({ ...GOOD, description: text }).pass).toBe(false);
  });

  it("does not see placeholders in ordinary copy", () => {
    expect(placeholdersIn(GOOD.description)).toEqual([]);
  });

  it("rejects text that is not the shop's language", () => {
    const a = assessContent({
      ...GOOD,
      description:
        "Ceci est une description entièrement rédigée dans une autre langue, sans aucun mot anglais courant, " +
        "puisque nous vérifions simplement que le texte correspond bien à la langue déclarée par la boutique.",
      locale: "en",
    });
    expect(a.pass).toBe(false);
    expect(a.hardFailures.join(" ")).toMatch(/does not read as English/i);
  });

  it("does NOT judge a language it cannot actually check", () => {
    // Shipping a check that cannot tell French from Spanish, and failing
    // merchants on it, would be worse than admitting the limit.
    const fr = languageLooksRight("Ceci est une description de produit en français.", "fr");
    expect(fr.checked).toBe(false);
    expect(fr.ok).toBe(true);
    const a = assessContent({
      ...GOOD,
      description: "Ceci est une description de produit.",
      locale: "fr-CA",
    });
    expect(a.languageChecked).toBe(false);
    expect(a.hardFailures.join(" ")).not.toMatch(/language/i);
  });

  it("does not judge the language of text too short to judge", () => {
    expect(languageLooksRight("Short text here.", "en").checked).toBe(false);
  });
});

describe("the score gate", () => {
  it("fails below the threshold", () => {
    const a = assessContent({ ...GOOD, score: QUALITY_THRESHOLD - 1 });
    expect(a.pass).toBe(false);
    expect(a.reasons.join(" ")).toMatch(/below/);
  });

  it("passes at exactly the threshold", () => {
    expect(assessContent({ ...GOOD, score: QUALITY_THRESHOLD }).pass).toBe(true);
  });

  it("does not fail on a missing score — that is a scorer problem, not the merchant's", () => {
    expect(assessContent({ ...GOOD, score: null }).pass).toBe(true);
  });

  it("a hard failure fails even with a perfect score", () => {
    // The score is advisory; the hard rules are not.
    const a = assessContent({ ...GOOD, score: 100, metaTitle: "x".repeat(200) });
    expect(a.pass).toBe(false);
  });
});

describe("the reason a merchant reads", () => {
  it("names no internals", () => {
    const a = assessContent({ ...GOOD, metaTitle: "x".repeat(200) });
    expect(describeAssessment(a)).not.toMatch(/simhash|hamming|null|undefined|metaTitle/);
  });

  it("summarises when several rules fail at once", () => {
    const a = assessContent({
      ...GOOD,
      metaTitle: "x".repeat(200),
      description: "lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor",
    });
    expect(describeAssessment(a)).toMatch(/and \d+ other issue/);
  });
});
