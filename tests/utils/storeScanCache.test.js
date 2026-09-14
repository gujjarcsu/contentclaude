/**
 * P5.2 — the store score was cached for ten minutes and never invalidated.
 *
 * The observation that started this: Home read **48** at 02:25:35Z and **78**
 * at 03:00:33Z on the same store with no deploy between the two reads. Thirty
 * points, from a value with a 600-second TTL.
 *
 * Reading the cache rather than guessing from the numbers found the actual
 * defect, and it is not the one the symptom suggested. There is no second
 * cache. There is ONE cache, and `startscan:<shop>` was the only key in this
 * app that was written and never cleared — every other key has an invalidator.
 *
 * So the ten-minute window was not a bug in itself. The bug is WHEN it falls:
 * a merchant publishes content, returns to Home, and the number that exists to
 * prove the app worked is the number from before they pressed the button.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const { invalidateCache } = vi.hoisted(() => ({ invalidateCache: vi.fn(async () => {}) }));
vi.mock("../../app/utils/cache.server.js", () => ({
  invalidateCache,
  getCache: vi.fn(async (k, s) => s()),
  getRedis: async () => null,
}));

const { storeScanKey, invalidateStoreScan } = await import("../../app/utils/storeScanCache.server.js");

describe("the key has exactly one definition", () => {
  it("is the same string startState.server.js reads with", () => {
    expect(storeScanKey("s.myshopify.com")).toBe("startscan:s.myshopify.com");
  });

  it("nothing types the key by hand", async () => {
    // Writing the key at a call site is the defect P5.0 was spent fixing one
    // file over: a second copy that silently stops matching.
    //
    // COMMENTS STRIPPED FIRST, and this assertion is the fourth thing today to
    // need that. It fired on `cache.server.js` because the docstring for the
    // newly-exported `cacheKey()` QUOTES the key shape while explaining why
    // nothing should type it. A guard that reads source and does not strip
    // comments eventually fires on its own documentation, and the tempting fix
    // is to delete the explanation rather than the defect.
    const code = (t) =>
      t
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !/^\s*\/\//.test(l))
        .join("\n");
    const walk = (d) =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
      );
    const offenders = walk("app")
      .filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith("storeScanCache.server.js"))
      .filter((f) => /["'`]startscan:/.test(code(readFileSync(f, "utf8"))));
    expect(offenders, `hardcode the cache key: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the REAL Redis key is namespaced, and nothing outside cache.server.js builds it", async () => {
    // The bug this exists to stop, and it was mine: `score-cache-diag.mjs`
    // queried `startscan:<shop>` directly and reported a LIVE cache as absent,
    // twice, because getCache namespaces every key with "cc:". The diagnostic
    // built to verify P5.2 contained the P5.0 defect.
    //
    // It refused to conclude anything from the miss, which is the only reason
    // it was caught rather than believed.
    // importActual, not import: this file mocks cache.server.js, and asserting
    // the namespacing against a mock would prove the mock. That is the same
    // shape of nothing as asserting a constant equals itself.
    const { cacheKey } = await vi.importActual("../../app/utils/cache.server.js");
    expect(cacheKey("startscan:x.myshopify.com")).toBe("cc:startscan:x.myshopify.com");
    const diag = readFileSync("scripts/score-cache-diag.mjs", "utf8");
    expect(diag).toMatch(/cacheKey\(storeScanKey\(shop\)\)/);
    expect(diag).not.toMatch(/redis\.(exists|ttl)\(storeScanKey/);
  });
});

describe("invalidateStoreScan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears the key for the shop", async () => {
    await expect(invalidateStoreScan("s.myshopify.com")).resolves.toBe(true);
    expect(invalidateCache).toHaveBeenCalledWith("startscan:s.myshopify.com");
    // Part B — the catalogue join shares the invalidator, so a publish moves
    // the joined counts with the score instead of leaving them ten minutes stale.
    expect(invalidateCache).toHaveBeenCalledWith("catcontent:s.myshopify.com");
  });

  it("never throws — a failed cache delete must not fail a publish", async () => {
    // A stale score is a bad experience. A publish that fails because a Redis
    // DEL failed is a worse one, and the merchant has already written to their
    // store by the time this runs.
    invalidateCache.mockRejectedValueOnce(new Error("redis down"));
    await expect(invalidateStoreScan("s.myshopify.com")).resolves.toBe(false);
  });

  it("does nothing without a shop rather than clearing 'startscan:undefined'", async () => {
    await expect(invalidateStoreScan(undefined)).resolves.toBe(false);
    expect(invalidateCache).not.toHaveBeenCalled();
  });
});

describe("every path that publishes product content clears the cache", () => {
  // The guard against a FOURTH publish site forgetting. It is a source check on
  // purpose: the defect is an ABSENT call, and a mock of a call that is never
  // made cannot catch a call that is never made.
  const PUBLISH_SITES = [
    ["app/utils/bulkProcessor.server.js", "bulk generation"],
    ["app/routes/app.review.jsx", "Review & Publish"],
    ["app/routes/app.products_.$id.jsx", "one product's detail page"],
  ];

  it.each(PUBLISH_SITES)("%s (%s) invalidates", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/invalidateStoreScan\(/);
    expect(src).toMatch(/from ["'][^"']*storeScanCache\.server\.js["']/);
  });

  it("no OTHER file promotes product content to published without clearing", () => {
    // Finds the fourth site before it ships. Collections and blog posts are
    // excluded deliberately: the store score is computed from PRODUCTS, so
    // publishing a blog post does not move it and clearing the scan there would
    // cost a catalogue re-scan for nothing.
    const walk = (d) =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
      );
    const EXEMPT = new Set([
      "app/routes/app.collections.jsx",
      "app/routes/app.blog.jsx",
      "app/utils/results.server.js", // reads published rows, never writes them
    ]);
    const offenders = walk("app")
      .filter((f) => /\.(js|jsx)$/.test(f) && !EXEMPT.has(f))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        const writesPublished = /data:\s*\{[^}]*status:\s*["']published["']/s.test(src);
        return writesPublished && !src.includes("invalidateStoreScan(");
      });
    expect(
      offenders,
      `publish product content without clearing the store scan: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("the TTL itself", () => {
  it("is still ten minutes, and that is now a ceiling rather than a floor", async () => {
    // With invalidation wired, 600s is how long a score can lag a change we did
    // NOT make — a merchant editing a description in the Shopify admin directly.
    // Before invalidation it was how long a score lagged changes WE made, which
    // is a different and much worse promise.
    const { STORE_SCORE_TTL_S } = await import("../../app/utils/storeScore.server.js");
    expect(STORE_SCORE_TTL_S).toBe(600);
  });
});
