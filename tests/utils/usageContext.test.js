/**
 * `UsageRecord.tokensUsed` was a dead column — written as the literal 0 at both
 * of the only two places it is ever written, read by nothing, never once
 * holding a real value.
 *
 * The reason a simple module-level observer was rejected is the concurrency
 * case below. The bulk processor runs generations in parallel; a single shared
 * callback cannot tell which generation a token count belongs to, and would
 * charge them all to whichever record was assigned last. Mis-attributed numbers
 * are worse than absent ones, because they look right.
 */
import { describe, it, expect } from "vitest";
import { withUsageRecord, currentUsageRecord } from "../../app/utils/usageContext.server.js";

describe("usage context", () => {
  it("makes the current record visible to code running inside it", async () => {
    const seen = await withUsageRecord({ usageRecordId: "rec_1", shop: "a.myshopify.com" }, async () => {
      return currentUsageRecord();
    });
    expect(seen).toEqual({ usageRecordId: "rec_1", shop: "a.myshopify.com" });
  });

  it("is null outside any generation", () => {
    expect(currentUsageRecord()).toBeNull();
  });

  it("survives awaits — the context follows the async chain", async () => {
    const seen = await withUsageRecord({ usageRecordId: "rec_2", shop: "b.myshopify.com" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      return currentUsageRecord()?.usageRecordId;
    });
    expect(seen).toBe("rec_2");
  });

  it("THE REASON THIS IS NOT A MODULE-LEVEL OBSERVER: concurrent generations do not cross", async () => {
    // Interleaved on purpose, with the first one finishing LAST — which is
    // exactly the ordering that makes a shared mutable observer report the
    // wrong id.
    const [a, b, c] = await Promise.all([
      withUsageRecord({ usageRecordId: "A", shop: "s" }, async () => {
        await new Promise((r) => setTimeout(r, 20));
        return currentUsageRecord()?.usageRecordId;
      }),
      withUsageRecord({ usageRecordId: "B", shop: "s" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return currentUsageRecord()?.usageRecordId;
      }),
      withUsageRecord({ usageRecordId: "C", shop: "s" }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return currentUsageRecord()?.usageRecordId;
      }),
    ]);
    expect([a, b, c]).toEqual(["A", "B", "C"]);
  });

  it("runs the work unwrapped when there is no record, rather than refusing", async () => {
    // A path that generates without taking a credit must still generate.
    // Absence of accounting is never a reason to fail a merchant's request.
    const out = await withUsageRecord({ usageRecordId: null, shop: "s" }, async () => "generated");
    expect(out).toBe("generated");
    expect(currentUsageRecord()).toBeNull();
  });

  it("does not leak the context to code that runs after it", async () => {
    await withUsageRecord({ usageRecordId: "rec_3", shop: "s" }, async () => "x");
    expect(currentUsageRecord()).toBeNull();
  });
});
