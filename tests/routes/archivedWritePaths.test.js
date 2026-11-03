/**
 * P5.1 — the WRITE paths, which are the ones that cost money.
 *
 * A1 in Phase 4 scoped the three `products(...)` READ calls on the Products
 * page through `LIST_SCOPE_QUERY`, proved the counts on the live screen, and
 * reported the item closed. It was half the job: `app.optimize.jsx` walked the
 * catalogue with **no `query` argument at all**, so bulk optimize enqueued
 * generations against archived products.
 *
 * Under the pricing that shipped in the same phase that is a merchant's credits
 * at 2.00¢ each, spent on products they deliberately took out of their store.
 *
 * These assertions are on the SOURCE of the write paths rather than on a mock,
 * because the defect was an absent argument — and a mock of a call that is
 * never made cannot catch a call that is made wrongly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { LIST_SCOPE_QUERY } from "../../app/utils/candidates.js";

const OPTIMIZE = readFileSync("app/routes/app.optimize.jsx", "utf8");
const CREATE_HOOK = readFileSync("app/routes/webhooks.products.create.jsx", "utf8");
const PRODUCTS = readFileSync("app/routes/app.products.jsx", "utf8");

/**
 * Comments stripped before every "the source must not say X" assertion.
 *
 * BLOCK comments included, and that is not optional: the line-prefix filter
 * alone misses a JSX comment, which opens `{/*` rather than `/*`. It caught me
 * immediately — the comment in `app._index.jsx` EXPLAINING why the label no
 * longer says "Live on your storefront" contains the phrase, so the guard fired
 * on its own rationale. A file is not less correct for naming the thing it
 * refuses to do.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
}

describe("bulk optimize — the path that spent the credits", () => {
  it("passes a scope to the catalogue walk", () => {
    // The whole defect in one assertion: the call had `shop`, `label` and
    // `select`, and no `query`. `enumerateProductIds` defaults `query` to null,
    // and `products(query: null)` returns archived products.
    const call = code(OPTIMIZE).match(/enumerateProductIds\([\s\S]*?\n {2}\}\);/);
    expect(call, "enumerateProductIds call not found").not.toBeNull();
    expect(call[0]).toMatch(/query:\s*LIST_SCOPE_QUERY/);
  });

  it("uses the shared constant, never a literal", () => {
    // Shopify's search reference: "If you specify an invalid field, then the
    // query is IGNORED and all results are returned." A typo does not error —
    // the archived products simply come back and the charging resumes.
    expect(code(OPTIMIZE)).not.toMatch(/query:\s*["'`]-?status:/);
    expect(code(OPTIMIZE)).toMatch(/LIST_SCOPE_QUERY.*candidates\.server\.js|candidates\.server\.js.*LIST_SCOPE_QUERY/s);
  });

  it("the constant still excludes archived and nothing else", () => {
    // Draft products are IN scope on purpose: a merchant preparing a launch
    // wants their copy written before they publish.
    expect(LIST_SCOPE_QUERY).toBe("-status:archived");
  });
});

describe("autopilot — the path that spends without a click", () => {
  it("skips a product created as archived", () => {
    // products/create fires on import as well as on a manual add, and a CSV
    // import can create archived products in bulk. This file's own header warns
    // that "a catalogue import fires it thousands of times in a burst"; every
    // other bound in it is about how MUCH is spent, not whether it should be.
    expect(code(CREATE_HOOK)).toMatch(/status[\s\S]{0,60}archived/i);
    const guard = code(CREATE_HOOK).match(/if \(String\(payload\?\.status[\s\S]*?\n {2}\}/);
    expect(guard, "no archived guard on the create webhook").not.toBeNull();
  });

  it("reads the payload rather than asking Shopify again", () => {
    // A second API call inside a webhook handler is a failure mode we do not
    // need: the payload is authoritative for the product as created.
    expect(code(CREATE_HOOK)).toMatch(/payload\?\.status/);
  });

  it("answers 200, because a skip is not a delivery failure", () => {
    // Returning anything else would make Shopify retry, and retries on a
    // catalogue import are how a burst becomes a storm.
    expect(code(CREATE_HOOK)).toMatch(/Archived product[\s\S]{0,80}status: 200/);
  });
});

describe('the Products subtitle no longer says "30 live" about 15 products', () => {
  it('does not call the published count "live"', () => {
    // Read on the live store: "32 products in your catalog · 15 active and
    // draft products published to your online store · 30 live". Thirty of
    // fifteen. The count is a record of what THIS APP has published, taken
    // from our own table, and it asks Shopify nothing — so it keeps counting a
    // product after the merchant archives or deletes it. Correct as a record,
    // false as a claim about the storefront.
    // D6: the sentence is a t() key with {published} where it used to be a template with ${publishedProducts}
    expect(code(PRODUCTS)).not.toMatch(/\{published\} live|\$\{publishedProducts\} live/);
    expect(code(PRODUCTS)).toMatch(/\{published\} with content published/);
  });

  it("the stat card keeps the number, because the number is right", () => {
    // "AI Content Published: 30" is an accurate statement about our own work.
    // Only the word beside the catalogue total was the lie.
    expect(code(PRODUCTS)).toMatch(/AI Content Published/);
    expect(code(PRODUCTS)).toMatch(/\{publishedProducts\}/);
  });

  it("NO screen calls that count 'live' or 'on your storefront'", () => {
    // THE CLASS, NOT THE INSTANCE — and I needed the live screen to learn it.
    //
    // Having fixed the Products subtitle I read Home and found the same false
    // claim on the FIRST screen a merchant sees: a stat card labelled "Live on
    // your storefront: 30" above "14 active and draft products published to
    // your online store". Same number, same lie, one file over, and the test I
    // had just written guarded only app.products.jsx.
    //
    // The count comes from OUR table and asks Shopify nothing, so no screen may
    // describe it as a fact about the merchant's storefront.
    const walk = (d) =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
      );
    const offenders = [];
    for (const f of walk("app").filter((f) => /\.jsx$/.test(f))) {
      const src = code(readFileSync(f, "utf8"));
      const countsOurRows = /\b(publishedProducts|generatedCount)\b/.test(src);
      if (!countsOurRows) continue;
      if (/live on your storefront/i.test(src)) offenders.push(`${f} (Live on your storefront)`);
      if (/(\$\{(publishedProducts|generatedCount)\}|\{(published|generatedCount)\}) live\b/.test(src)) offenders.push(`${f} (N live)`);
    }
    expect(offenders, `describe our own rows as the merchant's storefront: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("the diagnostic that answers the question rather than reasoning about it", () => {
  const DIAG = readFileSync("scripts/archived-generations-diag.mjs", "utf8");

  it("is read-only", () => {
    // Never write to a merchant's store to investigate our own bug.
    expect(DIAG).not.toMatch(/prisma\.\w+\.(create|update|delete|upsert)/);
    expect(DIAG).not.toMatch(/mutation\s/);
  });

  it("prints no product id and no shop domain", () => {
    // Same rule as paid-plans-diag.mjs: this output goes into a CI log.
    expect(DIAG).toMatch(/replace\(\/\\\.myshopify\\\.com\$\/, ""\)/);
    expect(DIAG).not.toMatch(/console\.log\([^)]*productId/);
  });

  it("reports an unreachable shop rather than counting it as zero", () => {
    // An uninstalled shop whose token will not refresh is an UNKNOWN. Folding
    // it into the total as a zero is how a reassuring number gets manufactured.
    expect(DIAG).toMatch(/shopsUnreachable/);
    expect(DIAG).toMatch(/reachable: false/);
  });

  it("says when a shop's archived list was truncated", () => {
    expect(DIAG).toMatch(/archivedTruncated/);
  });
});
