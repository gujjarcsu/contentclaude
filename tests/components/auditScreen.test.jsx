/**
 * Redesign (Nov 2026) — THE AUDIT SCREEN, RENDERED.
 *
 * AuditBody is rendered through Polaris inside a memory router with the exact
 * shape the loader returns, so what the merchant reads is what is asserted:
 * the scope under every number, the three tabs with their counts, a partial
 * scan named in the subtitle and the one notice it allows, and a row that
 * says in words what a product is missing.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The route module imports its server side; none of it runs here, but the
// imports must resolve without a database or a Shopify app config.
vi.mock("../../app/db.server.js", () => ({ default: {} }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate: { admin: vi.fn() }, apiVersion: "2026-04" }));
vi.mock("../../app/utils/shopifyQuery.server.js", () => ({ shopifyQuery: vi.fn() }));
vi.mock("../../app/utils/candidates.server.js", () => ({ scopeForShop: vi.fn(), scopeQueryFor: vi.fn(), getCandidateCounts: vi.fn() }));
vi.mock("../../app/utils/plans.server.js", () => ({ getOrCreatePlan: vi.fn() }));
vi.mock("../../app/utils/startState.server.js", () => ({ SCORED_PRODUCT_FIELDS: "", toScorable: (n) => n }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppProvider } from "@shopify/polaris";
import { AuditBody } from "../../app/components/AuditBody.jsx";
import { readFileSync } from "node:fs";

const product = (i, over = {}) => ({
  id: `gid://shopify/Product/${i}`,
  numericId: String(i),
  title: `Product ${i}`,
  imageUrl: "",
  score: 40,
  checks: { hasDescription: true, hasMetaTitle: true, hasMetaDesc: true, hasAltText: true, noImages: false, missingAltText: false },
  feedBlocking: 0,
  isStale: false,
  lastUpdated: null,
  ...over,
});

const data = (over = {}) => ({
  products: [product(1, { checks: { hasDescription: false, hasMetaTitle: false, hasMetaDesc: true, hasAltText: false, noImages: true, missingAltText: false }, feedBlocking: 2, score: 12 }), product(2)],
  totalScore: 26,
  missingDesc: 1,
  missingMeta: 1,
  missingMetaDesc: 0,
  noImages: 1,
  missingAltText: 0,
  staleCount: 0,
  eligibleCount: 1,
  tally: { "openai·description·blocking": 1, "openai·image_link·blocking": 1 },
  dimensions: [{ key: "contentDensity", label: "Description depth and specifics", max: 25, points: 9, n: 2 }],
  truncatedReason: null,
  scannedCount: 2,
  catalogueCount: 10000,
  planName: "free",
  ...over,
});

const render = (el) =>
  renderToStaticMarkup(
    <AppProvider i18n={{}}>
      <RouterProvider router={createMemoryRouter([{ path: "/", element: el }], { initialEntries: ["/"] })} />
    </AppProvider>,
  );

describe("the Audit screen", () => {
  it("states its scope on the title row, under both rings, on the issues card and in every count", () => {
    const html = render(<AuditBody data={data()} />);
    expect(html).toContain("Scored 2 of 10,000 products");
    expect(html).toContain("Based on 2 of 10,000 products");
    expect(html).toContain("1 of 2 scanned can be listed");
    expect(html).toContain("Counted over the 2 products scanned");
    expect(html).toContain("1 of 2 scanned");
    expect(html).not.toContain("partial scan");
  });

  it("lists the store-wide findings Home shows, in Home's words, inside Critical (two screens never disagree, L5)", () => {
    const html = render(<AuditBody data={data({ storeChecks: { passwordProtected: true, crawlerBlocked: ["OAI-SearchBot", "Googlebot"] } })} />);
    expect(html).toContain("Critical (4)");
    expect(html).toContain("Your storefront is password-protected");
    expect(html).toContain("OAI-SearchBot, Googlebot are blocked from your storefront.");
    // Not measured (no daily watch yet): nothing is invented.
    const none = render(<AuditBody data={data({ storeChecks: { passwordProtected: false, crawlerBlocked: null } })} />);
    expect(none).toContain("Critical (2)");
    expect(none).not.toContain("blocked from your storefront");
  });

  it("the tabs carry their counts; a free plan sees which plan runs the bulk fix, never a dark button that refuses", () => {
    const html = render(<AuditBody data={data()} />);
    expect(html).toContain("Critical (2)");
    // The three severity cards choose the list; their counts are the lists' lengths.
    expect(html).toMatch(/aria-pressed="true"[\s\S]{0,1500}>2<[\s\S]{0,400}>Critical</);
    expect(html).toMatch(/>1<[\s\S]{0,400}>Needs work</); // the missing page title
    expect(html).toContain("1 product has no description — the OpenAI product feed cannot list it.");
    expect(html).toContain("Fixing many products at once is on Starter and above.");
    expect(html).toContain("See plans");
    expect(html).toContain("Add images in Shopify");
    expect(html).not.toContain("Write descriptions in bulk");
    expect(html).not.toMatch(/aria-disabled="true"|<button[^>]*\sdisabled/);
    // the one bulk name, as the page's primary action
    expect(html).toContain("Optimize store");
  });

  it("a paying plan gets the bulk fix itself", () => {
    const html = render(<AuditBody data={data({ planName: "starter" })} />);
    expect(html).toContain("Write descriptions in bulk");
    expect(html).not.toContain("See plans");
  });

  it("a capped scan is named in the subtitle and raises no banner; a failed one raises exactly one", () => {
    const capped = render(<AuditBody data={data({ truncatedReason: "cap", scannedCount: 500 })} />);
    expect(capped).toContain("Scored 500 of 10,000 products · partial scan");
    expect(capped).not.toContain("This is a partial audit");
    const failed = render(<AuditBody data={data({ scannedCount: 50 })} scanFailed />);
    expect(failed).toContain("partial scan");
    expect((failed.match(/This is a partial audit/g) ?? []).length).toBe(1);
    expect(failed).toContain("only the 50 most recently updated products were analyzed");
    expect(failed).not.toContain("sorted by title");
  });

  it("a product row says in words what is missing, and a clean row says so", () => {
    const html = render(<AuditBody data={data()} />);
    expect(html).toContain("No description");
    expect(html).toContain("No page title");
    expect(html).toContain("No images");
    expect(html).toContain("Nothing missing");
    expect(html).toContain('aria-label="Score: 12 out of 100"');
  });

  it("with the catalogue count unknown it says only what it scored — never 'of 0'", () => {
    const html = render(<AuditBody data={data({ catalogueCount: null })} />);
    expect(html).toContain("Scored 2 products");
    expect(html).not.toMatch(/of (0|null) products/);
  });

  it("a locked bulk fix is a lock, one sentence naming the plan and a plain link — no paragraph", () => {
    const html = render(<AuditBody data={data()} />);
    expect(html).toContain(">Locked<"); // the lock icon's accessible label
    expect(html).not.toContain("Everything listed here stays visible on every plan");
  });

  it("the eligibility card names each feed field with how many scanned products lack it", () => {
    const html = render(<AuditBody data={data()} />);
    expect(html).toContain("Required by the OpenAI feed");
    expect(html).toContain("Recommended");
    expect(html).toContain("Image alt text");
    // description and image each lack on 1 product; title and brand lack on none — a real zero
    expect((html.match(/>1 missing</g) ?? []).length).toBe(2);
    expect(html).toContain(">0 missing<");
  });

  it("no sentence explains the interface; the rubric rows are the dimensions and their points", () => {
    const html = render(<AuditBody data={data()} />);
    expect(html).not.toContain("Average points per dimension");
    expect(html).not.toContain("Home samples 30");
    expect(html).toContain("Description depth and specifics");
    expect(html).toContain("9 of 25");
  });

  it("an issue's Details fills the products table with the products it is about; a row shows the product's own photo", () => {
    const withImages = data({
      products: [
        product(1, { imageUrl: "https://cdn.shopify.com/s/files/p1.jpg", findingKeys: ["openai·description·blocking"], checks: { hasDescription: false, hasMetaTitle: false, hasMetaDesc: true, hasAltText: true, noImages: false, missingAltText: false }, feedBlocking: 1, score: 12 }),
        product(2),
      ],
    });
    const html = render(<AuditBody data={withImages} />);
    expect(html).toContain("https://cdn.shopify.com/s/files/p1.jpg");
    expect(html).toMatch(/aria-controls="audit-breakdown"[^>]*>[\s\S]{0,300}>Details</);
    expect(html).toContain('id="audit-breakdown"');
    expect(html).toContain("1 of 2 scanned");
  });

  it("the route module exports only route members — the screen lives in a component", () => {
    const src = readFileSync("app/routes/app.seo-audit.jsx", "utf8");
    const exported = [...src.matchAll(/^export\s+(?:const|function|async function|\{[^}]*\})\s*(\w+)?/gm)].map((m) => m[0]);
    expect(exported.join("\n")).not.toMatch(/AuditBody/);
  });

  it("each finding carries the surface it is about: GEO for the feed-only brand, SEO for page titles, Both for descriptions", () => {
    const html = render(<AuditBody data={data({ tally: { "openai·brand·blocking": 1, "openai·description·blocking": 1 }, missingMeta: 1 })} />);
    expect(html).toContain("nv-chip--both"); // description: search and the feed both need it
    expect(html).toContain("nv-chip--geo"); // brand: only the feed requires it
    // Page titles are search-only; they sit in Needs work, which is not open by default.
    const seoOnly = render(<AuditBody data={data({ tally: {}, missingMeta: 1 })} />);
    expect(seoOnly).toContain("nv-chip--seo");
  });

  it("three score cards, each with its scope: search readiness, AI shopping eligibility, audit coverage", () => {
    const html = render(<AuditBody data={data({ catalogueCount: 4 })} />);
    expect(html).toContain("Search readiness");
    expect(html).toContain("AI shopping eligibility");
    expect(html).toContain("Audit coverage");
    expect(html).toContain("2 of 4 products audited");
    expect(html).toContain('aria-label="Audit coverage: 50%"');
    expect(html).toContain("var(--navaal-tint-"); // the rings sit on a tint of their band
  });

  it("Shopify's capped count reads 10,000+, and coverage against a floor is not known", () => {
    const html = render(<AuditBody data={data({ catalogueCount: 10000, catalogueExact: false, scannedCount: 500 })} />);
    expect(html).toContain("Scored 500 of 10,000+ products");
    expect(html).toContain("Based on 500 of 10,000+ products");
    expect(html).toContain('aria-label="Audit coverage: not known"');
    expect(html).not.toContain("Audit coverage: 5%");
  });

  it("an unknown catalog size is never 0: coverage is a dash and the card says why", () => {
    const html = render(<AuditBody data={data({ catalogueCount: null })} />);
    expect(html).toContain('aria-label="Audit coverage: not known"');
    expect(html).toContain("We could not read your catalog size from Shopify just now");
  });

  it("nothing to fix shows the drawing and says the unscanned products may still have gaps", () => {
    const clean = data({ products: [product(1), product(2)], tally: {}, missingMeta: 0, eligibleCount: 2 });
    const html = render(<AuditBody data={clean} />);
    expect(html).toContain("Nothing to fix in the products scanned");
    expect(html).toContain("The products you have not scanned yet may still have gaps.");
    expect(html).toContain('class="nv-illu"');
    expect(html).not.toContain("All caught up");
  });

  it("a bulk fix this plan cannot run is a blurred preview under a lock card; a paying plan gets none", () => {
    const free = render(<AuditBody data={data()} />);
    expect(free).toContain("nv-locked");
    expect(free).toContain("Fix these in one run");
    const paid = render(<AuditBody data={data({ planName: "starter" })} />);
    expect(paid).not.toContain("nv-locked");
  });

  it("an empty store gets the shared empty state and no rings", () => {
    const html = render(<AuditBody data={data({ products: [], scannedCount: 0, eligibleCount: 0, tally: {}, dimensions: [], totalScore: 0, catalogueCount: 0 })} />);
    expect(html).toContain("Nothing to audit yet");
    expect(html).toContain("Add products to your store, and this is where you generate content for them.");
    expect(html).not.toContain("Search readiness");
  });
});
