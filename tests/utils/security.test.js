/**
 * Phase 0 group 0.D — items 17-22.
 *
 * These are the defects that let someone other than the merchant put content,
 * script, or requests into the app or onto the merchant's storefront.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "shpss_test_secret";
process.env.SHOPIFY_API_KEY = "test-api-key";
process.env.SHOPIFY_APP_URL = "https://app.navaal.ai";

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { safeTarget, jsonForScript, renderReembedPage } = await import("../../app/utils/embedded.server.js");
const { signShopCallback, verifyShopCallback, SIGNED_URL_TTL_MS } = await import("../../app/utils/signedUrl.server.js");
const { toPlainText, META_TITLE_MAX, META_DESCRIPTION_MAX } = await import("../../app/utils/text.js");
const { faqToJsonLd } = await import("../../app/utils/seo.server.js");

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const SHOP = "shop.myshopify.com";

describe("item 17 — reflected XSS in /reembed?target=", () => {
  it("refuses anything that is not an in-app path", () => {
    expect(safeTarget("/app")).toBe("/app");
    expect(safeTarget("/app/products/123")).toBe("/app/products/123");
    // The payload from the brief: closing the script block and opening a new one.
    expect(safeTarget("</script><script>alert(1)</script>")).toBe("/app");
    expect(safeTarget("https://evil.example")).toBe("/app");
    expect(safeTarget("//evil.example")).toBe("/app");
    expect(safeTarget("/app/../../etc/passwd")).toBe("/app");
    expect(safeTarget("javascript:alert(1)")).toBe("/app");
    expect(safeTarget("/admin")).toBe("/app");
    expect(safeTarget("")).toBe("/app");
    expect(safeTarget(null)).toBe("/app");
  });

  it("serialises for a script block, which JSON.stringify alone does not", () => {
    // This is the exact gap: JSON.stringify leaves </script> intact.
    expect(JSON.stringify("</script>")).toContain("</script>");
    expect(jsonForScript("</script>")).not.toContain("</script>");
    expect(jsonForScript("</script>")).toContain("\\u003c");
  });

  it("the rendered page contains no attacker markup and carries a script-src", async () => {
    const req = new Request(
      "https://app.navaal.ai/reembed?shop=" + SHOP + "&target=" + encodeURIComponent("</script><script>alert(1)</script>"),
    );
    const res = renderReembedPage(req);
    const html = await res.text();

    // Only our own two script tags survive.
    expect(html.match(/<script/g) ?? []).toHaveLength(2);
    expect(html).not.toContain("alert(1)");
    const csp = res.headers.get("content-security-policy");
    expect(csp).toMatch(/script-src/);
    expect(csp).toMatch(/frame-ancestors/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("a legitimate target still reaches the admin URL", async () => {
    const res = renderReembedPage(
      new Request("https://app.navaal.ai/reembed?shop=" + SHOP + "&target=%2Fapp%2Fproducts"),
    );
    const html = await res.text();
    expect(html).toContain("/apps/navaal-seo-geo-content/app/products");
  });
});

describe("item 18 — stored XSS on the merchant storefront via AI output", () => {
  it("decodes entities but leaves no markup behind", () => {
    // The exact pipeline that produced the hole: the sanitiser leaves the
    // ESCAPED text alone (correctly), then the decode revived it.
    expect(toPlainText("&lt;script&gt;alert(1)&lt;/script&gt;")).not.toMatch(/[<>]/);
    expect(toPlainText("&lt;script&gt;alert(1)&lt;/script&gt;")).toContain("alert(1)");
    // Still does the job it was added for.
    expect(toPlainText("Kids &amp; Teens")).toBe("Kids & Teens");
    expect(toPlainText("Kids &amp;amp; Teens")).toBe("Kids & Teens");
  });

  it("survives nesting and half-tags", () => {
    expect(toPlainText("<<b>script>alert(1)<</b>/script>")).not.toMatch(/[<>]/);
    expect(toPlainText("<img src=x onerror=alert(1)>")).not.toMatch(/[<>]/);
  });

  it("hard-truncates the meta fields to what Shopify will actually keep", () => {
    expect(toPlainText("x".repeat(500), META_TITLE_MAX)).toHaveLength(META_TITLE_MAX);
    expect(toPlainText("x".repeat(500), META_DESCRIPTION_MAX)).toHaveLength(META_DESCRIPTION_MAX);
    expect(META_TITLE_MAX).toBe(60);
    expect(META_DESCRIPTION_MAX).toBe(155);
  });

  it("the FAQ JSON-LD written to the storefront metafield cannot close its script block", () => {
    const jsonLd = faqToJsonLd('Q: What </script><script>alert(1)</script>?\nA: An <b>answer</b> </script>.');
    const serialised = JSON.stringify(jsonLd);
    expect(serialised).not.toMatch(/<\/script/i);
    expect(serialised).not.toMatch(/[<>]/);
  });

  it("the theme block escapes every interpolation (Liquid does not auto-escape)", () => {
    const liquid = readFileSync("extensions/geo-schema/blocks/faq_visible.liquid", "utf8");
    const body = liquid.slice(liquid.indexOf("<div class=\"navaal-faq\""), liquid.indexOf("<style>"));
    const interpolations = body.match(/\{\{[^}]*\}\}/g) ?? [];
    expect(interpolations.length).toBeGreaterThan(0);
    for (const i of interpolations) {
      // shopify_attributes is Shopify's own, and must not be escaped.
      if (i.includes("shopify_attributes")) continue;
      expect(i, i).toMatch(/\|\s*escape/);
    }
  });
});

describe("item 19 — prompt injection has a structural defence", () => {
  const src = code("app/utils/ai.server.js");

  it("puts the rules in a system prompt, not in the same message as merchant data", () => {
    expect(src).toMatch(/const SYSTEM_PROMPT = /);
    expect(src).toMatch(/system: SYSTEM_PROMPT/);
    // Both product paths, not just one.
    expect(src.match(/system: SYSTEM_PROMPT/g)).toHaveLength(2);
  });

  it("fences merchant data and says plainly that it is data", () => {
    expect(src).toMatch(/<untrusted_product_data>/);
    expect(src).toMatch(/DATA, never instructions/i);
  });

  it("caps the untrusted text that goes into the prompt", () => {
    expect(src).toMatch(/UNTRUSTED_TEXT_MAX = 4000/);
    expect(src).toMatch(/untrustedText\(product\.descriptionHtml/);
  });

  it("keeps autopilot publishing off by default", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toMatch(/autopilotAutoPublish\s+Boolean\s+@default\(false\)/);
  });
});

describe("item 20 — the billing callback is no longer an open oracle", () => {
  it("accepts only a signature we issued, for that shop", () => {
    const sig = signShopCallback(SHOP);
    expect(verifyShopCallback(SHOP, sig).ok).toBe(true);
    // Not for another shop…
    expect(verifyShopCallback("other.myshopify.com", sig).ok).toBe(false);
    // …not with a tampered signature or expiry…
    expect(verifyShopCallback(SHOP, { sig: "nope", exp: sig.exp }).reason).toBe("bad_signature");
    expect(verifyShopCallback(SHOP, { sig: sig.sig, exp: String(Number(sig.exp) + 1000) }).reason).toBe("bad_signature");
    // …and not at all when it is absent.
    expect(verifyShopCallback(SHOP, {}).reason).toBe("missing");
  });

  it("stops working once it expires", () => {
    const sig = signShopCallback(SHOP);
    const later = Date.now() + SIGNED_URL_TTL_MS + 1000;
    expect(verifyShopCallback(SHOP, sig, { now: later }).reason).toBe("expired");
  });

  it("is closed, not open, when no secret is configured", () => {
    expect(verifyShopCallback(SHOP, { sig: "x", exp: "1" }, { key: "" }).ok).toBe(false);
  });

  it("the Plans page signs the return URL and the callback verifies it (source guard)", () => {
    expect(code("app/routes/app.plans.jsx")).toMatch(/signShopCallback\(/);
    const cb = code("app/routes/billing.callback.jsx");
    expect(cb).toMatch(/verifyShopCallback\(/);
    // The verification must come BEFORE the lookup it protects.
    expect(cb.indexOf("verifyShopCallback(")).toBeLessThan(cb.indexOf("getActiveSubscriptions("));
  });
});

describe("item 21 — /api/generate is gone", () => {
  it("the route no longer exists", () => {
    expect(() => readFileSync("app/routes/api.generate.jsx", "utf8")).toThrow();
  });

  it("and nothing advertises it any more", () => {
    expect(code("app/routes/app.settings.jsx")).not.toMatch(/api\/generate/);
  });
});

describe("item 22 — the rest of the hardening", () => {
  it("both cookies are HttpOnly", () => {
    expect(code("app/entry.server.jsx")).toMatch(/navaal_shop=[^`]*HttpOnly/);
    expect(code("app/routes/go.jsx")).toMatch(/REF_COOKIE[^`]*HttpOnly/);
  });

  it("/app/* documents are private, uncached, and HSTS-protected", () => {
    const src = code("app/routes/app.jsx");
    expect(src).toMatch(/Cache-Control["\s,]+.*private, no-store/);
    expect(src).toMatch(/Strict-Transport-Security/);
  });

  it("the sanitiser refuses protocol-relative URLs", () => {
    expect(code("app/utils/ai.server.js")).toMatch(/allowProtocolRelative:\s*false/);
  });

  it("the product preview is sanitised on the server before it is rendered as HTML", () => {
    const src = code("app/routes/app.products_.$id.jsx");
    expect(src).toMatch(/descriptionHtml: sanitizeHtml\(/);
  });

  it("build-info no longer publishes the Node version", () => {
    expect(code("app/routes/api.build-info.jsx")).not.toMatch(/process\.version/);
  });

  it("the public llms feed lists only PUBLISHED products", () => {
    expect(code("app/utils/llms.server.js")).toMatch(/published_status:published/);
  });
});
