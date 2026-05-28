/**
 * Circuit breaker tests for app/utils/ai.server.js
 *
 * Isolated in its own file so the module-level circuit state
 * starts fresh (Vitest isolates module instances per file).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.useFakeTimers();

const mockFetch = vi.fn();
global.fetch = mockFetch;

process.env.ANTHROPIC_API_KEY = "sk-test-key";

const { generateProductContent } = await import("../../app/utils/ai.server.js");

const minProduct = {
  title: "T", productType: "", vendor: "",
  description: "", descriptionHtml: "",
  imageUrl: "", variants: [], tags: [],
};

const fail503 = { ok: false, status: 503, text: async () => "Service Unavailable" };

describe("circuit breaker (ai.server.js)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens after 5 consecutive failures and blocks further calls", async () => {
    // Each failed generateProductContent accumulates 2 failures (attempts 0 and 1;
    // attempt 2 throws directly without calling recordFailure).
    // After 2 full-fail calls = 4 failures.
    // On the 3rd call: attempt 0 → 5th failure → circuit opens;
    // attempt 1 → checkCircuit() returns false → "AI service temporarily unavailable".

    mockFetch.mockResolvedValue(fail503);

    // Attach rejection handler BEFORE running timers to avoid unhandled rejection warnings.

    // Call 1 — fails after 3 fetch attempts, accumulates 2 failures
    const p1 = expect(generateProductContent(minProduct, {}, ["metaTitle"])).rejects.toThrow();
    await vi.runAllTimersAsync();
    await p1;

    // Call 2 — same, total failures = 4
    const p2 = expect(generateProductContent(minProduct, {}, ["metaTitle"])).rejects.toThrow();
    await vi.runAllTimersAsync();
    await p2;

    // Call 3 — attempt 0 triggers 5th failure → circuit opens; attempt 1 is blocked
    const p3 = expect(generateProductContent(minProduct, {}, ["metaTitle"])).rejects.toThrow(
      "AI service temporarily unavailable"
    );
    await vi.runAllTimersAsync();
    await p3;

    // Call 4 — circuit is open, blocked immediately with no fetch
    const fetchCountBefore = mockFetch.mock.calls.length;
    await expect(
      generateProductContent(minProduct, {}, ["metaTitle"])
    ).rejects.toThrow("AI service temporarily unavailable");
    expect(mockFetch.mock.calls.length).toBe(fetchCountBefore);
  });

  it("auto-closes after the 60-second cooldown and allows calls again", async () => {
    // Circuit is still open from the previous test — advance past CIRCUIT_COOLDOWN_MS.
    vi.advanceTimersByTime(61_000);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: "<META_TITLE>Recovered</META_TITLE>" }] }),
    });

    const result = await generateProductContent(minProduct, {}, ["metaTitle"]);
    expect(result.metaTitle).toBe("Recovered");
  });
});
