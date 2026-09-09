/**
 * Phase 1 item 9 — the repository was shipping its own rubbish.
 *
 * Thirteen directories of Playwright output, 186 MB of screenshots and video
 * frames, sat in the repository root. Fly's own build-context warning named
 * them: gauntlet-211 70 MB, title-proof2 33 MB, gauntlet-record 22 MB. Every
 * deploy uploaded all of it. Six one-off resolution reports sat beside the
 * README, and three abandoned agent worktrees held uncommitted work at a commit
 * from before Phase 0.
 *
 * Cleaning it once is worth little; it comes back within a month. These
 * assertions are what makes it stay clean.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (f) => readFileSync(f, "utf8");

/** What git actually tracks — the only definition of "in the repository". */
function tracked(pathspec) {
  return execFileSync("git", ["ls-files", "--", pathspec], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

describe("the repository root holds only what belongs there", () => {
  it("has just the four documents a reader needs first", () => {
    const rootDocs = readdirSync(".").filter((f) => f.endsWith(".md") && statSync(f).isFile());
    expect(rootDocs.sort()).toEqual(["DEPLOYMENT.md", "HUMAN-NEEDED.md", "PROGRESS.md", "README.md"]);
  });

  it("the one-off resolution reports moved to docs/history rather than being deleted", () => {
    // They are the record of four App Store rejections. Worth keeping, not
    // worth being the first thing anyone sees.
    for (const f of [
      "docs/history/BILLING_1.2.2_RESOLUTION.md",
      "docs/history/BILLING_1.2.3_RESOLUTION.md",
      "docs/history/REJECTION_2.1.1_RESOLUTION.md",
      "docs/history/REJECTION_2.1.1_ROUND4_RESOLUTION.md",
      "docs/history/E2E_HARDENING_REPORT.md",
      "docs/history/REVIEW_HARDENING_REPORT.md",
    ]) {
      expect(existsSync(f), `${f} should exist`).toBe(true);
    }
  });

  it("tracks no proof-harness output", () => {
    for (const p of ["gauntlet-*", "billing-*", "proof-*", "title-proof*", "repro-*", "reviewer-*", "verify-*"]) {
      expect(tracked(p)).toEqual([]);
    }
  });

  it("tracks no build output or source snapshot", () => {
    expect(tracked("build")).toEqual([]);
    expect(tracked("*.tgz")).toEqual([]);
    expect(existsSync("build/_to_delete")).toBe(false);
  });
});

describe("proof output cannot come back", () => {
  const gitignore = read(".gitignore");
  const dockerignore = read(".dockerignore");

  it("gitignore matches the patterns, not the thirteen names they had", () => {
    for (const p of ["gauntlet-*/", "billing-*/", "proof-*/", "repro-*/", "reviewer-*/", "verify-*/"]) {
      // Anchored to the repository root with a leading slash. Unanchored, git
      // matches at every depth, and `proof-*/` silently swallowed
      // docs/history/proof-results/ — the very files kept from the deletion.
      expect(gitignore).toContain(`/${p}`);
    }
  });

  it("dockerignore keeps the harnesses out of the build context", () => {
    // This is the line that stops 186 MB being uploaded to Fly on every deploy.
    expect(dockerignore).toMatch(/^tools$/m);
    for (const p of ["gauntlet-*", "billing-*", "proof-*"]) {
      expect(dockerignore).toContain(p);
    }
  });

  it("the agent worktrees are gone and cannot be re-added", () => {
    expect(existsSync(".claude/worktrees")).toBe(false);
    expect(gitignore).toContain(".claude/worktrees/");
  });

  it("what was in those worktrees was recovered, not discarded", () => {
    expect(existsSync("docs/history/worktree-recovery/README.md")).toBe(true);
    // The quick-start route Phase 3 needs, saved as .txt so nothing compiles it.
    expect(existsSync("docs/history/worktree-recovery/app.quick-start.jsx.txt")).toBe(true);
    expect(existsSync("docs/history/worktree-recovery/quickStart.server.js.txt")).toBe(true);
  });
});

describe("scripts and proof harnesses are separated, and say what they touch", () => {
  it("nothing in scripts/ drives a browser", () => {
    for (const f of readdirSync("scripts").filter((f) => /\.(mjs|cjs)$/.test(f))) {
      expect(read(`scripts/${f}`), `${f} should not import playwright`).not.toMatch(/from "playwright|require\("playwright/);
    }
  });

  it("the browser harnesses live in tools/proof with a README that names the risky ones", () => {
    expect(existsSync("tools/proof/README.md")).toBe(true);
    const readme = read("tools/proof/README.md");
    expect(readme).toMatch(/Writes to a live shop/);
    expect(readme).toMatch(/navaal-qa-fresh/);
    expect(readdirSync("tools/proof").filter((f) => f.endsWith(".mjs")).length).toBeGreaterThan(20);
  });

  it("scripts/ has a README, and every script in it is listed", () => {
    const readme = read("scripts/README.md");
    for (const f of readdirSync("scripts").filter((f) => /\.(mjs|cjs)$/.test(f))) {
      expect(readme, `scripts/README.md should list ${f}`).toContain(f);
    }
  });

  it("a script name says whether it writes", () => {
    // A name that does not say whether it writes is a trap at 2am.
    const names = readdirSync("scripts").filter((f) => /\.(mjs|cjs)$/.test(f));
    expect(names).toContain("backfill-faq-metafields--dry-run-default.mjs");
    expect(names).toContain("fix-legacy-alttext-rows--dry-run-default.mjs");
    expect(names).toContain("test-seed-usage--writes-test-store-only.mjs");
    // and the renamed scripts still tell you the right command to run
    expect(read("scripts/fix-legacy-alttext-rows--dry-run-default.mjs")).toContain(
      "fix-legacy-alttext-rows--dry-run-default.mjs --apply",
    );
  });

  it("the seeding script still refuses a store it does not recognise", () => {
    // The rename must not have been a rename over a weakened guard.
    const src = read("scripts/test-seed-usage--writes-test-store-only.mjs");
    expect(src).toMatch(/navaal-qa-fresh|TEST_SHOPS|allow/i);
  });
});
