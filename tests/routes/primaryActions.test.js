/**
 * Phase 2 item 2.7 — one primary action per screen, chosen by state.
 *
 * A primary button is a claim about what to do next. Home made that claim six
 * times at once to a brand-new merchant: four onboarding steps, the theme-embed
 * card, and the usage-card upsell — and two of those six ("Open theme editor")
 * were the same action rendered by two different components on the same screen.
 * Meanwhile the two buttons that were actually the page's purpose, "Generate
 * content" and "Optimize store", were the ones hidden from new shops.
 *
 * Worse were the primaries rendered once per CARD. The Review page put a green
 * primary on every product — a 50-product page rendered 52 of them, and one of
 * them, "✓ Approved", was a primary whose job was to UN-approve. The Jobs page
 * did the same per job.
 *
 * These are assertions over static JSX because that is what a button variant
 * is. Where a decision is computed, the computation is asserted instead.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const read = (f) => readFileSync(f, "utf8");
const code = (f) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const PHASE_3 = ["app.welcome.jsx", "app.setup.jsx"];

function uiFiles() {
  const out = [];
  for (const dir of ["app/routes", "app/components"]) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".jsx")) out.push(join(dir, f).split(sep).join("/"));
    }
  }
  return out.filter((f) => !PHASE_3.some((p) => f.endsWith(p)));
}

/** `variant="primary"` occurrences, however the attribute is wrapped. */
const primaryCount = (f) => (code(f).match(/variant="primary"/g) || []).length;

describe("no screen renders a crowd of primaries", () => {
  it("no file has more than two, and two only where they are on different tabs", () => {
    const offenders = uiFiles()
      .map((f) => [f, primaryCount(f)])
      .filter(([, n]) => n > 2);
    expect(offenders).toEqual([]);
  });

  it("Home has none of its own — its primary is the Page action", () => {
    // Six at once, for the merchant least able to tell them apart.
    expect(primaryCount("app/routes/app._index.jsx")).toBe(0);
    expect(code("app/routes/app._index.jsx")).toMatch(/<Page primaryAction=\{primaryAction\}/);
  });

  it("the theme-editor action is not a primary in two components at once", () => {
    expect(primaryCount("app/components/EmbedSetupCard.jsx")).toBe(0);
  });

  it("no primary is rendered once per card", () => {
    // A primary inside a .map() over jobs, products or collections multiplies
    // by the size of the merchant's catalogue.
    for (const f of [
      "app/routes/app.jobs.jsx",
      "app/routes/app.collections.jsx",
      "app/routes/app.review.jsx",
    ]) {
      const src = code(f);
      const perCard = src.match(/\.map\(\([^)]*\)\s*=>\s*[\s\S]{0,4000}?variant="primary"/g) || [];
      // The publish primary on Review sits outside the product map.
      expect(perCard.length, `${f} renders a primary per card`).toBeLessThanOrEqual(0);
    }
  });
});

describe("Home's primary is chosen by what the merchant should do next", () => {
  const src = code("app/routes/app._index.jsx");

  it("drafts waiting beat everything else", () => {
    expect(src).toMatch(/draftCount > 0[\s\S]{0,200}Review \$\{draftCount\}/);
  });

  it("then products with no content", () => {
    expect(src).toMatch(/needsContentCount > 0[\s\S]{0,200}Optimize \$\{needsContentCount\}/);
  });

  it("and an audit when there is nothing else to do", () => {
    expect(src).toMatch(/content: "Run audit"/);
  });

  it("the fallback offers a second thing to do rather than a dead end", () => {
    expect(src).toMatch(/Write a blog post/);
  });

  it("the label counts the actual work, so it is never a bare verb", () => {
    expect(src).toMatch(/draftCount === 1 \? "" : "s"/);
    expect(src).toMatch(/needsContentCount === 1 \? "" : "s"/);
  });
});

describe("no primary is rendered disabled because input is missing", () => {
  /**
   * The distinction that matters: a button disabled WHILE SUBMITTING is a
   * double-submit guard and stays. A button disabled because a field is empty
   * is a dead end — it does not say which field, and the merchant is left
   * clicking nothing. Both actions below validate server-side and answer with a
   * sentence, so the button can stay live.
   */
  it("the blog generate button no longer waits for a topic before it will click", () => {
    const src = code("app/routes/app.blog.jsx");
    expect(src).not.toMatch(/disabled=\{!topic\.trim\(\)/);
    expect(src).toMatch(/disabled=\{isGenerating\}/);
  });

  it("and the blog action still refuses an empty topic in words", () => {
    expect(code("app/routes/app.blog.jsx")).toMatch(/"Topic is required\."/);
  });

  it("the blog publish button no longer waits for a title", () => {
    const src = code("app/routes/app.blog.jsx");
    expect(src).not.toMatch(/disabled=\{isPublishing \|\| !editedTitle/);
    expect(code("app/routes/app.blog.jsx")).toMatch(/Title and content are required to publish\./);
  });

  it("the product page generate button no longer waits for a ticked checkbox", () => {
    const src = code("app/routes/app.products_.$id.jsx");
    expect(src).not.toMatch(/disabled=\{isLoading \|\| noneSelected\}/);
  });

  it("the Products page primary is absent, not disabled, when there is nothing to do", () => {
    const src = code("app/routes/app.products.jsx");
    expect(src).toMatch(/noContentProducts > 0\s*\?[\s\S]{0,300}: undefined/);
  });
});
