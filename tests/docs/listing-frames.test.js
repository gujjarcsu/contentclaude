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

  it("the harness never screenshots the whole page", () => {
    // `page.screenshot(` would put Shopify's chrome back in the image.
    expect(CODE).not.toMatch(/\bpage\.screenshot\s*\(/);
    // and the old ternary must not return.
    expect(CODE).not.toMatch(/frameElement\(\)\s*:\s*page/);
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
