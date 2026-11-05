/**
 * Phase 2 items 2.2 and 2.3 — five nav items, and one name for one action.
 *
 * The sidebar had THIRTEEN items, not the twelve the brief counted: `Home` and
 * `Dashboard` both pointed at `/app`, so the same destination appeared twice
 * under two different words. Six more overlapped.
 *
 * The second half is worse, because it costs money rather than attention. One
 * job had six names on the Products page alone — "Generate All (17)", "Quick
 * Generate", "Generate {n} Products", "Generate for {n} selected", a per-row
 * "Generate" that only navigated, and "Start Bulk Job" — plus "Optimise N
 * Products", "Fix All Missing Content" and "Refresh Stale Content" elsewhere,
 * two of which were different labels for the same navigation.
 *
 * These are assertions over the rendered nav and the action labels, which are
 * static JSX. Where a behaviour can be driven instead, it is: the reachability
 * test below drives the real loaders.
 */
import { describe, it, expect } from "vitest";
import { unwrapT } from "../helpers/code.js"; // Phase 12 Part D: source guards see through t("…")
import { readFileSync, existsSync } from "node:fs";

const read = (f) => unwrapT(readFileSync(f, "utf8"));
const code = (f) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

/** Every <s-link> in the app layout, in order. */
function navItems() {
  const src = code("app/routes/app.jsx");
  return [...src.matchAll(/<s-link\s+href="([^"]+)"([^>]*)>([^<]+)<\/s-link>/g)].map((m) => ({
    href: m[1],
    attrs: m[2],
    label: m[3].trim(),
  }));
}

describe("the sidebar is six items", () => {
  const items = navItems();

  it("has exactly six", () => {
    // Redesign (Nov 2026) — Audit joined the five. All five top apps in the
    // category (Tapita, Avada, Smart SEO, StoreSEO, SEOWILL; walked on EBS on
    // 2 Nov 2026) carry score → issues → fix as its own destination. This is
    // the recorded decision, not a loosened guard: the list is still exact,
    // still ordered, and a seventh item fails it.
    expect(items.map((i) => i.label)).toEqual(["Home", "Audit", "Products", "Review", "Blog", "Settings"]);
  });

  it("no two items point at the same place", () => {
    // Home and Dashboard both went to /app. A sidebar that offers the same
    // destination twice teaches a merchant that the words do not mean anything.
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("Home is first and keeps rel=home", () => {
    // Without it Shopify points the app title at "/", and a bare "/" reaching
    // the login form is App Store rejection 2.1.1.
    expect(items[0].label).toBe("Home");
    expect(items[0].attrs).toMatch(/rel="home"/);
  });

  it("every label is one plain word", () => {
    for (const { label } of items) {
      expect(label).not.toMatch(/&amp;|&/); // "Review & Publish", "Plans & Billing"
      expect(label.split(" ").length).toBeLessThanOrEqual(1);
    }
  });
});

describe("nothing was made unreachable", () => {
  // The routes that left the sidebar still exist and are still linked from
  // inside the app. Deleting them is the owner's decision and has not happened.
  const merged = {
    // Redesign (Nov 2026): Home no longer carries an "Optimize store" strip —
    // its primary already says "Optimize N products". The Optimize screen is
    // linked from the Audit and from Bulk runs. (Before this, Home satisfied
    // the check through a COMMENT that mentioned the path — a false green of
    // the kind 00-CONSTITUTION L1 names — so `read` now strips comments.)
    "/app/optimize": ["app/routes/app.seo-audit.jsx", "app/routes/app.jobs.jsx"],
    "/app/seo-audit": ["app/routes/app._index.jsx", "app/routes/app.jsx"],
    "/app/jobs": ["app/routes/app.products.jsx"],
    "/app/collections": ["app/routes/app.products.jsx"],
    "/app/plans": ["app/routes/app._index.jsx", "app/routes/app.products.jsx"],
  };

  for (const [href, linkers] of Object.entries(merged)) {
    it(`${href} still exists as a route`, () => {
      const file = `app/routes/app${href.replace("/app", "").replace(/\//g, ".")}.jsx`;
      expect(existsSync(file), `${file} was deleted`).toBe(true);
    });

    it(`${href} is linked from at least one screen a merchant can reach`, () => {
      const linked = linkers.some((f) => code(f).includes(href));
      expect(linked, `nothing links to ${href}`).toBe(true);
    });
  }

  it("the tools row on Home is not hidden from new merchants", () => {
    // It used to be behind `!isNewShop`, which hid SEO Audit, Analytics and
    // Blog from someone exploring the app for the first time. With those three
    // out of the sidebar, that would have made them unreachable entirely.
    const src = code("app/routes/app._index.jsx");
    const toolsIdx = src.indexOf('navigate("/app/seo-audit")');
    expect(toolsIdx).toBeGreaterThan(-1);
    // No `!isNewShop &&` guard in the 400 characters before the tools row.
    expect(src.slice(Math.max(0, toolsIdx - 1200), toolsIdx)).not.toMatch(/\{!isNewShop && \(\s*<Layout>/);
  });
});

describe("one bulk action, one name", () => {
  const screens = [
    "app/routes/app.products.jsx",
    "app/routes/app.optimize.jsx",
    "app/routes/app._index.jsx",
    "app/routes/app.seo-audit.jsx",
  ];

  const RETIRED = [
    "Generate All",
    "Quick Generate",
    "Start Bulk Job",
    "Fix All Missing Content",
    "Refresh Stale Content",
    "Optimise",
    "Bulk Jobs",
  ];

  for (const label of RETIRED) {
    it(`"${label}" appears on no screen`, () => {
      for (const f of screens) {
        expect(code(f), `${f} still says "${label}"`).not.toContain(label);
      }
    });
  }

  it("the one name is used, and it is US-spelled", () => {
    expect(code("app/routes/app.products.jsx")).toMatch(/Optimize store/);
    expect(code("app/routes/app.optimize.jsx")).toMatch(/Optimize store/);
    // Home's one Optimize control is the Page primary, which counts the work
    // ("Optimize {n} products") rather than repeating the bulk action's name.
    expect(code("app/routes/app._index.jsx")).toMatch(/Optimize \{n, plural/);
    expect(code("app/routes/app.seo-audit.jsx")).toMatch(/Optimize store/);
  });

  it("the row action opens the product page instead of submitting a bulk job", () => {
    // It used to submit a bulk job, so on Free and Starter the most obvious
    // button on the row answered "Bulk generation requires Growth".
    // Redesign (Nov 2026): the list is an IndexTable; the row's one button is
    // rowAction(), which navigates by state (rowActionHref) and never submits.
    const src = read("app/routes/app.products.jsx");
    const block = src.slice(src.indexOf("const rowAction = ("), src.indexOf("const rowAction = (") + 900);
    expect(block).toContain("navigate(rowActionHref(stateOfContentMap(contentMap[id]), numericId))");
    expect(block).toContain("rowActionLabel(id, description)");
    expect(block).not.toContain("buildBulkFormData");
    expect(src).toContain("onClick={() => navigate(`/app/products/${numericId}`)}"); // the row itself opens the product page
  });

  it("Products has exactly one page primary action, and it is the bulk action", () => {
    const src = code("app/routes/app.products.jsx");
    expect((src.match(/primaryAction=\{/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(src).toMatch(/primaryAction=\{[\s\S]{0,200}Optimize store/);
  });

  it("the primary is not rendered at all when there is nothing to do", () => {
    // The brief: never render a disabled primary.
    const src = code("app/routes/app.products.jsx");
    // `noContentProducts` became `notOptimized` in Group 1: the number was never
    // "products with no content", and naming it that was half the defect.
    expect(src).toMatch(/notOptimized > 0\s*\?[\s\S]{0,900}: undefined/);
  });
});
