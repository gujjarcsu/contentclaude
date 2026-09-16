/**
 * Phase 14 item 3 — the supported route to a Free store at its cap.
 *
 * H5 (the 80–100% warning) and H6 (the 100% card, then the upgrade flow) are two
 * owner commands away, and were blocked because this script seeded the wrong
 * number. It is a manual, test-store-only script that never runs in CI, so what
 * is asserted here is its contract: the field it reads, the way it measures
 * spend, the target it accepts, and — above all — the refusal that keeps it off
 * every store that is not ours.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("scripts/test-seed-usage--writes-test-store-only.mjs", "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

describe("the refusal — unchanged, and the most important line in the file", () => {
  it("only a recognised test store can be touched, and askebs can never match", () => {
    const m = code.match(/if \(!\/\(([^)]*)\)\/\.test\(shop\)\)/);
    expect(m, "the shop guard must still be a literal regex on SEED_SHOP").not.toBeNull();
    const re = new RegExp(`(${m[1]})`);
    for (const ok of ["navaal-qa-fresh.myshopify.com", "contentpilot-dev2.myshopify.com", "navaal-test-1.myshopify.com"]) {
      expect(re.test(ok), ok).toBe(true);
    }
    for (const no of [
      "askebs.myshopify.com",
      "r20bcm-2d.myshopify.com",
      "ebs-bathroom-and-plumbing-supplies-3.myshopify.com",
      "peter-shops-2.myshopify.com",
      "zephyrin-wynter-a01g3uy4.myshopify.com",
      "navaal-ttv-03.myshopify.com",
      "navaal-shape-cap.myshopify.com",
    ]) {
      expect(re.test(no), `${no} must be refused`).toBe(false);
    }
    expect(code).toMatch(/process\.exit\(2\)/);
  });
});

describe("defect 1 — it read a field that no longer exists, and defaulted to 25", () => {
  it("reads monthlyCredits, the name B2 gave the credit budget", () => {
    expect(code).toMatch(/plan\?\.monthlyCredits/);
    expect(code).not.toMatch(/monthlyLimit/);
  });

  it("has no silent fallback cap: a missing plan row stops the run", () => {
    // `?? 25` is what turned "seed this store to its cap" into "seed it to 25".
    expect(code).not.toMatch(/\?\?\s*25/);
    expect(code).toMatch(/Refusing: no plan row/);
    expect(code).toMatch(/process\.exit\(3\)/);
  });
});

describe("defect 2 — it counted rows where the app sums credits", () => {
  it("measures spend the way plans.server.js does", () => {
    expect(code).toMatch(/_sum: \{ credits: true \}/);
    expect(code).not.toMatch(/usageRecord\.count\(/);
  });

  it("writes an explicit credits value per row rather than leaning on the default", async () => {
    expect(code).toMatch(/credits: 1/);
    // and the schema default it matches, so the two cannot drift apart unnoticed
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const usage = schema.match(/model UsageRecord \{[\s\S]*?\n\}/)[0];
    expect(usage).toMatch(/credits\s+Int\s+@default\(1\)/);
  });
});

describe("defect 3 — there was no way to reach the 80% warning", () => {
  it("accepts SEED_TARGET in credits and defaults to the cap", () => {
    expect(code).toMatch(/process\.env\.SEED_TARGET/);
    expect(code).toMatch(/const target = raw === undefined \|\| raw === "" \? cap : Number\(raw\)/);
  });

  it("refuses a target that is not a number, or is above the cap", () => {
    expect(code).toMatch(/SEED_TARGET must be a number of credits/);
    expect(code).toMatch(/is above this shop's cap/);
    expect(code).toMatch(/process\.exit\(4\)/);
    expect(code).toMatch(/process\.exit\(5\)/);
  });

  it("seeds the DIFFERENCE to the target, never a fixed number", () => {
    expect(code).toMatch(/const need = Math\.max\(0, Math\.round\(target\) - before\)/);
  });

  it("restore still removes only the synthetic rows, by marker", () => {
    expect(code).toMatch(/deleteMany\(\{ where: \{ shop, month, contentType: MARKER \} \}\)/);
  });

  it("says which surface the owner should now see, so the recording is checked against a claim", () => {
    expect(code).toMatch(/100% card/);
    expect(code).toMatch(/80–100% warning banner/);
  });
});

describe("the arithmetic the script performs, run here rather than described", () => {
  // The script needs a database, so the pure decision is reproduced and pinned.
  const plan = (cap, before, raw) => {
    const target = raw === undefined || raw === "" ? cap : Number(raw);
    const need = Math.max(0, Math.round(target) - before);
    const after = before + need;
    const pct = Math.round((after / cap) * 100);
    return { need, after, pct, expect: after >= cap ? "100% card" : pct >= 80 ? "80–100% warning banner" : "no quota surface" };
  };

  it("H5: SEED_TARGET=85 on a 100-credit Free store reaches the warning band", () => {
    expect(plan(100, 0, "85")).toMatchObject({ need: 85, after: 85, pct: 85, expect: "80–100% warning banner" });
  });

  it("H6: SEED_TARGET=100 then reaches the exhausted card, seeding only the remainder", () => {
    expect(plan(100, 85, "100")).toMatchObject({ need: 15, after: 100, pct: 100, expect: "100% card" });
  });

  it("no SEED_TARGET means the cap — the old behaviour, now on the right number", () => {
    expect(plan(100, 0, undefined)).toMatchObject({ need: 100, after: 100, expect: "100% card" });
    // and the old defect, kept named: 25 was never the cap of a Free store
    expect(plan(100, 0, undefined).need).not.toBe(25);
  });

  it("existing real spend is respected, including a 3-credit blog post", () => {
    // A store with one blog post (3 credits in ONE row) and nothing else: the
    // old row-count said 1, so it over-seeded by 2.
    expect(plan(100, 3, "85")).toMatchObject({ need: 82, after: 85 });
  });
});
