/**
 * Phase 4 item 4.2 — post-publish verification.
 *
 * The difference between "we think it is live" and "it is live". A publish used
 * to be called successful when Shopify's mutation returned no errors, which
 * proves the request was ACCEPTED — not that the field now holds what we sent.
 *
 * The way this feature fails is not by crashing. It fails by passing. A
 * comparison that is too lenient, or that treats "nothing to compare" as
 * agreement, would report every publish verified and be indistinguishable from
 * not having the feature at all — the fourth false-green in this project, and
 * it would look exactly as convincing as the first three.
 *
 * So the tests below are mostly about the NEGATIVE direction: what must be
 * reported as unverified, and what must not be waved through.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const { verifyProductUpdate, verifyMetafield, describeMismatches, textOf } =
  await import("../../app/utils/publishVerify.js");

const sent = (over = {}) => ({
  id: "gid://shopify/Product/1",
  descriptionHtml: "<p>A good description of the board.</p>",
  seo: { title: "The Board | Shop", description: "A good description of the board." },
  ...over,
});
const returned = (over = {}) => ({
  id: "gid://shopify/Product/1",
  descriptionHtml: "<p>A good description of the board.</p>",
  seo: { title: "The Board | Shop", description: "A good description of the board." },
  ...over,
});

describe("a clean publish verifies", () => {
  it("identical values pass", () => {
    const v = verifyProductUpdate(sent(), returned());
    expect(v.verified).toBe(true);
    expect(v.mismatches).toEqual([]);
    expect(v.note).toBeNull();
  });

  it("markup Shopify rewrote is not a mismatch — the words are what matter", () => {
    // Shopify re-serialises HTML. Comparing markup strictly would flag almost
    // every publish, the merchant would learn to ignore the warning, and the
    // feature would be worse than not having it.
    const v = verifyProductUpdate(
      sent({ descriptionHtml: "<p>A good  description of the board.</p>" }),
      returned({ descriptionHtml: '<div class="x">A good description of the board.</div>' }),
    );
    expect(v.verified).toBe(true);
  });

  it("entities and <br> are compared as the text they render to", () => {
    const v = verifyProductUpdate(
      sent({ descriptionHtml: "Fast &amp; light<br>Ready to ride" }),
      returned({ descriptionHtml: "<p>Fast &amp; light Ready to ride</p>" }),
    );
    expect(v.verified).toBe(true);
  });

  it("only checks what was actually sent", () => {
    // Publishing just a meta title must not report the description unverified.
    const v = verifyProductUpdate(
      { id: "gid://shopify/Product/1", seo: { title: "Just the title" } },
      { id: "gid://shopify/Product/1", seo: { title: "Just the title" } },
    );
    expect(v.verified).toBe(true);
    expect(v.checked).toEqual(["seoTitle"]);
  });
});

describe("what must NOT be waved through", () => {
  it("a truncated page title is a mismatch, and says so in words", () => {
    // The commonest real one: Shopify shortens long titles.
    const v = verifyProductUpdate(
      sent({ seo: { title: "A very long page title that Shopify will shorten", description: "d" } }),
      returned({ seo: { title: "A very long page title that Shopif", description: "d" } }),
    );
    expect(v.verified).toBe(false);
    expect(v.note).toMatch(/shortened the page title/i);
  });

  it("a description that came back empty is a mismatch", () => {
    const v = verifyProductUpdate(sent(), returned({ descriptionHtml: "" }));
    expect(v.verified).toBe(false);
    expect(v.note).toMatch(/came back empty/i);
  });

  it("a description with words missing is a mismatch", () => {
    const v = verifyProductUpdate(
      sent({ descriptionHtml: "<p>Alpha beta gamma delta</p>" }),
      returned({ descriptionHtml: "<p>Alpha beta</p>" }),
    );
    expect(v.verified).toBe(false);
    expect(v.note).toMatch(/shorter description/i);
  });

  it("a field Shopify did not return at all is UNVERIFIED, not verified", () => {
    // The whole trap. `undefined === undefined` is true, and a naive
    // comparison would call a field nobody looked at "verified".
    const v = verifyProductUpdate(
      sent(),
      returned({ seo: { description: "A good description of the board." } }),
    );
    expect(v.verified).toBe(false);
    expect(v.mismatches.some((m) => m.field === "seoTitle")).toBe(true);
    expect(v.note).toMatch(/could not be confirmed/i);
  });

  it("no returned product at all is UNVERIFIED", () => {
    for (const r of [null, undefined]) {
      const v = verifyProductUpdate(sent(), r);
      expect(v.verified).toBe(false);
      expect(v.note).toMatch(/did not return the updated product/i);
    }
  });

  it("nothing sent is UNVERIFIED, not vacuously true", () => {
    // "We verified all zero fields" is the shape of a decorative check.
    const v = verifyProductUpdate({ id: "gid://shopify/Product/1" }, returned());
    expect(v.verified).toBe(false);
    expect(v.note).toMatch(/nothing to verify/i);
  });

  it("an empty string is treated as nothing sent, not as a value to match", () => {
    const v = verifyProductUpdate({ id: "x", descriptionHtml: "" }, returned());
    expect(v.verified).toBe(false);
    expect(v.note).toMatch(/nothing to verify/i);
  });

  it("a completely different value is a mismatch", () => {
    const v = verifyProductUpdate(
      sent(),
      returned({ descriptionHtml: "<p>Someone else's copy entirely.</p>" }),
    );
    expect(v.verified).toBe(false);
  });
});

describe("the merchant-facing reason", () => {
  it("names no fields, codes or internals", () => {
    const v = verifyProductUpdate(
      sent({ seo: { title: "A long title Shopify will cut", description: "d" } }),
      returned({ seo: { title: "A long title", description: "d" } }),
    );
    expect(v.note).not.toMatch(/seoTitle|descriptionHtml|productUpdate|null|undefined/);
  });

  it("reads as a sentence, capitalised", () => {
    const v = verifyProductUpdate(sent(), returned({ descriptionHtml: "" }));
    expect(v.note[0]).toBe(v.note[0].toUpperCase());
  });

  it("summarises rather than listing when several fields differ", () => {
    const note = describeMismatches([
      { field: "a", label: "description", why: "x" },
      { field: "b", label: "page title", why: "y" },
      { field: "c", label: "search description", why: "z" },
    ]);
    expect(note).toMatch(/description, page title and search description/);
    expect(note).toMatch(/Open the product to compare/);
  });

  it("is null when there is nothing wrong", () => {
    expect(describeMismatches([])).toBeNull();
    expect(describeMismatches(null)).toBeNull();
  });
});

describe("textOf", () => {
  it("collapses whitespace and strips tags", () => {
    expect(textOf("<p>a   b</p>\n<p>c</p>")).toBe("a b c");
  });
  it("survives null and undefined", () => {
    expect(textOf(null)).toBe("");
    expect(textOf(undefined)).toBe("");
  });
});

describe("metafield verification", () => {
  it("passes on an exact match", () => {
    expect(verifyMetafield('{"a":1}', { value: '{"a":1}' }).verified).toBe(true);
  });
  it("is unverified when Shopify returned nothing", () => {
    const v = verifyMetafield('{"a":1}', {});
    expect(v.verified).toBe(false);
    expect(v.note).toMatch(/could not be confirmed/i);
  });
  it("is unverified when the value differs", () => {
    expect(verifyMetafield('{"a":1}', { value: '{"a":2}' }).verified).toBe(false);
  });
  it("nothing sent is not a pass", () => {
    expect(verifyMetafield("", { value: "" }).verified).toBe(false);
  });
});

describe("the cost of this feature, pinned", () => {
  const src = readFileSync("app/utils/adminGraphql.server.js", "utf8");

  it("verifies from the mutation's OWN response — no second Shopify read", () => {
    // A bulk run over 5,000 products that issued a read per publish would
    // double its API calls and turn a trust feature into a rate-limit incident.
    expect(src).toMatch(/productUpdate\(product: \$product\)[\s\S]*?descriptionHtml/);
    expect(src).toMatch(/seo \{ title description \}/);
    // No extra query/fetch in the publish path.
    const publishFn = src.slice(src.indexOf("export async function publishProductWithRetry"));
    const graphqlCalls = (publishFn.match(/await graphql\(/g) || []).length;
    expect(graphqlCalls, "publish must issue exactly one Shopify request").toBe(1);
  });

  it("an unverified publish is still ok:true — it IS live", () => {
    // Reporting it as a failure would put the row back to draft and the
    // merchant would republish content that is already on their storefront.
    const publishFn = src.slice(src.indexOf("export async function publishProductWithRetry"));
    expect(publishFn).toMatch(/ok: true,\s*\n\s*verified: verdict\.verified/);
  });
});
