/**
 * Redesign (Nov 2026) — THE PRODUCT EDITOR, RENDERED.
 *
 * The three-column editor through Polaris in a memory router with the
 * loader's shape: the score and checklist on the left, each field with what
 * is on the store and the draft under it in the centre, the gated features
 * as a lock and a sentence on the right, and one primary action that is
 * Generate until a draft exists and Publish draft after.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppProvider } from "@shopify/polaris";

vi.mock("../../app/db.server.js", () => ({ default: {} }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate: { admin: vi.fn() }, apiVersion: "2026-04" }));
vi.mock("../../app/utils/upgradePrompts.server.js", () => ({ getUpsell: vi.fn() }));
vi.mock("../../app/utils/reviewAsk.server.js", () => ({ openReviewAsk: vi.fn() }));
vi.mock("../../app/utils/storeScanCache.server.js", () => ({ invalidateContentCaches: vi.fn() }));
vi.mock("../../app/utils/publishSetting.server.js", () => ({ publishesWithoutReview: vi.fn() }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../../app/utils/plans.server.js", () => ({ getOrCreatePlan: vi.fn(), getMonthlyUsageCount: vi.fn() }));
vi.mock("../../app/utils/contentVersion.server.js", () => ({ snapshotAndPrune: vi.fn() }));
vi.mock("../../app/utils/ai.server.js", () => ({ sanitizeHtml: (s) => s }));
vi.mock("../../app/utils/adminGraphql.server.js", () => ({ readMutationResult: vi.fn() }));

const { default: Editor } = await import("../../app/routes/app.products_.$id.jsx");

const payload = (over = {}) => ({
  product: {
    id: "gid://shopify/Product/2004",
    title: "Caroma Liano Nexus Basin Mixer",
    handle: "caroma-liano",
    status: "ACTIVE",
    productType: "Tapware",
    vendor: "Caroma",
    description: "Thirty-three words of the merchant's own description about a basin mixer with a ceramic cartridge and a long warranty, written for shoppers who want the facts before the flourish today.",
    descriptionHtml: "<p>Thirty-three words of the merchant's own description about a basin mixer with a ceramic cartridge and a long warranty, written for shoppers who want the facts before the flourish today.</p>",
    seoTitle: "",
    seoDescription: "",
    imageUrl: "",
    imageAlt: "",
    images: [
      { id: "m1", url: "https://x/1.png", altText: "Front view" },
      { id: "m2", url: "https://x/2.png", altText: "" },
    ],
    hasMoreImages: false,
    variants: [{ title: "Chrome", price: "329.00", sku: "A" }],
    tags: ["tapware"],
  },
  existingContent: {},
  hasBrandVoice: true,
  productScore: { score: 38, checks: {}, breakdown: [] },
  feedFindings: [],
  qualityScore: { score: 0, grade: "" },
  versionsByType: {},
  templates: [],
  planName: "free",
  entitlements: { bulkJobs: false, abVariants: false, versionHistory: false, contentTemplates: false },
  publishWithoutReview: false,
  upsell: null,
  shopDomain: "ebs.myshopify.com",
  ...over,
});

const render = (data) =>
  renderToStaticMarkup(
    <AppProvider i18n={{}}>
      <RouterProvider
        router={createMemoryRouter(
          [{ path: "/app/products/:id", Component: Editor, loader: () => data, action: () => null, hydrateFallbackElement: null }],
          { initialEntries: ["/app/products/2004"], hydrationData: { loaderData: { "0": data } } },
        )}
      />
    </AppProvider>,
  );

describe("the product editor", () => {
  it("the left rail scores the product on the shared rubric and lists the checks with their reasons", () => {
    const html = render(payload());
    expect(html).toContain('aria-label="Search readiness: 38 out of 100"');
    expect(html).toContain("1 of 6 checks pass");
    expect(html).toContain("Description of at least 50 words");
    expect(html).toContain("30 words now");
    expect(html).toContain("1 image without alt text");
    expect(html).toContain("Title, description, brand and image");
    expect(html).toContain("Google listing preview");
  });

  it("with no draft the primary is Generate; each field shows the store's own text and offers Write", () => {
    const html = render(payload());
    expect(html).toContain(">Generate<");
    expect(html).not.toContain("Publish draft");
    expect(html).toContain("Currently on your store");
    expect(html).toContain("(using product title)");
    expect(html).toContain("(none set)");
    // Redesign v2: each field's own write is the brand "AI optimize" button (Tapita 083),
    // named for what it does to which field.
    expect(html).toContain(">AI optimize<");
    expect(html).toContain('aria-label="Write Page title with AI"');
    expect(html).toContain('aria-label="Write Questions and answers with AI"');
    expect(html).toContain("Enhance what is there");
  });

  it("with a draft the primary is Publish draft, the field is editable, and the character bar counts against the limit", () => {
    const html = render(
      payload({
        existingContent: {
          description: { generated: "<p>A draft.</p>", original: "", status: "draft", version: 1, id: "c1" },
          metaTitle: { generated: "Caroma Liano Nexus Basin Mixer Chrome | EBS", original: "", status: "draft", version: 1, id: "c2" },
        },
      }),
    );
    expect(html).toContain("Publish draft");
    expect(html).toContain("Rewrite all");
    expect(html).toContain("Draft (yours to edit)");
    expect(html).toContain("43/60 characters");
    expect(html).toContain('aria-label="Rewrite Description with AI"');
    expect(html).toContain('aria-label="Rewrite Page title with AI"');
  });

  it("gated features are a lock and a sentence naming the plan, with a plain link — never a dark full-width button", () => {
    const html = render(payload());
    expect(html).toContain("Two drafts to compare is on Growth and above.");
    expect(html).toContain("Restoring earlier versions is on Starter and above.");
    expect(html).not.toContain("upgrade to Growth");
    expect(html).not.toMatch(/Polaris-Button--fullWidth[^>]*>[^<]*<[^>]*>[^<]*Growth/);
    const growth = render(payload({ entitlements: { bulkJobs: true, abVariants: true, versionHistory: true, contentTemplates: false } }));
    expect(growth).toContain("Write two options");
    expect(growth).not.toContain("Two drafts to compare is on");
  });

  it("a published field on a Shopify draft says both things", () => {
    const html = render(
      payload({
        product: { ...payload().product, status: "DRAFT" },
        existingContent: { description: { generated: "<p>Live.</p>", original: "", status: "published", version: 1, id: "c1" } },
      }),
    );
    expect(html).toContain("Published · product is a Shopify draft, not on your storefront");
  });

  it("the description draft reads as words, not HTML; the HTML opens only behind Edit", () => {
    const html = render(
      payload({
        existingContent: {
          description: { generated: "<p>A basin mixer that earns its place.</p><ul><li>WELS 5 star</li><li>35 mm cartridge</li></ul>", original: "", status: "draft", version: 1, id: "c1" },
        },
      }),
    );
    expect(html).toContain("A basin mixer that earns its place.");
    expect(html).toContain("WELS 5 star");
    // No tag is shown as text anywhere (escaped, as a textarea or text node would carry it).
    expect(html).not.toContain("&lt;p&gt;");
    expect(html).not.toContain("&lt;li&gt;");
    expect(html).toContain(">Edit<");
  });

  it("the store's own description is shown as words too, never as a slice of HTML", () => {
    const html = render(payload({ product: { ...payload().product, descriptionHtml: "<p>One.</p><p>Two.</p><p>Three.</p><p>Four.</p>" } }));
    expect(html).toContain("One.");
    expect(html).toContain("Three.");
    expect(html).not.toContain("Four.");
    expect(html).toContain("Show all");
  });

  it("carries no sentence that explains the interface", () => {
    const html = render(payload({ existingContent: { description: { generated: "<p>A draft.</p>", original: "", status: "draft", version: 1, id: "c1" } } }));
    for (const line of [
      "Edit the HTML directly",
      "Google shows about 60 characters",
      "Scored on what is on your store now",
      "you can stay on this page",
      "Improves what's already there",
      "Write two different versions",
      "Cmd+Enter",
    ]) {
      expect(html, line).not.toContain(line);
    }
  });

  it("the check that keeps a product out of the feed is red; the rest are yellow until they pass", () => {
    const html = render(payload({ feedFindings: [{ surface: "openai", field: "brand", grade: "blocking" }] }));
    expect(html).toContain("Missing: brand");
    expect(html).toMatch(/Polaris-Icon--toneCritical/);
    expect(html).toMatch(/Polaris-Icon--toneCaution/);
  });

  it("the primary action is never disabled", () => {
    const primary = (html) => /Polaris-Page-Header__PrimaryActionWrapper.*?(<button[^>]*>)/.exec(html)?.[1] ?? "";
    for (const html of [render(payload()), render(payload({ existingContent: { description: { generated: "<p>A draft.</p>", original: "", status: "draft", version: 1, id: "c1" } } }))]) {
      const button = primary(html);
      expect(button).toContain('aria-disabled="false"');
      expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });
});

describe("the product editor, redesign v2 (Tapita 083/084, Smart SEO 111)", () => {
  it("prices are in the shop's own currency, never a guessed dollar sign", () => {
    const html = render(payload({ currencyCode: "EUR" }));
    expect(html).toContain("€329.00");
    expect(html).not.toContain("$329");
    // Unknown currency: the amount alone, still no "$".
    const unknown = render(payload({ currencyCode: null }));
    expect(unknown).toContain("329.00");
    expect(unknown).not.toContain("$329");
  });

  it("the score sits on a tint of its band, with the checks grouped Critical · Need improvement · Good", () => {
    const html = render(payload({ feedFindings: [{ surface: "openai", field: "brand", grade: "blocking" }] }));
    expect(html).toContain("var(--navaal-tint-critical)");
    expect(html).toContain(">Critical<");
    expect(html).toContain(">Need improvement<");
    expect(html).toContain(">Good<");
    expect(html).toContain('aria-controls="checks-critical"');
    expect(html).toContain("Missing: brand");
  });

  it("the Google snippet measures its title and description against their limits", () => {
    const html = render(payload());
    expect(html).toContain('id="snippet-title-chars"');
    expect(html).toContain('id="snippet-desc-chars"');
    expect(html).toContain("/60 characters");
    expect(html).toContain("/155 characters");
  });

  it("images list real thumbnails with their alt text, a count, and one Optimize alt for all", () => {
    const html = render(payload());
    expect(html).toContain(">Optimize alt<");
    expect(html).toContain('aria-label="Write alt text for all 2 images"');
    expect(html).toContain('value="Front view"');
    expect(html).toContain('placeholder="No alt text"');
    expect(html).toMatch(/readOnly|readonly/);
    expect(html).toContain("https://x/1.png");
  });

  it("a product with no images says what that costs and where to fix it", () => {
    const html = render(payload({ product: { ...payload().product, images: [] } }));
    expect(html).toContain("No images on this product");
    expect(html).toContain("Add images in Shopify");
    expect(html).not.toContain(">Optimize alt<");
  });

  it("a plan-locked feature is the real thing blurred under a lock card, naming the plan", () => {
    const html = render(payload());
    expect(html).toContain("nv-locked");
    expect(html).toContain("Two drafts to compare is on Growth and above.");
    expect(html).toContain("See plans");
  });

  it("the action's catch-all says what to do next, not that an unexpected error occurred", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/routes/app.products_.$id.jsx", "utf8");
    expect(src).not.toContain("An unexpected error occurred");
    expect(src).toContain("Publishing didn't finish. Open the product in Shopify to see what changed before you try again.");
  });
});

describe("the description toolbar", async () => {
  const { DescriptionToolbar } = await import("../../app/components/ProductEditorPieces.jsx");
  it("is a labelled toolbar of named formatting buttons over the HTML field", () => {
    const html = renderToStaticMarkup(
      <AppProvider i18n={{}}>
        <DescriptionToolbar textareaId="description-html" value="<p>x</p>" onChange={() => {}} />
      </AppProvider>,
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-controls="description-html"');
    for (const label of ["Bold", "Italic", "Heading", "Bulleted list", "Numbered list", "Link"]) expect(html, label).toContain(`aria-label="${label}"`);
  });
});
