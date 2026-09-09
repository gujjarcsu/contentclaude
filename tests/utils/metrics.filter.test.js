/**
 * E2E defect B regression — every product-scoped draft/published count must
 * exclude collection rows (GeneratedContent.productId can hold Collection
 * GIDs). The dashboard said "1 draft awaiting review" while the review queue
 * correctly showed nothing: getContentMetrics had no GID filter.
 *
 * Source-level guards: the queries are raw SQL / inline where-clauses, so we
 * assert the filter is present at each counting site.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repoRoot, p), "utf8");
/**
 * Source with comments removed. Necessary here because these guards search for
 * an expression that the code deliberately DESCRIBES in a comment explaining
 * why it was removed — without this, the explanation trips the guard.
 */
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe("defect B: product counts exclude collection rows", () => {
  it("getContentMetrics filters to Product GIDs", async () => {
    // Phase 2 item 2.1 moved the pattern into a bound parameter, so reading the
    // source for a literal no longer proves anything. Drive the function and
    // inspect what it actually sends: Prisma's tagged template passes the
    // interpolated values as the arguments after the string parts.
    const { default: prisma } = await import("../../app/db.server.js");
    const { getContentMetrics } = await import("../../app/utils/metrics.server.js");

    prisma.$queryRaw = vi.fn().mockResolvedValue([]);
    await getContentMetrics("filter-check.myshopify.com", { totalProducts: 1 });

    const values = prisma.$queryRaw.mock.calls[0].slice(1);
    expect(values).toContain("gid://shopify/Product/%");
    // and the shop, so one shop's counts can never include another's
    expect(values).toContain("filter-check.myshopify.com");
  });

  it("no screen counts content for itself — they all read getContentMetrics", () => {
    // Phase 2 item 2.1 replaced the old guard with a stronger one. Optimize used
    // to run its own generatedContent.count filtered to contentType
    // "description", which is why it said 14 where Products said 12. The fix is
    // not "filter that count correctly" — it is that a screen must not have a
    // content count of its own at all.
    for (const f of [
      "app/routes/app.optimize.jsx",
      "app/routes/app.products.jsx",
      "app/routes/app._index.jsx",
    ]) {
      const src = code(f);
      expect(src, `${f} still counts content itself`).not.toMatch(/generatedContent\.count\(/);
      expect(src, `${f} does not read the shared metrics`).toMatch(/getContentMetrics/);
    }
  });

  it("no screen re-derives needs-content with its own arithmetic", () => {
    // `total - published - draft` is the expression that was wrong: those two
    // counts were not mutually exclusive, so it undercounted by the number of
    // half-finished products. needsContentFrom is where that arithmetic lives.
    for (const f of [
      "app/routes/app.optimize.jsx",
      "app/routes/app.products.jsx",
      "app/routes/app._index.jsx",
      "app/routes/app.analytics.jsx",
    ]) {
      const src = code(f);
      expect(src, `${f} re-derives needs-content`).not.toMatch(
        /total\w*\s*-\s*\w*[Pp]ublished\w*\s*-\s*\w*[Dd]raft/,
      );
      expect(src, `${f} does not use needsContentFrom`).toMatch(/needsContentFrom/);
    }
  });

  it("welcome loader counts filter to Product GIDs", () => {
    // Counts the whole file rather than each line. The original checked that
    // every LINE containing `generatedContent.count` also contained the GID
    // filter, which broke the moment a formatter split the call across lines —
    // the guard failed while the code was still correct. Every count must have
    // a filter; where they sit relative to each other is formatting.
    const src = code("app/routes/app.welcome.jsx");
    const counts = (src.match(/generatedContent\.count\(/g) || []).length;
    const filters = (src.match(/startsWith: "gid:\/\/shopify\/Product\/"/g) || []).length;
    expect(counts, "welcome.jsx no longer counts content").toBeGreaterThan(0);
    expect(filters, "a content count is missing its Product GID filter").toBeGreaterThanOrEqual(counts);
  });
});
