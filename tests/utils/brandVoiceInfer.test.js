/**
 * Phase 4 item 4 — infer the brand voice instead of asking for it.
 *
 * The retired `/app/setup` asked five questions about tone and audience before
 * the merchant had seen the app do anything. Most people answered badly or not
 * at all, and a blank brand voice produces generic copy — so the form that
 * existed to improve quality was mostly lowering it.
 *
 * The shop already contains the answer. The two things that must hold:
 *
 *   1. it NEVER overwrites a voice the merchant set — Settings always wins
 *   2. it never invents one for a shop that has written nothing
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: { brandVoice: { findUnique: vi.fn(), upsert: vi.fn(async () => ({})) } },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { ensureInferredBrandVoice, pickVoiceSamples, buildSampleContent, inferDifferentiators, MIN_SAMPLE_CHARS, MAX_SAMPLE_CHARS } =
  await import("../../app/utils/brandVoiceInfer.server.js");

const SHOP = "alpine-supply.myshopify.com";
const long = (n) => "The board is built for riders who want control. ".repeat(n);

const scored = [
  { title: "Weak", description: long(3), scores: { combined: 30 } },
  { title: "Best", description: long(4), scores: { combined: 90 } },
  { title: "Middle", description: long(3), scores: { combined: 60 } },
  { title: "Too short", description: "Nice board.", scores: { combined: 95 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  prisma.brandVoice.findUnique.mockResolvedValue(null);
  prisma.brandVoice.upsert.mockResolvedValue({});
});

describe("choosing what to learn from", () => {
  it("takes the merchant's BEST-written descriptions, not the first three", () => {
    // Their best work is the clearest statement of their voice.
    const s = pickVoiceSamples(scored);
    expect(s.map((x) => x.title)).toEqual(["Best", "Middle", "Weak"]);
  });

  it("ignores descriptions too short to say anything about a voice", () => {
    // "Nice board." scores 95 and teaches nothing.
    expect(pickVoiceSamples(scored).map((x) => x.title)).not.toContain("Too short");
    expect(MIN_SAMPLE_CHARS).toBeGreaterThan(50);
  });

  it("returns nothing for a shop that has written nothing", () => {
    expect(pickVoiceSamples([])).toEqual([]);
    expect(pickVoiceSamples(null)).toEqual([]);
    expect(pickVoiceSamples([{ description: "" }])).toEqual([]);
  });

  it("bounds what gets stored — this text goes into every prompt", () => {
    const huge = [{ title: "T", text: "x".repeat(99999), score: 1 }];
    expect(buildSampleContent(huge).length).toBeLessThanOrEqual(MAX_SAMPLE_CHARS);
  });

  it("builds nothing from nothing rather than an empty-ish string", () => {
    expect(buildSampleContent([])).toBe("");
    expect(buildSampleContent(null)).toBe("");
  });
});

describe("writing it", () => {
  it("creates the row from the shop's own name and copy", async () => {
    const r = await ensureInferredBrandVoice(SHOP, { scored, shopName: "Alpine Supply" });

    expect(r.created).toBe(true);
    const call = prisma.brandVoice.upsert.mock.calls[0][0];
    expect(call.create.storeName).toBe("Alpine Supply");
    expect(call.create.sampleContent).toContain("Best");
  });

  it("NEVER overwrites a voice the merchant set — Settings always wins", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: SHOP });
    const r = await ensureInferredBrandVoice(SHOP, { scored, shopName: "Alpine Supply" });
    expect(r.created).toBe(false);
    expect(prisma.brandVoice.upsert).not.toHaveBeenCalled();
  });

  it("the upsert's UPDATE branch is empty, so a race cannot overwrite either", async () => {
    // The row could appear between the read and the write. An `update` with
    // anything in it would clobber a merchant's own settings in that window.
    await ensureInferredBrandVoice(SHOP, { scored, shopName: "Alpine Supply" });
    expect(prisma.brandVoice.upsert.mock.calls[0][0].update).toEqual({});
  });

  it("falls back to the shop handle rather than an empty name", async () => {
    // "" reads as a bug on the dashboard hero; "alpine-supply" reads as a name.
    await ensureInferredBrandVoice(SHOP, { scored, shopName: null });
    expect(prisma.brandVoice.upsert.mock.calls[0][0].create.storeName).toBe("alpine-supply");
  });

  it("still creates the row for a shop with no copy of its own, with empty samples", async () => {
    // A blank sampleContent is honest. Inventing a voice would not be.
    await ensureInferredBrandVoice(SHOP, { scored: [], shopName: "Alpine Supply" });
    expect(prisma.brandVoice.upsert.mock.calls[0][0].create.sampleContent).toBe("");
  });

  it("never throws — a brand voice is not worth failing a page load for", async () => {
    prisma.brandVoice.findUnique.mockRejectedValue(new Error("db down"));
    expect(await ensureInferredBrandVoice(SHOP, { scored })).toEqual({ created: false });
  });

  it("is not gated by plan — the code path takes no entitlement at all", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/utils/brandVoiceInfer.server.js", "utf8");
    // Charging for a brand voice means deliberately shipping worse writing to
    // free shops.
    expect(src).not.toMatch(/checkEntitlement|getEntitlements|planName/);
  });
});

/**
 * A4.6 — the inference was reading the wrong source.
 *
 * On the real store every product description was templated boilerplate
 * ("...is a quality accessories product, supplied by..."), while 21 of 30
 * sampled COLLECTIONS carried full hand-written copy naming certifications, the
 * trade counter and 25 years of trading. Sampling only products learned the
 * boilerplate and called it the merchant's voice.
 *
 * What these print if it is broken: drop `collectionCopy` from
 * `pickVoiceSamples` and "prefers hand-written collection copy" fails, showing
 * the boilerplate it picked instead.
 */
describe("A4.6 — reading collection copy, not just product copy", () => {
  const BOILERPLATE = Array.from({ length: 6 }, (_, i) => ({
    title: `NOBLE ITEM ${i}`,
    description:
      `The NOBLE ITEM ${i} is a quality accessories product, supplied by a specialist merchant. ` +
      "Designed for lasting performance and everyday reliability in homes and bathrooms everywhere.",
    scores: { combined: 45 },
  }));

  const COLLECTIONS = [
    {
      title: "Astra Walker",
      text:
        "Astra Walker tapware is designed and made in Australia and carries WaterMark certification. " +
        "We have supplied the trade for 25 years and hold trade pricing for licensed plumbers. " +
        "Ships in 2 business days with free local pickup and our price match promise.",
    },
    {
      title: "ADP",
      text:
        "ADP vanities are made in Australia to order and carry WaterMark certification. " +
        "We have supplied the trade for 25 years and hold trade pricing for licensed plumbers. " +
        "Ships in 2 business days with free local pickup and our price match promise.",
    },
    {
      title: "Aullic",
      text:
        "Aullic basins are imported and carry WaterMark certification for Australian installation. " +
        "We have supplied the trade for 25 years and hold trade pricing for licensed plumbers. " +
        "Ships in 2 business days with free local pickup and our price match promise.",
    },
  ];

  it("prefers hand-written collection copy over templated product copy", () => {
    const picked = pickVoiceSamples(BOILERPLATE, { collectionCopy: COLLECTIONS });
    const joined = picked.map((p) => p.text).join(" ");
    expect(joined).toMatch(/25 years/);
    expect(joined).toMatch(/WaterMark/);
  });

  it("still prefers genuinely good product copy over a collection", () => {
    // A store whose product descriptions are excellent must not be overridden
    // by range copy — a collection describes a RANGE, and a voice built only
    // from collections writes range copy for single products.
    const good = [
      {
        title: "Agena Cistern",
        description:
          "The Agena cistern pairs a clean square profile with dual flush efficiency, WaterMark " +
          "certified and WELS rated for modern bathrooms where space and water use both matter.",
        scores: { combined: 92 },
      },
    ];
    expect(pickVoiceSamples(good, { collectionCopy: COLLECTIONS })[0].title).toBe("Agena Cistern");
  });

  it("works with no collections at all, exactly as before", () => {
    expect(pickVoiceSamples(BOILERPLATE, { collectionCopy: [] }).length).toBeGreaterThan(0);
    expect(pickVoiceSamples(BOILERPLATE).length).toBeGreaterThan(0);
  });

  it("extracts the repeated promises as Key Differentiators", () => {
    // Repeated across the catalogue = a policy the shop makes, not prose about
    // one range. No pattern list is required for that judgement.
    const d = inferDifferentiators(COLLECTIONS.map((c) => c.text));
    expect(d).toMatch(/25 years/);
    expect(d).toMatch(/price match/i);
    // The line that appears on only ONE collection is not a policy.
    expect(d).not.toMatch(/Aullic basins are imported/);
  });

  it("invents nothing for a shop that repeats nothing", () => {
    expect(inferDifferentiators(["One.", "Two.", "Three."])).toBe("");
    expect(inferDifferentiators([])).toBe("");
  });

  it("writes differentiators create-only, so Settings still always wins", async () => {
    await ensureInferredBrandVoice(SHOP, {
      scored: BOILERPLATE,
      shopName: "EBS",
      collectionCopy: COLLECTIONS,
    });
    const call = prisma.brandVoice.upsert.mock.calls[0][0];
    expect(call.create.keyDifferentiators).toMatch(/25 years/);
    // The half that matters: an existing row is never overwritten.
    expect(call.update).toEqual({});
  });
});
