/**
 * Phase 15 (FR14) — THE ACCESSIBLE LABEL, VERIFIED RATHER THAN ASSUMED.
 *
 * Phase 14 pointed every quota ProgressBar at the fraction with Polaris's
 * `ariaLabelledBy`, and `tests/routes/a1Defects.test.js` proved the four routes
 * pass the prop. What no test proved — and what CW could not check, because no
 * harness can reach inside this app's cross-origin admin iframe — is the half
 * that actually matters to a screen reader:
 *
 *   does the prop reach the element, and is the fraction what the element is
 *   named by?
 *
 * A source check cannot answer that. If Polaris ignored the prop, every
 * assertion in a1Defects would still pass and the bar would still announce
 * "1%". So this renders Polaris and reads the markup.
 *
 * WHAT THE RENDER SHOWS, recorded because it is not obvious:
 *   - `ariaLabelledBy` does emit `aria-labelledby`, on a real `<progress>`;
 *   - Polaris ALSO emits its own `<span class="Polaris-ProgressBar__Label">19%</span>`,
 *     visually hidden by `clip-path: inset(50%)` — so the rounded percent is
 *     still in the accessibility tree as a separate text node. It is Polaris's,
 *     not ours, and it is no longer the bar's NAME. The assertions below pin
 *     that, so the day Polaris changes it we find out from a red test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider, ProgressBar, Text } from "@shopify/polaris";
import { quotaPct, QUOTA_PCT_IS_BAR_GEOMETRY_ONLY } from "../../app/utils/quota.js";

/** The four surfaces and the id each one labels its bar with. */
const SURFACES = [
  ["Home", "app/routes/app._index.jsx", "home-credit-usage"],
  ["Plans", "app/routes/app.plans.jsx", "plans-credit-usage"],
  ["Products", "app/routes/app.products.jsx", "products-credit-usage"],
  ["Blog", "app/routes/app.blog.jsx", "blog-credit-usage"],
];

const read = (f) => readFileSync(f, "utf8");

/** Render one bar exactly as the routes configure it, with its readout above. */
function renderBar({ id, readout, usageCount, monthlyCredits }) {
  return renderToStaticMarkup(
    React.createElement(
      AppProvider,
      { i18n: {} },
      React.createElement(Text, { as: "p", id }, readout),
      React.createElement(ProgressBar, { progress: quotaPct(usageCount, monthlyCredits), size: "small", ariaLabelledBy: id }),
    ),
  );
}

/**
 * The accessible NAME of the progressbar, computed the way a screen reader
 * does for `aria-labelledby`: follow the id, take that element's text.
 * Deliberately hand-rolled — the point is to resolve the reference, and a
 * library that did it for us would be the thing under test.
 */
function accessibleName(html) {
  const bar = html.match(/<progress\b[^>]*>/);
  if (!bar) return { error: "no progressbar element rendered" };
  const labelledBy = bar[0].match(/aria-labelledby="([^"]+)"/)?.[1] ?? null;
  const ariaLabel = bar[0].match(/aria-label="([^"]*)"/)?.[1] ?? null;
  if (!labelledBy) return { labelledBy: null, ariaLabel, name: ariaLabel };
  const target = html.match(new RegExp(`<[^>]*\\bid="${labelledBy}"[^>]*>([\\s\\S]*?)</[a-z]+>`));
  return {
    labelledBy,
    ariaLabel,
    name: target ? target[1].replace(/<[^>]+>/g, "").trim() : null,
  };
}

describe("Polaris honours ariaLabelledBy — the half no harness could reach", () => {
  it("the prop reaches a real progressbar element as aria-labelledby", () => {
    const html = renderBar({ id: "home-credit-usage", readout: "3 / 100 used", usageCount: 3, monthlyCredits: 100 });
    expect(html).toMatch(/<progress\b/);
    const a11y = accessibleName(html);
    expect(a11y.labelledBy).toBe("home-credit-usage");
  });

  it("and nothing else competes for the name", () => {
    const html = renderBar({ id: "home-credit-usage", readout: "3 / 100 used", usageCount: 3, monthlyCredits: 100 });
    const bar = html.match(/<progress\b[^>]*>/)[0];
    // an aria-label would WIN over aria-labelledby and put a percent back
    expect(bar).not.toMatch(/aria-label=/);
    expect(bar).not.toMatch(/aria-valuetext=/);
  });
});

describe("the bar is named by the fraction, on every surface", () => {
  const CASES = [
    { readout: "3 / 100 used", usageCount: 3, monthlyCredits: 100 },
    { readout: "97 remaining of 100", usageCount: 3, monthlyCredits: 100 },
    // FR14's own example: 19 of 4,000 is 0.475%, which quotaPct floors UP to 1%
    { readout: "19 / 4000 used", usageCount: 19, monthlyCredits: 4000 },
  ];

  for (const [name, , id] of SURFACES) {
    for (const c of CASES) {
      it(`${name}: "${c.readout}" is what the bar is called`, () => {
        const html = renderBar({ id, ...c });
        const a11y = accessibleName(html);
        expect(a11y.labelledBy).toBe(id);
        expect(a11y.name).toBe(c.readout);
        // THE DEFECT: a rounded percent was the only thing a screen reader got
        expect(a11y.name).not.toMatch(/^\s*\d+\s*%\s*$/);
        expect(a11y.name).toMatch(/\d/);
      });
    }
  }

  it("the overstatement FR14 named is real, and it is not what the bar announces", () => {
    // 19 of 4,000 is under half a percent; the bar's geometry says 1%.
    expect(quotaPct(19, 4000)).toBe(1);
    expect((19 / 4000) * 100).toBeLessThan(0.5);
    const a11y = accessibleName(renderBar({ id: "plans-credit-usage", readout: "19 / 4000 used", usageCount: 19, monthlyCredits: 4000 }));
    expect(a11y.name).toBe("19 / 4000 used");
    expect(a11y.name).not.toContain("1%");
  });
});

describe("what Polaris adds of its own, pinned so a change is noticed", () => {
  it("Polaris renders its own visually-hidden percent, and it is NOT the bar's name", () => {
    const html = renderBar({ id: "home-credit-usage", readout: "3 / 100 used", usageCount: 19, monthlyCredits: 100 });
    // present, and ours to know about rather than to control
    expect(html).toMatch(/<span class="Polaris-ProgressBar__Label">19%<\/span>/);
    // outside the <progress>, so it cannot be the accessible name
    const bar = html.match(/<progress\b[^>]*><\/progress>/);
    expect(bar).toBeTruthy();
    expect(bar[0]).not.toContain("19%");
    expect(accessibleName(html).name).toBe("3 / 100 used");
  });

  it("the class Polaris hides it with is still the visually-hidden one", () => {
    // If this rule ever becomes `display:none` the text leaves the a11y tree,
    // and if it ever becomes visible the percent is back on the screen. Either
    // is a change worth finding here rather than on a listing screenshot.
    const css = readFileSync("node_modules/@shopify/polaris/build/esm/styles.css", "utf8");
    const i = css.indexOf("Polaris-ProgressBar__Label");
    expect(i).toBeGreaterThan(-1);
    const rule = css.slice(i, i + 400);
    expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(rule).not.toMatch(/display:\s*none/);
  });
});

describe("the four routes still wire it up", () => {
  const strip = (s) =>
    s
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");

  for (const [name, file, id] of SURFACES) {
    it(`${name} gives the readout the id and points the bar at it`, () => {
      const src = strip(read(file));
      expect(src).toMatch(new RegExp(`id="${id}"`));
      expect(src).toMatch(new RegExp(`ariaLabelledBy="${id}"`));
    });
  }

  it("quota.js still records that the percent is geometry, never a readout", () => {
    expect(QUOTA_PCT_IS_BAR_GEOMETRY_ONLY).toBe(true);
  });
});
