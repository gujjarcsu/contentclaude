/**
 * A4.7 — the reachability audit (L15).
 *
 * `includeDraftProducts` shipped with a column, a read path, a write path and a
 * green suite, and appeared on **no screen**. No merchant could ever turn it on.
 * That is the sixth false-green shape, and the first that a perfect test suite
 * guarantees you will miss: every source-level assertion about the machinery
 * passed, because the machinery was fine.
 *
 * So this audits every `BrandVoice` boolean a rule reads, not only the new one.
 * It reads the schema, so a boolean added later is audited automatically rather
 * than being remembered about.
 *
 * ── The two halves, and why the second is not obvious ─────────────────────
 *
 * 1. a control exists in Settings, and
 * 2. a hidden input posts it.
 *
 * A Polaris `Checkbox` is **not a form field**. Without the hidden input the
 * control renders, toggles, looks saved and posts nothing — indistinguishable
 * from working, until a merchant reloads.
 *
 * ── What this prints if the thing it watches is broken ────────────────────
 *
 * Delete any control or hidden input from Settings and the matching case fails,
 * naming the field. Add a `Boolean` to `BrandVoice` and wire it into a rule
 * without a control, and it fails on the next run without anyone remembering.
 *
 * ── What this CANNOT prove ────────────────────────────────────────────────
 *
 * That the control is VISIBLE (L15's third requirement). A control in a
 * collapsed section, behind a plan gate, or rendered under a false condition
 * passes every assertion here. That needs a browser and is queued for a human.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const settings = strip(readFileSync("app/routes/app.settings.jsx", "utf8"));

/** Every Boolean column on BrandVoice, read from the schema rather than listed. */
const BRAND_VOICE_BOOLEANS = (() => {
  const model = schema.slice(schema.indexOf("model BrandVoice"));
  const body = model.slice(0, model.indexOf("\n}"));
  return [...body.matchAll(/^\s*(\w+)\s+Boolean/gm)].map((m) => m[1]);
})();

/**
 * Fields deliberately not exposed as their own control, with the reason.
 *
 * An exemption must say WHY, so that "we forgot" can never masquerade as "we
 * decided". Empty today: all four booleans have a control.
 */
const EXEMPT = Object.freeze({});

describe("the audit can actually fail", () => {
  it("read the schema and found the booleans", () => {
    // A guard that enumerates nothing passes for every field it never saw.
    expect(BRAND_VOICE_BOOLEANS.length).toBeGreaterThanOrEqual(4);
    expect(BRAND_VOICE_BOOLEANS).toEqual(
      expect.arrayContaining([
        "autopilotEnabled",
        "autopilotAutoPublish",
        "publishWithoutReview",
        "includeDraftProducts",
      ]),
    );
  });

  it("read the Settings route", () => {
    expect(settings.length).toBeGreaterThan(2000);
    expect(settings).toMatch(/saveBrandVoice/);
  });
});

describe("every BrandVoice boolean is reachable by a merchant", () => {
  it.each(BRAND_VOICE_BOOLEANS)("%s has a control in Settings", (field) => {
    if (EXEMPT[field]) return;
    // Either bound as `checked={field}` or driven through its own setter.
    const bound = new RegExp(`checked=\\{${field}\\}`).test(settings);
    expect(bound, `${field} has no control bound to it in Settings`).toBe(true);
  });

  it.each(BRAND_VOICE_BOOLEANS)("%s is actually submitted with the form", (field) => {
    if (EXEMPT[field]) return;
    // A Polaris Checkbox is not a form field. Without this the control renders,
    // toggles, looks saved and posts nothing.
    const posts = new RegExp(`name="${field}" value=\\{${field}\\.toString\\(\\)\\}`).test(settings);
    expect(posts, `${field} has a control but no hidden input, so it posts nothing`).toBe(true);
  });

  it.each(BRAND_VOICE_BOOLEANS)("%s is read back by the action", (field) => {
    if (EXEMPT[field]) return;
    const read = new RegExp(`${field}:\\s*(formData\\.get\\("${field}"\\)|\\w+)`).test(settings);
    expect(read, `${field} is posted but the action never reads it`).toBe(true);
  });

  it("every exemption states a reason", () => {
    // "We forgot" must never be able to masquerade as "we decided".
    for (const [field, reason] of Object.entries(EXEMPT)) {
      expect(typeof reason, `${field} is exempt with no reason`).toBe("string");
      expect(reason.length).toBeGreaterThan(30);
    }
  });
});
