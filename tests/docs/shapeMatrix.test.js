/**
 * Phase 10 Part C — the shape matrix doc is the data, verbatim.
 *
 * docs/navaal/SHAPE-MATRIX.md is what the owner reads; tests/fixtures/
 * shapeMatrix.js is what the test runs. If they ever differ, the doc is
 * claiming something the test does not prove.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderMatrix, tally } from "../fixtures/shapeMatrix.js";

const DOC = "docs/navaal/SHAPE-MATRIX.md";

describe("SHAPE-MATRIX.md", () => {
  it("carries renderMatrix() verbatim", () => {
    const doc = readFileSync(DOC, "utf8").replace(/\r\n/g, "\n");
    expect(doc).toContain(renderMatrix());
  });

  it("states the tally in its first lines, matching the data", () => {
    const doc = readFileSync(DOC, "utf8").replace(/\r\n/g, "\n");
    const t = tally();
    expect(doc.slice(0, 1500)).toMatch(new RegExp(`PASS ${t.PASS} · HELD ${t.HELD} · NOT RUN ${t["NOT RUN"]}`));
  });

  it("says what NOT RUN means, in the brief's words", () => {
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toMatch(/A cell you did not test is a defect you have not found yet/);
  });
});
