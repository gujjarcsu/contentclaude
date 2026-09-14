/**
 * P0.6 — the routing and pricing table.
 *
 * These assertions exist because this file is the single number that the whole
 * of 08-ECONOMICS.md moves with. A silent edit here re-prices the business.
 */
import { describe, it, expect } from "vitest";
import {
  MODELS,
  MODEL_PRICING,
  MODEL_FOR,
  CONTENT_TYPES,
  modelFor,
  costUsd,
  costMicroUsd,
  formatUsd,
} from "../../app/utils/modelPricing.js";

describe("model routing", () => {
  it("routes every content type to a model that has a price", () => {
    // An unpriced model would make its generations look free, which is the one
    // way a cost table can be worse than having no cost table.
    for (const type of CONTENT_TYPES) {
      const model = modelFor(type);
      expect(MODEL_PRICING[model], `${type} -> ${model} has no price entry`).toBeDefined();
    }
  });

  it("keeps alt text and social on a cheap model — P0.6's actual requirement", () => {
    // Alt text is the highest-volume content type we generate (one per image).
    // If a future edit moves it to a frontier model, that is a several-fold
    // cost rise on the most common call in the product, and this fails.
    for (const type of ["altText", "social"]) {
      const price = MODEL_PRICING[modelFor(type)];
      expect(price.input, `${type} input price`).toBeLessThanOrEqual(1.0);
      expect(price.output, `${type} output price`).toBeLessThanOrEqual(5.0);
    }
  });

  it("refuses an unknown content type instead of defaulting", () => {
    // A default would mean a new content type quietly billing at frontier rates
    // with nobody having decided that.
    expect(() => modelFor("podcast")).toThrow(/No model routing/);
  });

  it("every routed model is one of the declared MODELS", () => {
    const declared = new Set(Object.values(MODELS));
    for (const type of CONTENT_TYPES) {
      expect(declared.has(MODEL_FOR[type]), `${type} uses an undeclared model id`).toBe(true);
    }
  });
});

describe("cost arithmetic", () => {
  it("prices a Sonnet 4.6 call from published rates", () => {
    // 10,000 in at $3/MTok = $0.03; 2,000 out at $15/MTok = $0.03.
    expect(
      costUsd({ model: MODELS.SONNET_4_6, inputTokens: 10_000, outputTokens: 2_000 }),
    ).toBeCloseTo(0.06, 10);
  });

  it("prices a Haiku 4.5 call from published rates", () => {
    // 1,500 in at $1/MTok = $0.0015; 100 out at $5/MTok = $0.0005.
    expect(costUsd({ model: MODELS.HAIKU_4_5, inputTokens: 1_500, outputTokens: 100 })).toBeCloseTo(0.002, 10);
  });

  it("returns micro-USD as an integer", () => {
    const micro = costMicroUsd({ model: MODELS.HAIKU_4_5, inputTokens: 1_500, outputTokens: 100 });
    expect(Number.isInteger(micro)).toBe(true);
    expect(micro).toBe(2_000);
  });

  it("does not round a cheap generation away to zero", () => {
    // In cents, a single alt text rounds to 0 and every cheap generation becomes
    // free. That is why storage is micro-USD.
    const micro = costMicroUsd({ model: MODELS.HAIKU_4_5, inputTokens: 800, outputTokens: 40 });
    expect(micro).toBeGreaterThan(0);
  });

  it("stays exact when summed over a Scale-plan month", () => {
    // 25,000 generations must not drift, and must stay inside Int range.
    const one = costMicroUsd({ model: MODELS.SONNET_4_6, inputTokens: 4_000, outputTokens: 1_200 });
    const month = one * 25_000;
    expect(Number.isInteger(month)).toBe(true);
    expect(month).toBeLessThan(2_147_483_647);
  });

  it("treats a zero-token call as zero, not as an error", () => {
    expect(costUsd({ model: MODELS.SONNET_4_6, inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("refuses to price an unknown model rather than calling it free", () => {
    expect(() => costUsd({ model: "claude-imaginary-9", inputTokens: 100, outputTokens: 10 })).toThrow(
      /No pricing for model/,
    );
  });
});

describe("the published price table", () => {
  it("matches Anthropic's rates as verified 2026-09-14", () => {
    expect(MODEL_PRICING[MODELS.SONNET_4_6]).toMatchObject({ input: 3.0, output: 15.0 });
    expect(MODEL_PRICING[MODELS.SONNET_5]).toMatchObject({ input: 2.0, output: 10.0 });
    expect(MODEL_PRICING[MODELS.HAIKU_4_5]).toMatchObject({ input: 1.0, output: 5.0 });
  });

  it("records which tokenizer each model uses", () => {
    // The trap in any naive price comparison: 4.7-and-later models use a newer
    // tokenizer producing ~30% more tokens for the same text, so a lower
    // per-token price is not automatically a lower price per generation.
    for (const [model, price] of Object.entries(MODEL_PRICING)) {
      expect(["legacy", "modern"], `${model} tokenizer`).toContain(price.tokenizer);
    }
  });
});

describe("formatUsd", () => {
  it("keeps small figures legible rather than showing $0.00", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0002)).toBe("$0.000200");
    expect(formatUsd(0.0456)).toBe("$0.0456");
    expect(formatUsd(12.5)).toBe("$12.50");
  });
});
