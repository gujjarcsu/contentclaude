/**
 * Phase 10 Part A — the four things that block the capture, held as tests.
 *
 *   FR8  each row shows THAT product's score, or none — two products with
 *        different scores render two different numbers; a uniform catalogue
 *        says so rather than reading as a false claim
 *   N1   the splash states what the usage card will show after the debit,
 *        from the card's own arithmetic
 *   FR13 a row's Review opens Review scoped to the product, with approve
 *        and publish on it
 *   FR14 spent credits never display as 0% — both cases
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { scoreProduct, pickWeakest, toScorable } from "../../app/utils/startState.server.js";
import { costSentence, creditsLeft, uniformScoreNote } from "../../app/utils/startCopy.js";
import { quotaPct } from "../../app/utils/quota.js";

const node = (over = {}) => ({
  id: "gid://shopify/Product/1",
  title: "Enamel Camp Mug",
  description: "",
  productType: "",
  vendor: "",
  tags: [],
  seo: { title: "", description: "" },
  featuredMedia: null,
  media: { edges: [] },
  variants: { edges: [{ node: { price: "24.00" } }] },
  ...over,
});

describe("FR8 — the row's number is that product's", () => {
  const bare = toScorable(node());
  const rich = toScorable(
    node({
      id: "gid://shopify/Product/2",
      description:
        "A 350 ml enamel mug with a rolled steel rim, kiln-fired in two coats so it takes knocks without chipping. 9 cm tall, 8 cm across, 190 g. Dishwasher safe. Made in Portugal.",
      productType: "Mugs",
      vendor: "Fernwick",
      tags: ["camping", "enamel"],
      seo: { title: "Enamel Camp Mug 350 ml — Fernwick", description: "A rolled-rim enamel mug for camp coffee, kiln-fired twice so it survives the pack." },
      featuredMedia: { preview: { image: { url: "https://cdn.example/mug.jpg" } } },
      media: { edges: [{ node: { mediaContentType: "IMAGE", image: { altText: "White enamel mug" } } }] },
    }),
  );

  it("two products of different completeness score differently, and each target carries its own score", () => {
    const a = scoreProduct(bare);
    const b = scoreProduct(rich);
    expect(a.combined).not.toBe(b.combined);
    const targets = pickWeakest([{ ...bare, scores: a }, { ...rich, scores: b }], 2);
    expect(targets.map((t) => t.scores.combined)).toEqual([a.combined, b.combined]);
    expect(targets[0].id).toBe("gid://shopify/Product/1");
  });

  it("the row badge renders target.scoreBefore and never the store score", () => {
    const src = code(readFileSync("app/components/StartState.jsx", "utf8"));
    expect(src).toMatch(/This product: \{scoreBefore\}\/100/);
    expect(src).not.toMatch(/This product: \$\{scan\.storeScore\}/);
    expect(readFileSync("app/utils/startState.server.js", "utf8")).toMatch(/scoreBefore: p\.scores\.combined/);
  });

  it("a uniform catalogue is said to be one; different scores get no note", () => {
    expect(uniformScoreNote([{ scoreBefore: 21 }, { scoreBefore: 21 }, { scoreBefore: 21 }], 12)).toMatch(/^These 3 products all score 21: they are missing the same things, so each one's number is the same as the store's\./);
    expect(uniformScoreNote([{ scoreBefore: 21 }, { scoreBefore: 34 }], 12)).toBeNull();
    expect(uniformScoreNote([{ scoreBefore: 21 }], 12)).toBeNull();
    expect(code(readFileSync("app/components/StartState.jsx", "utf8"))).toMatch(/uniformScoreNote\(targets, scan\.totalScanned\)/);
  });
});

describe("N1 — the splash states what the card will show", () => {
  it("the sentence's 'left after this' equals the card's 'left' after the debit", () => {
    const remaining = 100;
    const canStart = 3;
    const s = costSentence({ targets: 3, fresh: 3, canStart, remaining, monthlyCredits: 100, planName: "free" });
    expect(s).toBe("Writing 3 drafts now — 3 credits; 97 of 100 left after this on the Free plan. Nothing is published until you approve it.");
    // the usage card: monthlyCredits - used, once the 3 are spent
    expect(creditsLeft(100, 3)).toBe(97);
    expect(s).toContain(`${creditsLeft(100, 3)} of 100 left after this`);
    expect(s).not.toMatch(/of the 100 you have left/);
  });

  it("reuse and exhaustion read right", () => {
    expect(costSentence({ targets: 3, fresh: 0, canStart: 0, remaining: 97 })).toMatch(/^Your 3 drafts are below — written earlier, no credits charged again/);
    expect(costSentence({ targets: 3, fresh: 3, canStart: 0, remaining: 0 })).toMatch(/^You have no credits left this month/);
    expect(costSentence({ targets: 3, fresh: 2, canStart: 2, remaining: 10, monthlyCredits: 100, planName: "pro", alreadyDrafted: 1 })).toBe(
      "Writing 2 drafts now — 2 credits; 8 of 100 left after this. Nothing is published until you approve it. 1 is already written and shown at no charge.",
    );
    expect(costSentence({ targets: 0, fresh: 0, canStart: 0, remaining: 5 })).toBe("");
  });

  it("the splash uses the pure sentence and passes the allowance", () => {
    const src = code(readFileSync("app/components/StartState.jsx", "utf8"));
    expect(src).toMatch(/costSentence\(\{[\s\S]*monthlyCredits: start\.monthlyCredits/);
    expect(src).not.toMatch(/you have left this month/);
  });
});

describe("FR13 — Review opens Review, scoped to the product", () => {
  it("the Products row navigates with the product id", () => {
    expect(code(readFileSync("app/routes/app.products.jsx", "utf8"))).toMatch(/navigate\(rowActionLabel\(id, description\) === "Review" \? `\/app\/review\?product=\$\{numericId\}` : `\/app\/products\/\$\{numericId\}`\)/); // Phase 12 A1: one navigate, after the bubble is stopped
  });
  it("the Review loader honours ?product= (numeric only) and the page says it is scoped, with a way back to all", () => {
    const src = code(readFileSync("app/routes/app.review.jsx", "utf8"));
    expect(src).toMatch(/const scopedTo = \/\^\\d\+\$\/\.test\(productParam\) \? `\$\{PRODUCT_GID_PREFIX\}\$\{productParam\}` : null;/);
    expect(src).toMatch(/\? \{ shop, status: "draft", productId: scopedTo \}/);
    expect(src).toMatch(/title="Showing one product"/);
    expect(src).toMatch(/content: "Show all drafts", onAction: \(\) => navigate\("\/app\/review"\)/);
  });
});

describe("FR14 — spent credits never display as 0%", () => {
  it("3 of 100 is 3%; 19 of 4,000 is 1%, not 0%", () => {
    expect(quotaPct(3, 100)).toBe(3);
    expect(quotaPct(19, 4000)).toBe(1);
    expect(quotaPct(1, 4000)).toBe(1);
    expect(quotaPct(0, 4000)).toBe(0);
  });
});
