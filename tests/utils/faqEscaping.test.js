/**
 * P0 / A5 — the two locks on stored FAQ content, and the question the brief asked.
 *
 * THE QUESTION: does Shopify's Liquid `| json` filter escape `</`?
 *
 * **The honest answer is that this codebase does not depend on knowing**, and
 * that is the right posture rather than an evasion. `faq_schema.liquid` renders
 * `<script type="application/ld+json">{{ ...value | json }}</script>`. If `json`
 * does not escape `<`, a `</script>` inside any FAQ string closes the tag early
 * and everything after it is parsed as HTML — stored XSS on a merchant's
 * storefront. Testing Shopify's filter would tell us what it does TODAY, on one
 * platform version, from outside. The defence therefore sits upstream, where we
 * control it: `toPlainText` removes angle brackets outright, so there is
 * nothing left to close the tag with, whatever the filter does.
 *
 * That is what these tests pin. They are about OUR guarantee, not Shopify's.
 *
 * THE TIMELINE, which is why this file exists rather than a comment:
 *
 *   894e34f  2026-07-02  FAQ metafields written on every publish path — and
 *                        `faqToJsonLd` did NOT sanitise
 *   7942c30  2026-09-09  toPlainText added to faqToJsonLd, AND `| escape` added
 *                        to faq_visible.liquid
 *   p0-xss-  2026-09-14  the escaping actually REACHES storefronts, because an
 *   f505584              app version had not been released since 9 Sep
 *
 * So content written across a 69-day window was unsanitised, and was rendered
 * unescaped for all of it. `scripts/xss-exposure-diag.mjs` measures what is
 * still stored from that window.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { toPlainText } from "../../app/utils/text.js";
import { faqToJsonLd, buildFaqSchemaMetafield } from "../../app/utils/seo.server.js";

const VISIBLE = readFileSync("extensions/geo-schema/blocks/faq_visible.liquid", "utf8");
const SCHEMA = readFileSync("extensions/geo-schema/blocks/faq_schema.liquid", "utf8");

/** Payloads that would each be live HTML if either lock failed. */
const HOSTILE = [
  "</script><img src=x onerror=alert(1)>",
  "<script>alert(document.cookie)</script>",
  "<img src=x onerror=alert(1)>",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  "&#60;script&#62;alert(1)&#60;/script&#62;",
  "<<b>script>alert(1)<</b>/script>",
  "<svg/onload=alert(1)>",
  '<a href="javascript:alert(1)">x</a>',
];

describe("LOCK 1 — toPlainText leaves nothing that can open or close a tag", () => {
  it.each(HOSTILE)("neutralises %s", (payload) => {
    const clean = toPlainText(payload);
    expect(clean).not.toMatch(/[<>]/);
    expect(clean.toLowerCase()).not.toContain("</script");
    expect(clean.toLowerCase()).not.toContain("<script");
  });

  it("decodes entities BEFORE stripping, so &lt;script&gt; cannot survive as markup", () => {
    // Stripping first and decoding second would turn "&lt;script&gt;" into
    // "<script>" AFTER the stripper had already run — a classic ordering bug.
    expect(toPlainText("&lt;script&gt;alert(1)&lt;/script&gt;")).not.toMatch(/[<>]/);
  });

  it("re-strips until stable, so nesting does not reassemble a tag", () => {
    // "<<b>script>" leaves "<script>" after ONE pass.
    expect(toPlainText("<<b>script>alert(1)<</b>/script>")).not.toMatch(/[<>]/);
  });

  it("keeps the readable text — a sanitiser that destroys content is not usable", () => {
    expect(toPlainText("Is it <b>waterproof</b>?")).toBe("Is it waterproof?");
  });
});

describe("LOCK 1 is actually APPLIED on the path that writes the metafield", () => {
  const faqText = "Q: </script><img src=x onerror=alert(1)>\nA: <script>alert(1)</script> Yes.";

  it("faqToJsonLd sanitises BOTH the question and the answer", () => {
    // Sanitising one and not the other is the shape this would most plausibly
    // regress into, so both are asserted separately.
    const jsonLd = faqToJsonLd(faqText);
    expect(jsonLd).not.toBeNull();
    for (const qa of jsonLd.mainEntity) {
      expect(qa.name, "question is unsanitised").not.toMatch(/[<>]/);
      expect(qa.acceptedAnswer.text, "answer is unsanitised").not.toMatch(/[<>]/);
    }
  });

  it("the SERIALISED metafield contains no angle bracket at all", () => {
    // This is the exact string handed to Shopify and later printed inside
    // <script type="application/ld+json">. If it cannot contain "<", the
    // behaviour of Liquid's `json` filter cannot matter.
    const mf = buildFaqSchemaMetafield("gid://shopify/Product/1", faqText);
    expect(mf).not.toBeNull();
    expect(mf.value).not.toMatch(/[<>]/);
    expect(mf.value.toLowerCase()).not.toContain("script");
  });
});

describe("LOCK 2 — the theme block escapes every interpolation it controls", () => {
  /** Every {{ ... }} in a Liquid file. */
  const interpolations = (src) => src.match(/\{\{[^}]*\}\}/g) ?? [];

  it("faq_visible.liquid escapes the AI-generated fields", () => {
    const body = VISIBLE.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");
    for (const field of ["qa.name", "qa.acceptedAnswer.text", "block.settings.heading"]) {
      const tag = interpolations(body).find((t) => t.includes(field));
      expect(tag, `${field} is not interpolated at all — did the block change?`).toBeTruthy();
      expect(tag, `${field} is NOT escaped — this is the 7942c30 defect`).toMatch(/\|\s*escape/);
    }
  });

  it("leaves shopify_attributes unescaped, which is correct and deliberate", () => {
    // It emits HTML attributes. Escaping it would break the theme editor, and
    // it is generated by Shopify, not by us or by a model.
    const body = VISIBLE.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");
    const tag = interpolations(body).find((t) => t.includes("shopify_attributes"));
    expect(tag).toBeTruthy();
    expect(tag).not.toMatch(/\|\s*escape/);
  });

  it("no interpolation outside that pair is left unescaped", () => {
    const body = VISIBLE.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");
    const unescaped = interpolations(body).filter(
      (t) => !/\|\s*escape/.test(t) && !t.includes("shopify_attributes"),
    );
    expect(unescaped, `unescaped interpolations: ${unescaped.join(" ")}`).toEqual([]);
  });

  it("the JSON-LD block still relies on lock 1, and says so", () => {
    // If someone ever removes the upstream sanitisation, this comment is the
    // thing that explains why that is not a cosmetic change.
    expect(SCHEMA).toMatch(/json/);
    const seo = readFileSync("app/utils/seo.server.js", "utf8");
    expect(seo).toMatch(/json.*filter escapes for JSON, not for HTML/s);
  });
});

describe("the extension uid is stable, because the theme deep link targets it", () => {
  it("has not changed", () => {
    const toml = readFileSync("extensions/geo-schema/shopify.extension.toml", "utf8");
    expect(toml).toMatch(/uid = "6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4"/);
  });
});
