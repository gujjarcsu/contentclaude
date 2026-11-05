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
    expect(html).toContain(">Write<");
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
    expect(html).toContain(">Rewrite<");
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
});
