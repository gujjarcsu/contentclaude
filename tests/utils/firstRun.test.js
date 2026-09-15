/**
 * P2.7 — the first run names the three specific things holding THIS store
 * back, and says "we'll watch it from here".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { BLOCKER_GROUPS, PASSWORD_BLOCKER, WATCH_FROM_HERE, tallyFindings, blockerLines } from "../../app/utils/firstRun.js";
import { parseFindings } from "../../app/utils/catalogueWatch.js";

describe("the groups", () => {
  it("every group names its grade, a line for one and for many, and a fix or an honest none", () => {
    for (const g of BLOCKER_GROUPS) {
      expect(["blocking", "degrading"]).toContain(g.grade);
      expect(g.line(1)).not.toEqual(g.line(2));
      expect(g.line(3).length).toBeGreaterThan(20);
      expect(g.fix === null || (typeof g.fix.label === "string" && typeof g.fix.to === "string")).toBe(true);
    }
  });

  it("fixes the app cannot make point at Shopify admin, never at a page that would pretend", () => {
    for (const k of ["openai·image_link·blocking", "openai·link·blocking", "openai·title·blocking"]) {
      const g = BLOCKER_GROUPS.find((x) => x.key === k);
      expect(g.fix.external).toBe(true);
      expect(g.fix.to).toMatch(/^shopify:\/\/admin/);
    }
    for (const k of ["openai·brand·blocking", "openai·image alt·degrading", "openai·gtin·degrading", "openai·variant options·degrading"]) {
      expect(BLOCKER_GROUPS.find((x) => x.key === k).fix.to).toBe("/app/fix");
    }
  });
});

describe("tally and lines", () => {
  const row = (fields, statusShop = "ACTIVE") => ({
    statusShop,
    grade: JSON.stringify(fields.map(([field, grade]) => ({ surface: "openai", field, grade, note: "" }))),
  });
  const rows = [
    row([["description", "blocking"], ["gtin", "degrading"]]),
    row([["description", "blocking"], ["gtin", "degrading"], ["image alt", "degrading"]]),
    row([["brand", "blocking"], ["gtin", "degrading"]]),
    row([["gtin", "degrading"]]),
    row([["description", "blocking"]], "DRAFT"),
  ];

  it("tallies by surface·field·grade and skips drafts", () => {
    const t = tallyFindings(rows, parseFindings);
    expect(t).toEqual({
      "openai·description·blocking": 2,
      "openai·gtin·degrading": 4,
      "openai·image alt·degrading": 1,
      "openai·brand·blocking": 1,
    });
  });

  it("blocking before degrading, larger first, at most three", () => {
    const lines = blockerLines(tallyFindings(rows, parseFindings));
    expect(lines.map((l) => l.key)).toEqual(["openai·description·blocking", "openai·brand·blocking", "openai·gtin·degrading"]);
    expect(lines[0].line).toMatch(/^2 products have no description/);
    expect(lines[1].line).toMatch(/^1 product has no brand/);
    expect(lines[0].fix.to).toBe("/app/fix");
  });

  it("nothing found → no lines; password-locked → one honest line with no fix, only if there is room", () => {
    expect(blockerLines({})).toEqual([]);
    const locked = blockerLines({}, { passwordProtected: true });
    expect(locked).toEqual([PASSWORD_BLOCKER]);
    expect(locked[0].fix).toBeNull();
    const full = blockerLines({ "openai·description·blocking": 5, "openai·brand·blocking": 4, "openai·image_link·blocking": 3, "openai·gtin·degrading": 9 }, { passwordProtected: true });
    expect(full).toHaveLength(3);
    expect(full.map((l) => l.key)).not.toContain("storefront·password");
  });

  it("the max is respected and singulars read right", () => {
    expect(blockerLines({ "openai·gtin·degrading": 1 }, { max: 1 })[0].line).toMatch(/^1 product has no barcode/);
  });
});

describe("the sentence that names the subscription", () => {
  it("says every day, what is read, and that Home tells the merchant the same day", () => {
    expect(WATCH_FROM_HERE.title).toBe("We'll watch it from here.");
    expect(WATCH_FROM_HERE.body).toMatch(/Every day/);
    expect(WATCH_FROM_HERE.body).toMatch(/six search and AI crawlers/);
    expect(WATCH_FROM_HERE.body).toMatch(/the same day/);
    expect(WATCH_FROM_HERE.body).not.toMatch(/rank|guarantee|cited/i);
  });
});

describe("wiring", () => {
  it("the first run renders the blockers and the watch sentence; Home computes blockers on a first run and until the first publish", () => {
    const start = code(readFileSync("app/components/StartState.jsx", "utf8"));
    expect(start).toMatch(/WATCH_FROM_HERE/);
    expect(start).toMatch(/start\.blockers/);
    expect(start).toMatch(/holding this store back/);
    const home = code(readFileSync("app/routes/app._index.jsx", "utf8"));
    expect(home).toMatch(/isFirstRun \|\| beforeFirstPublish \? await blockersFor\(shop\) : \[\]/);
    expect(start).toMatch(/\{blockerLine\(b, t\)\}/); // D1: the line is made where it is shown, in the merchant\'s language // Phase 12 A4: also until the first publish, for the findings card
  });

  it("blockersFor never throws — the first run must render whether or not the walk finished", () => {
    const srv = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
    const m = srv.match(/export async function blockersFor[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/try \{/);
    expect(m[0]).toMatch(/return \[\];/);
  });
});
