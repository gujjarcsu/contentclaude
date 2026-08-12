/**
 * E2E defect B regression — every product-scoped draft/published count must
 * exclude collection rows (GeneratedContent.productId can hold Collection
 * GIDs). The dashboard said "1 draft awaiting review" while the review queue
 * correctly showed nothing: getContentMetrics had no GID filter.
 *
 * Source-level guards: the queries are raw SQL / inline where-clauses, so we
 * assert the filter is present at each counting site.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repoRoot, p), "utf8");

describe("defect B: product counts exclude collection rows", () => {
  it("getContentMetrics filters to Product GIDs", () => {
    const src = read("app/utils/metrics.server.js");
    expect(src).toMatch(/LIKE 'gid:\/\/shopify\/Product\/%'/);
  });

  it("optimize loader counts filter to Product GIDs", () => {
    const src = read("app/routes/app.optimize.jsx");
    const countLines = src.split("\n").filter((l) => l.includes("generatedContent.count"));
    expect(countLines.length).toBeGreaterThan(0);
    for (const line of countLines) {
      expect(line, `unfiltered count: ${line.trim()}`).toContain('startsWith: "gid://shopify/Product/"');
    }
  });

  it("welcome loader counts filter to Product GIDs", () => {
    const src = read("app/routes/app.welcome.jsx");
    const countLines = src.split("\n").filter((l) => l.includes("generatedContent.count"));
    for (const line of countLines) {
      expect(line, `unfiltered count: ${line.trim()}`).toContain('startsWith: "gid://shopify/Product/"');
    }
  });
});
