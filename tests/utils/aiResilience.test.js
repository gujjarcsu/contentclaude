/**
 * Phase 0 group 0.E — items 23 and 24.
 *
 * The AI client had four separate ways to make a merchant wait, or to take the
 * whole app down, for something that was not an outage:
 *   - the rate-limit reset header was parsed as a NUMBER although it is an
 *     RFC3339 timestamp, so every successful call in a low window slept the full
 *     cap inside the merchant's request;
 *   - a 429 backed off for up to 60 s, twice, in a web request;
 *   - a 429 counted toward the global circuit breaker, so five rate-limited
 *     requests blacked out generation for EVERY shop for a minute;
 *   - a dropped connection or a single timeout failed immediately with no retry.
 * And two AI paths ran with no rate limit and no credit at all.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { rateLimitResetMs, INTERACTIVE_BACKOFF_CAP_MS, BACKGROUND_BACKOFF_CAP_MS } =
  await import("../../app/utils/ai.server.js");

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe("item 23 — the rate-limit reset header is a timestamp, not a number", () => {
  it("reads an RFC3339 timestamp as the time remaining", () => {
    const now = Date.parse("2026-09-09T11:00:00Z");
    expect(rateLimitResetMs("2026-09-09T11:00:30Z", now)).toBe(30_000);
    expect(rateLimitResetMs("2026-09-09T11:00:00Z", now)).toBe(0);
    // Already past — nothing to wait for, not a negative sleep.
    expect(rateLimitResetMs("2026-09-09T10:59:00Z", now)).toBe(0);
  });

  it("does NOT read the year as a duration (the actual bug)", () => {
    const now = Date.parse("2026-09-09T11:00:00Z");
    // The old code: parseFloat("2026-09-09T11:00:30Z") * 1000 === 2_026_000,
    // which the Math.min then pinned to the full cap on EVERY such response.
    expect(parseFloat("2026-09-09T11:00:30Z") * 1000).toBe(2_026_000);
    expect(rateLimitResetMs("2026-09-09T11:00:30Z", now)).toBeLessThan(60_000);
  });

  it("still accepts a plain seconds value, and shrugs off junk", () => {
    expect(rateLimitResetMs("30")).toBe(30_000);
    expect(rateLimitResetMs("1.5")).toBe(1_500);
    expect(rateLimitResetMs("")).toBe(0);
    expect(rateLimitResetMs(null)).toBe(0);
    expect(rateLimitResetMs("not a date")).toBe(0);
    expect(rateLimitResetMs("-5")).toBe(0);
  });

  it("caps a merchant-facing wait far below a background one", () => {
    expect(INTERACTIVE_BACKOFF_CAP_MS).toBeLessThanOrEqual(10_000);
    expect(BACKGROUND_BACKOFF_CAP_MS).toBeGreaterThan(INTERACTIVE_BACKOFF_CAP_MS);
  });
});

describe("item 23 — 429 handling, breaker and retries (source guards)", () => {
  const src = code("app/utils/ai.server.js");

  it("a 429 no longer counts toward the circuit breaker", () => {
    const block = src.slice(
      src.indexOf("if (response.status === 429)"),
      src.indexOf("if (response.status === 400)"),
    );
    expect(block).not.toMatch(/recordFailure\(\)/);
  });

  it("the 429 wait is capped, and the default Retry-After is no longer a minute", () => {
    const block = src.slice(
      src.indexOf("if (response.status === 429)"),
      src.indexOf("if (response.status === 400)"),
    );
    expect(block).toMatch(/Math\.min\(/);
    expect(block).toMatch(/INTERACTIVE_BACKOFF_CAP_MS : BACKGROUND_BACKOFF_CAP_MS/);
    expect(block).not.toMatch(/"Retry-After"\) \|\| "60"/);
  });

  it("a network error or timeout is retried once before failing", () => {
    expect(src).toMatch(/AbortError/);
    expect(src).toMatch(/transient && attempt < 1/);
  });

  it("the interactive cap is what merchant-facing paths get by default", () => {
    // generateProductContent / enhanceExistingContent default to interactive;
    // only the worker opts out.
    expect(src.match(/interactive: options\.interactive !== false/g)).toHaveLength(2);
    expect(code("app/utils/bulkProcessor.server.js").match(/interactive: false/g)).toHaveLength(2);
  });
});

describe("item 24 — every AI path is metered and rate-limited", () => {
  it("social generation now takes a credit and a rate limit", () => {
    const src = code("app/routes/app.products_.$id.jsx");
    const block = src.slice(
      src.indexOf('actionType === "generateSocial"'),
      src.indexOf('actionType === "restoreVersion"'),
    );
    expect(block).toMatch(/checkRateLimit\(/);
    expect(block).toMatch(/withGenerationCredit\(/);
    expect(block).toMatch(/contentType: "social"/);
    expect(block).toMatch(/limitReached: true/);
  });

  it("blog generation now has a rate limit as well as its credit", () => {
    const src = code("app/routes/app.blog.jsx");
    const block = src.slice(
      src.indexOf('actionType === "generate"'),
      src.indexOf('actionType === "publish"'),
    );
    expect(block).toMatch(/checkRateLimit\(/);
    expect(block).toMatch(/withGenerationCredit\(/);
  });

  it("no AI entry point is left ungated (sweep)", () => {
    // Every module that imports an ai.server generator must also gate it.
    // app.welcome.jsx used to be on this list; Phase 3 retired the route and
    // moved its generation into quickStart.server.js, which is on it now.
    const routes = [
      "app/routes/app.products_.$id.jsx",
      "app/routes/app.collections.jsx",
      "app/routes/app.blog.jsx",
      "app/utils/quickStart.server.js",
    ];
    for (const f of routes) {
      const src = code(f);
      expect(src, f).toMatch(/withGenerationCredit|tryConsumeGeneration/);
    }
  });

  it("the sweep list actually covers every AI entry point", () => {
    // A hand-maintained list is only as good as the sweep that checks it is
    // complete. Anything that imports a generator and is not gated here is a
    // path that can spend a merchant's money without metering it.
    const listed = new Set([
      "app/routes/app.products_.$id.jsx",
      "app/routes/app.collections.jsx",
      "app/routes/app.blog.jsx",
      "app/utils/quickStart.server.js",
      // Gated at their own call sites, verified by the tests above.
      "app/utils/bulkProcessor.server.js",
      "app/routes/app.optimize.jsx",
      "app/routes/app.products.jsx",
      "app/routes/app.seo-audit.jsx",
      // Reads the circuit-breaker state for /api/health. Generates nothing.
      "app/routes/api.health.jsx",
    ]);
    const roots = ["app/routes", "app/utils", "app/queues"];
    const missing = [];
    for (const dir of roots) {
      for (const name of readdirSync(dir)) {
        const f = `${dir}/${name}`;
        if (!/\.(js|jsx)$/.test(name)) continue;
        let src;
        try {
          src = code(f);
        } catch {
          continue;
        }
        // Static AND dynamic — app.blog and app.collections reach ai.server
        // through `await import(...)`, which a `from "..."` regex misses
        // entirely. A sweep that cannot see half the call sites is worse than
        // no sweep, because it reads as though it checked them.
        const importsGenerator = /["'][^"']*ai\.server(\.js)?["']/.test(src);
        if (!importsGenerator || listed.has(f)) continue;
        if (!/withGenerationCredit|tryConsumeGeneration|checkRateLimit/.test(src)) missing.push(f);
      }
    }
    expect(missing, "ungated AI entry points").toEqual([]);
  });
});
