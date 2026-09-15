/**
 * Phase 12 Part E, line A6 — the clocks are in the code.
 *
 * One table (app/utils/clocks.js), one test per row. A sunset row goes red
 * 90 days before its date; a re-verification row goes red when its last
 * check is 90 days old. Either way the failure names the action. The rows
 * are also held against the code they describe: the pinned API version, the
 * models in modelPricing.js, the ScriptTag guard, the featuredImage readers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLOCKS, WARN_DAYS, clockState, redClocks } from "../../app/utils/clocks.js";
import { MODELS } from "../../app/utils/modelPricing.js";

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|liquid|toml)$/.test(name)) out.push(p);
  }
  return out;
};

describe("every clock, at today's date", () => {
  for (const row of CLOCKS) {
    it(`${row.key} — ${row.kind === "sunset" ? `${row.date}, red from ${WARN_DAYS} days before` : `re-verify within ${WARN_DAYS} days of ${row.verifiedAt}`}`, () => {
      expect(row.what).toBeTruthy();
      expect(row.action).toBeTruthy();
      expect(row.source).toMatch(/^https:\/\//);
      const s = clockState(row, new Date());
      expect(s.red, s.reason).toBe(false);
    });
  }
});

describe("the arithmetic goes red when it should", () => {
  it("a sunset is red exactly 90 days before and not 91", () => {
    const row = { key: "x", kind: "sunset", date: "2027-04-01", action: "bump" };
    expect(clockState(row, new Date("2026-12-31T00:00:00Z")).red).toBe(false); // 91 days
    expect(clockState(row, new Date("2027-01-01T00:00:00Z")).red).toBe(true); // 90 days
    expect(clockState(row, new Date("2027-01-01T00:00:00Z")).reason).toMatch(/90 days to 2027-04-01 — bump/);
  });

  it("a re-verification row is red the day after its 90 days", () => {
    const row = { key: "y", kind: "reverify", verifiedAt: "2026-09-15", action: "re-read" };
    expect(clockState(row, new Date("2026-12-13T00:00:00Z")).red).toBe(false);
    expect(clockState(row, new Date("2026-12-14T00:00:00Z")).red).toBe(false); // day 90 exactly
    expect(clockState(row, new Date("2026-12-15T00:00:00Z")).red).toBe(true); // overdue by a day
    expect(redClocks(new Date("2027-06-01T00:00:00Z")).map((s) => s.key)).toContain("admin-api-2026-04");
  });
});

describe("the rows describe the code as it is", () => {
  it("the pinned Admin API version is the one the sunset row names", () => {
    expect(readFileSync("app/shopify.server.js", "utf8")).toMatch(/ApiVersion\.April26/);
    expect(readFileSync("app/utils/catalogueWatch.server.js", "utf8")).toMatch(/const API_VERSION = "2026-04"/);
    expect(readFileSync("app/utils/installState.server.js", "utf8")).toMatch(/INSTALL_PROBE_API_VERSION = "2026-04"/);
    expect(CLOCKS.find((r) => r.key === "admin-api-2026-04").date).toBe("2027-04-01");
  });

  it("every model in modelPricing.js has a clock, and every model clock names a model in use", () => {
    const inUse = Object.values(MODELS);
    for (const id of inUse) expect(CLOCKS.some((r) => r.what.includes(id)), `no clock for ${id}`).toBe(true);
    for (const r of CLOCKS.filter((r) => r.key.startsWith("model-"))) expect(inUse.some((id) => r.what.includes(id)), `${r.key} names no model in use`).toBe(true);
  });

  it("the app injects nothing through ScriptTag — the 2027-03-01 clock is a guard, not a migration", () => {
    const files = [...walk("app"), ...(statSync("extensions", { throwIfNoEntry: false }) ? walk("extensions") : [])];
    const offenders = files.filter((p) => !/clocks\.js$/.test(p) && /scriptTagCreate|scriptTagUpdate|scriptTags\(|script_tags\.json/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the featuredImage readers are counted, so the re-verification has something to move", () => {
    const readers = walk("app").filter((p) => /featuredImage/.test(readFileSync(p, "utf8")));
    expect(readers.length).toBeGreaterThan(0); // the day this is 0, delete the row
    expect(CLOCKS.find((r) => r.key === "product-featuredimage").what).toMatch(/six files/);
  });
});
