/**
 * Group 5 — variant families, and the two-tier duplicate band.
 *
 * ── The defect this exists to stop shipping ────────────────────────────────
 *
 * A plumbing merchant sells one pull-out hose as seven products, one per finish.
 * Their descriptions are byte-identical apart from the finish word, which lives
 * in the TITLE — and SimHash strips the title to make the fingerprint
 * product-agnostic. All seven collapsed to distance 0: a HARD FAIL on a
 * perfectly ordinary catalogue. It would have reached merchants as "the app
 * won't write my tapware."
 *
 * ── What these tests would print if the fix were reverted ─────────────────
 *
 * Remove the family skip from `findDuplicate` and "the seven finishes are not
 * duplicates of each other" fails with verdict "fail" and distance 0 — which is
 * the exact defect, measured. Every distance below was measured, not assumed;
 * the numbers are in PROGRESS.md.
 *
 * ── What they CANNOT prove ────────────────────────────────────────────────
 *
 * That `ATTRIBUTE_WORDS` covers every catalogue's variant axis. A merchant whose
 * finishes are named something not on that list, with no variant tags and no
 * product options, gets no family and their siblings are compared normally —
 * i.e. the old behaviour. That is a coverage limit, not a correctness bug, and
 * it fails in the safe direction only because the two-tier band now makes such a
 * case a WARN rather than a block. Stated here rather than discovered later.
 */
import { describe, it, expect } from "vitest";
import {
  simhash,
  hammingDistance,
  findDuplicate,
  assessContent,
  DUPLICATE_MAX_DISTANCE,
  DUPLICATE_WARN_DISTANCE,
  DUPLICATE_VERDICT,
} from "../../app/utils/contentQuality.js";
import { familyKeyOf, axisTermsFor, sameFamily, namesItsAttribute } from "../../app/utils/variantFamily.js";
import { FINISH_FAMILY_NAMES } from "../fixtures/storeShapes.js";

// ── The real catalogue this came from ─────────────────────────────────────

const HOSE_COPY =
  "Replacement pull out hose for kitchen mixers. Braided construction with a standard thread fitting, " +
  "suitable for most pull out kitchen tapware sold in Australia. Compliant with Australian standards " +
  "and supplied with the fittings required for a straightforward replacement.";

const hoses = FINISH_FAMILY_NAMES.map((finish, i) => ({
  productId: `gid://shopify/Product/${400 + i}`,
  title: finish ? `Pull Out Kitchen Mixer Hose ${finish}` : "Pull Out Kitchen Mixer Hose",
  vendor: "Generic",
  productType: "Tapware",
  tags: finish ? [`colour:${finish.toLowerCase().replace(/ /g, "-")}`] : [],
  description: HOSE_COPY,
}));

const bolts = Array.from({ length: 40 }, (_, i) => {
  const mm = 10 + i * 5;
  return {
    productId: `gid://shopify/Product/${500 + i}`,
    title: `Hex Head Bolt M8 x ${mm}mm Galvanised`,
    vendor: "Acme",
    productType: "Fasteners",
    tags: [`size:${mm}mm`],
    description:
      `Hex head bolt, M8 thread, ${mm}mm length, hot dip galvanised to AS/NZS 4680. Sold individually ` +
      "and suitable for structural and general fixing applications across timber and steel.",
  };
});

const rowsFor = (items) =>
  items.map((p) => ({ productId: p.productId, simhash: simhash(p.description, p), familyKey: familyKeyOf(p) }));

// ── Template reuse, which must keep failing ───────────────────────────────

const TEMPLATE = (name) =>
  `The ${name} is a quality accessories product, supplied by EBS Bathroom & Plumbing Supplies. ` +
  `Designed for lasting performance and everyday reliability in Australian homes and bathrooms. ` +
  `Order online today with fast dispatch and our price match promise on every order we ship.`;

const HOOK = { title: "NOBLE ROBE HOOK CHROME", vendor: "Noble", productType: "Accessories" };
const BAR = { title: "NOBLE TOWEL BAR CHROME", vendor: "Noble", productType: "Accessories" };

describe("detecting the family", () => {
  it("all seven finishes of one hose are one family", () => {
    const keys = new Set(hoses.map((h) => familyKeyOf(h)));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("pull out kitchen mixer hose");
  });

  it("forty sizes of one bolt are one family", () => {
    expect(new Set(bolts.map((b) => familyKeyOf(b))).size).toBe(1);
  });

  it("does NOT merge genuinely different products", () => {
    // Over-merging silently disables the duplicate check between real products,
    // which is a worse failure than the one being fixed.
    expect(sameFamily({ title: "Hex Head Bolt M8 x 40mm" }, { title: "Hex Head Bolt M10 x 40mm" })).toBe(false);
    expect(
      sameFamily({ title: "Pull Out Kitchen Mixer Hose Chrome" }, { title: "Pull Out Kitchen Mixer Tap Chrome" }),
    ).toBe(false);
    expect(sameFamily(HOOK, BAR)).toBe(false);
  });

  it("a one-word stem is not a family", () => {
    // "Hose" would put every hose in the catalogue in one family.
    expect(familyKeyOf({ title: "Chrome Hose" })).toBe("");
    expect(sameFamily({ title: "Chrome Hose" }, { title: "Black Hose" })).toBe(false);
  });

  it("works from a TITLE ALONE, which is all the comparison window stores", () => {
    const fromTitleOnly = hoses.map((h) => familyKeyOf({ title: h.title }));
    expect(new Set(fromTitleOnly).size).toBe(1);
  });

  it("reads the variant axis from tags and options as well as the title", () => {
    const terms = axisTermsFor({
      title: "Basin Mixer",
      tags: ["colour:brushed-gold", "unrelated:thing"],
      options: [{ name: "Size", values: ["600mm"] }],
    });
    expect(terms.has("brushed")).toBe(true);
    expect(terms.has("gold")).toBe(true);
    expect(terms.has("600mm")).toBe(true);
    // A tag outside the axis namespaces is not a variant value.
    expect(terms.has("thing")).toBe(false);
  });
});

describe("the seven finishes are not duplicates of each other", () => {
  it("WITHOUT family awareness they are all distance 0 — the defect, measured", () => {
    const base = simhash(hoses[0].description, hoses[0]);
    for (const h of hoses.slice(1)) {
      expect(hammingDistance(base, simhash(h.description, h))).toBe(0);
    }
    // And that is a HARD FAIL, which is what would have shipped.
    const naive = findDuplicate(simhash(hoses[6].description, hoses[6]), rowsFor(hoses.slice(0, 6)));
    expect(naive.verdict).toBe(DUPLICATE_VERDICT.FAIL);
    expect(naive.distance).toBe(0);
  });

  it("WITH family awareness the siblings are skipped and it passes", () => {
    const last = hoses[6];
    const r = findDuplicate(simhash(last.description, last), rowsFor(hoses.slice(0, 6)), {
      familyKey: familyKeyOf(last),
    });
    expect(r.verdict).toBe(DUPLICATE_VERDICT.PASS);
    expect(r.duplicate).toBe(false);
    expect(r.skippedFamily).toBe(6);
  });

  it("forty fastener sizes also pass, with 39 siblings skipped", () => {
    const last = bolts[39];
    const r = findDuplicate(simhash(last.description, last), rowsFor(bolts.slice(0, 39)), {
      familyKey: familyKeyOf(last),
    });
    expect(r.verdict).toBe(DUPLICATE_VERDICT.PASS);
    expect(r.skippedFamily).toBe(39);
  });
});

describe("verbatim reuse across DIFFERENT families still hard-fails", () => {
  it("the family rule did not create a hole", () => {
    // The whole risk of the family skip is that it becomes a way to smuggle
    // template reuse past the gate. Different families, identical template.
    expect(familyKeyOf(HOOK)).toBe("noble robe hook");
    expect(familyKeyOf(BAR)).toBe("noble towel bar");

    const r = findDuplicate(
      simhash(TEMPLATE("NOBLE TOWEL BAR CHROME"), BAR),
      [{ productId: "a", simhash: simhash(TEMPLATE("NOBLE ROBE HOOK CHROME"), HOOK), familyKey: familyKeyOf(HOOK) }],
      { familyKey: familyKeyOf(BAR) },
    );
    expect(r.verdict).toBe(DUPLICATE_VERDICT.FAIL);
    expect(r.distance).toBe(0);
  });
});

describe("the two bands, against measured distances", () => {
  const distanceTo = (text, product) => hammingDistance(simhash(TEMPLATE("NOBLE ROBE HOOK CHROME"), HOOK), simhash(text, product));

  it("verbatim, name swapped: 0 -> HARD FAIL", () => {
    expect(distanceTo(TEMPLATE("NOBLE TOWEL BAR CHROME"), BAR)).toBe(0);
  });

  it("two words changed: 10 -> WARN, which the old single threshold missed", () => {
    // This is the case the band was added for. At the old threshold of 6 it
    // passed silently, and on an SEO app a near-duplicate description is the
    // exact harm we are hired to prevent.
    const light = TEMPLATE("NOBLE TOWEL BAR CHROME")
      .replace("lasting performance", "enduring performance")
      .replace("everyday reliability", "everyday dependability");
    const d = distanceTo(light, BAR);
    expect(d).toBe(10);
    expect(d).toBeGreaterThan(DUPLICATE_MAX_DISTANCE);
    expect(d).toBeLessThanOrEqual(DUPLICATE_WARN_DISTANCE);
  });

  it("a whole clause reworded: 21 -> PASSES, and that is the honest limit", () => {
    // Recorded rather than fixed. Pushing the band past 21 would start eating
    // into genuinely different content, which measures 34 on the same corpus —
    // and a gate that blocks honest writing is a gate the merchant switches off.
    const reworded = TEMPLATE("NOBLE TOWEL BAR CHROME").replace(
      "Designed for lasting performance and everyday reliability",
      "Built for long service and day to day dependability",
    );
    const d = distanceTo(reworded, BAR);
    expect(d).toBe(21);
    expect(d).toBeGreaterThan(DUPLICATE_WARN_DISTANCE);
  });

  it("a genuinely different product in the same voice: 34 -> PASS", () => {
    const different =
      "The Agena Cistern by Lukka Bathware pairs a clean square profile with dual flush efficiency. " +
      "WaterMark certified and WELS rated, it suits modern bathrooms where space is tight and water " +
      "use matters. Ships in two business days with free Punchbowl pickup and our price match promise.";
    const d = distanceTo(different, { title: "Agena Cistern White", vendor: "Lukka Bathware", productType: "Cisterns" });
    expect(d).toBe(34);
  });

  it("the WARN band saves the draft rather than blocking it", () => {
    // The entire reason for two tiers: a blocked draft is why merchants turn a
    // gate off, so WARN must never block. It marks instead.
    const light = TEMPLATE("NOBLE TOWEL BAR CHROME")
      .replace("lasting performance", "enduring performance")
      .replace("everyday reliability", "everyday dependability");
    const a = assessContent({
      description: light,
      metaTitle: "Noble Towel Bar Chrome | EBS Plumbing",
      metaDescription:
        "Buy the Noble towel bar in chrome from EBS Bathroom and Plumbing Supplies with fast dispatch and price match.",
      product: BAR,
      recent: [
        { productId: "a", simhash: simhash(TEMPLATE("NOBLE ROBE HOOK CHROME"), HOOK), familyKey: familyKeyOf(HOOK) },
      ],
      score: 80,
    });

    expect(a.duplicateVerdict).toBe(DUPLICATE_VERDICT.WARN);
    expect(a.warnOnly).toBe(true);
    expect(a.hardFailures).toEqual([]);
    // It SAVES...
    expect(a.pass).toBe(true);
    // ...and still says something, which is what stops autopilot publishing it.
    expect(a.reasons.join(" ")).toMatch(/closely resembles/i);
  });
});

describe("differentiation replaces the duplicate check inside a family", () => {
  it("copy that never names the finish is flagged", () => {
    // The real SEO defect: a Matte Black product whose description never says
    // "matte black" cannot rank for it, however unique its fingerprint is.
    const last = hoses[6];
    expect(last.title).toContain("Matte Black");
    const a = assessContent({
      description: HOSE_COPY,
      product: last,
      recent: rowsFor(hoses.slice(0, 6)),
      score: 80,
    });
    expect(a.familySiblingsSkipped).toBe(6);
    expect(a.differentiationChecked).toBe(true);
    expect(a.differentiationOk).toBe(false);
    expect(a.reasons.join(" ")).toMatch(/matte|black/i);
  });

  it("copy that names the finish is fine", () => {
    const last = hoses[6];
    const a = assessContent({
      description: `Matte black braided pull out hose for kitchen mixers. ${HOSE_COPY}`,
      product: last,
      recent: rowsFor(hoses.slice(0, 6)),
      score: 80,
    });
    expect(a.differentiationOk).toBe(true);
    expect(a.pass).toBe(true);
  });

  it("a product with NO siblings is never asked to differentiate", () => {
    // A lone product is not failed for omitting an attribute nothing contrasts
    // it with — the same discipline as the language rule declining to judge.
    const a = assessContent({ description: HOSE_COPY, product: hoses[6], recent: [], score: 80 });
    expect(a.familySiblingsSkipped).toBe(0);
    expect(a.differentiationChecked).toBe(false);
    expect(a.differentiationOk).toBe(true);
  });

  it("naming ANY axis term is enough", () => {
    const terms = axisTermsFor({ title: "Hose Brushed Gold", tags: ["colour:brushed-gold"] });
    expect(namesItsAttribute("A brushed gold finish.", terms).ok).toBe(true);
    expect(namesItsAttribute("A gold finish.", terms).ok).toBe(true);
    expect(namesItsAttribute("A shiny finish.", terms).ok).toBe(false);
  });
});
