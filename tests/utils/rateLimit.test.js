/**
 * Unit tests for app/utils/rateLimit.server.js (in-process fallback path)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Disable Redis so we exercise the in-process fallback
vi.stubEnv("REDIS_URL", "");

const { checkRateLimit } = await import("../../app/utils/rateLimit.server.js");

describe("checkRateLimit (in-process fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows requests under the limit", async () => {
    const shop = `shop-${Math.random()}@test`;
    const result = await checkRateLimit(shop, { maxPerMinute: 5 });
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("blocks requests over the limit within the same window", async () => {
    const shop = `shop-${Math.random()}@test`;
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(shop, { maxPerMinute: 3 });
    }
    const result = await checkRateLimit(shop, { maxPerMinute: 3 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    const shop = `shop-${Math.random()}@test`;
    for (let i = 0; i < 2; i++) {
      await checkRateLimit(shop, { maxPerMinute: 2 });
    }
    // Blocked
    expect((await checkRateLimit(shop, { maxPerMinute: 2 })).allowed).toBe(false);

    // Advance past the 60-second window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again
    expect((await checkRateLimit(shop, { maxPerMinute: 2 })).allowed).toBe(true);
  });
});
