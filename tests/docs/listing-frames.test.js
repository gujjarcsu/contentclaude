/**
 * H7 — the listing images must show OUR APP, not Shopify's admin around it.
 *
 * The capture harness screenshotted `page` unless a frame set `frameOnly: true`,
 * and only the three MOBILE frames set it. So every DESKTOP listing image
 * contained the whole Shopify admin: the left nav, the top bar, and the Sidekick
 * icon and "Agentic" entry in them.
 *
 * Shopify names Sidekick-icon and Shopify-purple AI branding as a Built for
 * Shopify rejection reason, and it applies hardest to an app called "AI SEO".
 * We were shipping it inside the listing images themselves.
 *
 * The flag was the wrong shape — it made the safe behaviour opt-in and five of
 * eight frames did not opt in — so it is gone rather than set eight times. These
 * assertions are what stop it coming back as a flag.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("tools/proof/listing-assets.mjs", "utf8");

/** Source with comments stripped: a comment explaining the fix is not the bug. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^[ \t]*\/\/.*$/gm, " ")
  .replace(/([^:])\/\/[^"'`\n]*$/gm, "$1");

describe("every listing frame captures the app, not the Shopify admin", () => {
  it("no frame carries a frameOnly flag any more", () => {
    // If this comes back, it comes back as opt-in, and something will not opt in.
    expect(CODE).not.toMatch(/frameOnly\s*:/);
  });

  it("the screenshot target is the frame element, unconditionally", () => {
    expect(CODE).toMatch(/const target = await frame\.frameElement\(\)/);
  });

  it("the harness never captures anything but the app frame", () => {
    // WHAT THIS ASSERTS, AND WHY THE WORDING CHANGED (Phase 14 item 5).
    //
    // It used to forbid the string `page.screenshot(` outright. CW's shape fix
    // at `81fa07a` then did the right thing in the forbidden spelling: take the
    // app frame's bounding box and pass it to `page.screenshot({ clip })`,
    // which yields exactly the frame and no admin chrome — and left this guard
    // failing on correct code, red in every suite run since.
    //
    // A guard written on a spelling outlives its reason. The rule is "nothing
    // outside the app frame reaches the image", so that is what is checked now:
    // every screenshot is clipped, and the clip comes from the frame's own box.
    const shots = [...CODE.matchAll(/\bpage\.screenshot\s*\(\s*\{([\s\S]*?)\}\s*\)/g)].map((m) => m[1]);
    expect(shots.length, "the harness must still take screenshots").toBeGreaterThan(0);
    for (const opts of shots) {
      expect(opts, "every screenshot must be clipped to the frame").toMatch(/clip:\s*\{\s*x:\s*box\.x,\s*y:\s*box\.y/);
      expect(opts, "an unclipped fullPage shot would carry Shopify's chrome").not.toMatch(/fullPage/);
    }
    expect(CODE).toMatch(/const box = await target\.boundingBox\(\)/);
    // and the old ternary must not return.
    expect(CODE).not.toMatch(/frameElement\(\)\s*:\s*page/);
  });

  it("desktop frames are exactly 1600×900 pixels — the editor's own rule", () => {
    // "Desktop screenshots must be 1600px by 900px" — the App Store editor, to
    // the owner, 2026-09-15, rejecting the 3200×1800 this harness emitted
    // because listing-assets/README.md said that was what Shopify wanted.
    expect(CODE).toMatch(/deviceScaleFactor: scaleOf\(f\)/);
    expect(CODE).not.toMatch(/deviceScaleFactor:\s*2\b/);
    expect(CODE).toMatch(/scaleOf = \(f\) => \(f\.width >= DESKTOP_MIN_WIDTH \? 1 : 2\)/);
    // the fifth hurdle reads the real pixels, and follows the same scale, so
    // the two can never disagree the way the harness and the README did
    expect(CODE).toMatch(/const scale = scaleOf\(f\)/);
    expect(CODE).toMatch(/pw !== f\.width \* scale \|\| ph !== f\.height \* scale/);
  });

  it("the README states the verified desktop size and admits the mobile one is not", () => {
    const readme = readFileSync("listing-assets/README.md", "utf8");
    expect(readme).toMatch(/exactly 1600×900 pixels/);
    expect(readme).toMatch(/Desktop screenshots must be 1600px by 900px/);
    expect(readme).toMatch(/UNVERIFIED/);
    // the claim this file carried for months, gone
    expect(readme).not.toMatch(/3200×1800 PNG — which is what Shopify wants/);
  });

  it("still captures all eight frames", () => {
    const files = [...CODE.matchAll(/file:\s*"(0\d-[a-z-]+\.png)"/g)].map((m) => m[1]);
    expect(files).toHaveLength(8);
    expect(files).toContain("04-start-desktop.png");
  });
});

describe("the first-run guard matches what the screen actually renders", () => {
  /**
   * Real innerText, taken from the harness's OWN recorded failure in
   * listing-assets/manifest.json on 2026-09-14 — not from reading the JSX and
   * guessing how it flattens.
   */
  const REAL_FIRST_RUN =
    "Review 3 drafts\nStore SEO score\n34\n/ 100\n\nYour starting score, across the 15 products we sampled.\n\nThis is a sample. The";

  const EMPTY_STATE = "Add a product to get started\nYour catalogue is empty";

  /**
   * The label present but no score yet. This is the case that catches a guard
   * LOOSENED rather than fixed: /Store SEO score/i alone matches this happily,
   * and would capture a listing image of a spinner. Added after breaking the
   * guard four ways and finding that exactly this loosening still passed.
   */
  const SCORE_NOT_READY = "Review 3 drafts\nStore SEO score\nCalculating…\nYour starting score";

  /** The guard as it is written in the harness right now. */
  function frame04Guard() {
    const m = /must:\s*(\/(?:[^/\\\n]|\\.)+\/[a-z]*)\s*,/g;
    const all = [...CODE.matchAll(m)].map((x) => x[1]);
    // Frame 04 is the one that mentions the score label.
    const found = all.find((r) => /Store SEO score/i.test(r));
    expect(found, `no score guard found among: ${all.join(" | ")}`).toBeTruthy();
    const body = found.slice(1, found.lastIndexOf("/"));
    const flags = found.slice(found.lastIndexOf("/") + 1);
    return new RegExp(body, flags);
  }

  it("matches the real first-run screen", () => {
    // The old guard was /scores \d+\/100/i and matched NOTHING: the screen says
    // "score", not "scores", and puts the number and "/ 100" on separate lines.
    // It failed every run, so 04 was never captured and H7 stayed blocked.
    expect(frame04Guard().test(REAL_FIRST_RUN)).toBe(true);
  });

  it("still rejects the empty state it exists to reject", () => {
    // The guard's whole purpose: an earlier run accepted a store with no
    // products — technically a capture, useless as a listing image.
    expect(frame04Guard().test(EMPTY_STATE)).toBe(false);
  });

  it("rejects the label without a score — the guard must not be loosened", () => {
    // The brief was "fix the guard, don't loosen it". A guard of /Store SEO
    // score/i would match a spinner and ship a listing image of one.
    expect(frame04Guard().test(SCORE_NOT_READY)).toBe(false);
  });

  it("the old broken pattern is gone", () => {
    expect(CODE).not.toMatch(/scores\s\\d\+/);
  });
});

describe("A3 — the pre-listing sweep reads form VALUES, not just rendered text", () => {
  /**
   * CW found "E2E Test Store" in an <input value=...> on the Settings frame.
   * Every text check this project runs reads innerText, and innerText does not
   * include form values — so the `must` guard passed, every residue sweep
   * passed, and the string went into a listing image anyway.
   *
   * That is a class of bug, not one instance: a control holding dev-store
   * residue is invisible to exactly the checks written to catch dev-store
   * residue. Fixing the one string would have left the hole open.
   */
  it("extracts input, textarea and select values from the frame", () => {
    expect(CODE).toMatch(/querySelectorAll\(["']input, textarea, select["']\)/);
    // and the value, not merely the element
    expect(CODE).toMatch(/el\.value/);
  });

  it("includes placeholders — a reviewer can read those too", () => {
    expect(CODE).toMatch(/getAttribute\(["']placeholder["']\)/);
  });

  it("checks the residue against text AND values together", () => {
    // Sweeping only `seen` would reintroduce the exact blind spot.
    expect(CODE).toMatch(/\[seen, \.\.\.values\]/);
  });

  it("names the residue that must never reach a listing image", () => {
    for (const term of ["E2E Test Store", "contentpilot-dev", "navaal-ttv", "myshopify"]) {
      expect(CODE, `residue list is missing ${term}`).toContain(term);
    }
  });

  it("fails the capture rather than warning", () => {
    // A residue warning on a capture nobody re-reads is a residue that ships.
    const sweep = CODE.slice(CODE.indexOf("const RESIDUE"));
    expect(sweep.slice(0, 600)).toMatch(/throw new Error/);
  });
});
