/**
 * Phase 2 item 2.8 — the Review screen is the heart of the app.
 *
 * The failure it shipped with was not cosmetic. Every draft on the page was
 * pre-approved:
 *
 *     useState(() => new Set(products.map((p) => p.productId)))
 *
 * So a merchant's FIRST click on the publish button pushed up to fifty pieces
 * of AI-written content to their live storefront — content they had never
 * opened. The app's own listing promises nothing goes live until they approve
 * it, and the screen where they approve it had approved everything for them.
 *
 * Beside that: edits lived in React state and pagination called `navigate()`,
 * so moving to page two silently discarded them; the content type was shown as
 * the raw database key `metaTitle`; the quality score was a bare number with no
 * denominator; and every product card carried a green PRIMARY button whose job
 * was to un-approve.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");
const SRC = read("app/routes/app.review.jsx");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("nothing is approved on the merchant's behalf", () => {
  it("the approved set starts empty", () => {
    expect(code).toMatch(/useState\(\(\)\s*=>\s*new Set\(\)\)/);
    // The only place every product may be approved at once is the explicit
    // "Approve all on this page" handler — never the initial state.
    expect(code).not.toMatch(/useState\([\s\S]{0,40}new Set\(products\.map/);
  });

  it("approving everything on the page is an explicit action, and says so", () => {
    expect(code).toMatch(/Approve all on this page/);
    expect(code).toMatch(/Clear selection/);
  });

  it("the publish button is absent, not disabled, when nothing is approved", () => {
    expect(code).toMatch(/approvedCount > 0 &&/);
  });
});

describe("rejecting is confirmed, because emptying the approvals armed it", () => {
  /**
   * Starting with nothing approved fixed one foot-gun and created another:
   * "Reject skipped" rejects everything NOT approved, which on a freshly
   * loaded page is every draft. It was enabled by default with no confirm.
   */
  it("the button opens a confirm rather than submitting", () => {
    expect(code).toMatch(/onClick=\{\(\) => setConfirmReject\(true\)\}/);
  });

  it("the confirm is destructive and counts what will be rejected", () => {
    expect(code).toMatch(/destructive: true/);
    expect(code).toMatch(/Reject \$\{unapprovedIds\.length\} draft/);
  });

  it("it says the storefront is not touched, because it is not", () => {
    expect(code).toMatch(/live storefront is not changed/);
  });

  it("the button counts too, so it is never a vague bulk action", () => {
    expect(code).toMatch(/Reject \$\{unapprovedIds\.length\} not approved/);
  });
});

describe("edits survive leaving the page", () => {
  it("there is a saveEdit action branch", () => {
    expect(code).toMatch(/actionType.*===.*"saveEdit"|"saveEdit"/);
  });

  it("it writes through the composite key rather than guessing a row", () => {
    expect(code).toMatch(/shop_productId_contentType/);
    expect(code).toMatch(/generatedContent\.upsert/);
  });

  it("it saves on blur, not on every keystroke", () => {
    // A fetcher per character would be a request per character.
    expect(code).toMatch(/onBlur=/);
  });

  it("saving an edit does not re-run the loader", () => {
    // Without this, every blur re-queries Shopify for all fifty products on
    // the page. The loader is the expensive part of this route.
    expect(code).toMatch(/shouldRevalidate/);
  });
});

describe("the merchant can see what they are replacing", () => {
  it("current and proposed sit side by side, and stack on a phone", () => {
    expect(code).toMatch(/InlineGrid columns=\{\{ xs: 1, md: 2 \}\}/);
  });

  it("an empty current value says so instead of showing a blank box", () => {
    expect(code).toMatch(/Nothing yet/);
  });

  it("the loader fetches the current values in the existing batch query", () => {
    // A second round trip per page would undo item 2.11's work.
    expect(code).toMatch(/descriptionHtml/);
    expect(code).toMatch(/seo \{/);
  });
});

describe("what the merchant reads is plain language", () => {
  it("content types are never shown as raw database keys", () => {
    expect(code).toMatch(/CONTENT_LABELS/);
    expect(code).toMatch(/"Page title"/);
    expect(code).toMatch(/"Search description"/);
    // The badge must not render the key itself.
    expect(code).not.toMatch(/<Badge key=\{t\} tone="info">\{t\}<\/Badge>/);
  });

  it("the quality score has a denominator", () => {
    expect(code).toMatch(/\/100/);
  });

  it("every text input has an accessible name", () => {
    // `label=""` with labelHidden gives a control no accessible name at all.
    expect(code).not.toMatch(/label=""/);
  });
});

describe("keyboard, without hijacking typing", () => {
  it("Enter approves and the arrows move between products", () => {
    expect(code).toMatch(/keydown/);
    expect(code).toMatch(/ArrowRight/);
  });

  it("it does not fire while the merchant is editing text", () => {
    expect(code).toMatch(/TEXTAREA/);
    expect(code).toMatch(/contentEditable|isContentEditable/);
  });

  it("a stray Enter before choosing a product approves nothing", () => {
    // The index starts at -1 rather than 0.
    expect(code).toMatch(/useState\(-1\)/);
  });
});

/**
 * The action's existing behaviour is covered in full by
 * tests/routes/review.publish.test.js — the THROTTLED path, the FAQ downgrade,
 * the edits merge. This block only guards that the rewrite did not quietly
 * change the contract those tests depend on.
 */
describe("the publish contract is unchanged", () => {
  const { prisma, authenticate, publishProductWithRetry, readMutationResult, graphql } = vi.hoisted(
    () => ({
      prisma: {
        generatedContent: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 1 })),
          upsert: vi.fn(async () => ({})),
        },
        growthState: { findUnique: vi.fn(async () => ({ embedConfirmedAt: new Date() })) },
        $transaction: vi.fn(async (fn) => (typeof fn === "function" ? fn(prisma) : Promise.all(fn))),
      },
      authenticate: { admin: vi.fn() },
      publishProductWithRetry: vi.fn(async (_g, productId) => ({ productId, ok: true })),
      readMutationResult: vi.fn(async () => ({ ok: true })),
      graphql: vi.fn(async () => ({ json: async () => ({ data: {} }) })),
    }),
  );

  vi.mock("../../app/db.server.js", () => ({ default: prisma }));
  vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));
  vi.mock("../../app/utils/adminGraphql.server.js", () => ({
    publishProductWithRetry,
    readMutationResult,
  }));
  vi.mock("../../app/utils/seo.server.js", () => ({
    ensureFaqMetafieldDefinition: vi.fn(async (shop, fn) => fn?.()),
    buildFaqSchemaMetafield: vi.fn(() => null),
  }));
  vi.mock("../../app/utils/logger.server.js", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "s.myshopify.com" }, admin: { graphql } });
    prisma.generatedContent.findMany.mockResolvedValue([
      { productId: "gid://shopify/Product/1", productTitle: "P1", contentType: "description", generatedContent: "x" },
    ]);
  });

  it("an unknown actionType is still refused", async () => {
    const { action } = await import("../../app/routes/app.review.jsx");
    const res = await action({
      request: new Request("https://app.test/app/review", {
        method: "POST",
        body: new URLSearchParams({ actionType: "nope" }),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("saveEdit refuses a content type it does not recognise", async () => {
    // The row is addressed by (shop, productId, contentType). An unchecked
    // contentType would let a caller create rows outside the known set.
    const { action } = await import("../../app/routes/app.review.jsx");
    const res = await action({
      request: new Request("https://app.test/app/review", {
        method: "POST",
        body: new URLSearchParams({
          actionType: "saveEdit",
          productId: "gid://shopify/Product/1",
          contentType: "arbitrary",
          value: "x",
        }),
      }),
    });
    expect(res.status).toBe(400);
    expect(prisma.generatedContent.upsert).not.toHaveBeenCalled();
  });
});
