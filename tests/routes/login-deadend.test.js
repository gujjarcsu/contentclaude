/**
 * App Store rejection 2.1.1 — the in-admin login dead-end.
 *
 * The "Shop domain" login form must be UNREACHABLE from inside the Shopify
 * admin. Any embedded request (host / embedded=1 / iframe dest) must be sent
 * back into /app to re-authenticate silently — never answered with the form.
 * These tests lock every server entry point that could render it.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../../app/shopify.server", () => ({
  login: vi.fn(async () => ({})),
  authenticate: { admin: vi.fn() },
  addDocumentResponseHeaders: (headers, _embedded, shop) => {
    headers.set("Content-Security-Policy", `frame-ancestors https://${shop || "admin.shopify.com"};`);
  },
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));

const b64url = (s) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const HOST = b64url("contentpilot-dev2.myshopify.com/admin");

// A loader may THROW a redirect Response, RETURN a Response (the App Bridge
// re-embed page), or RETURN data (the form). Capture all three uniformly.
async function run(loader, url, headers) {
  const done = async (res, threw) => {
    if (res instanceof Response) {
      const body = await res.text().catch(() => "");
      return { threw, isResponse: true, status: res.status, location: res.headers.get("location"), body };
    }
    return { threw, isResponse: false, data: res };
  };
  try {
    return await done(await loader({ request: new Request(url, headers ? { headers } : undefined) }), false);
  } catch (e) {
    if (e instanceof Response) return done(e, true);
    throw e;
  }
}
const isReembed = (r) => r.isResponse && r.status === 200 && /app-bridge\.js/.test(r.body) && /\/app/.test(r.body);

describe("2.1.1 in-admin login dead-end", () => {
  it("_index: embedded (host, NO shop) → /app with shop derived from host, never /auth/login", async () => {
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const r = await run(loader, `https://app.test/?host=${HOST}&embedded=1`);
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/app\?/);
    expect(r.location).toContain("shop=contentpilot-dev2.myshopify.com");
    expect(r.location).not.toContain("/auth/login");
  });

  it("_index: no shop + no host (external visit) → /auth/login", async () => {
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const r = await run(loader, "https://app.test/");
    expect(r.location).toBe("/auth/login");
  });

  it("_index: shop present → /app", async () => {
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const r = await run(loader, "https://app.test/?shop=demo.myshopify.com&host=abc");
    expect(r.location).toMatch(/^\/app\?/);
    expect(r.location).toContain("shop=demo.myshopify.com");
  });

  it("_index: iframe load with NO shop AND NO host → /reembed (App Bridge recovery, no loop/form)", async () => {
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const r = await run(loader, "https://app.test/", { "sec-fetch-dest": "iframe" });
    expect(r.threw).toBe(true);
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/reembed/);
  });

  it("reembed route (host present) → App Bridge redirect to the fully-qualified ADMIN url", async () => {
    const { loader } = await import("../../app/routes/reembed.jsx");
    const r = await run(loader, `https://app.test/reembed?host=${HOST}&embedded=1`);
    expect(isReembed(r)).toBe(true);
    expect(r.body).not.toMatch(/Shop domain|name="shop"/i);
    expect(r.body).toContain("admin.shopify.com/store/contentpilot-dev2/apps/navaal-seo-geo-content/app");
  });

  it("reembed route with NO host/shop but a persisted navaal_shop cookie → admin url (host-less backstop)", async () => {
    const { loader } = await import("../../app/routes/reembed.jsx");
    const r = await run(loader, "https://app.test/reembed", { cookie: "navaal_shop=demo.myshopify.com" });
    expect(isReembed(r)).toBe(true);
    expect(r.body).toContain("admin.shopify.com/store/demo/apps/navaal-seo-geo-content/app");
    expect(r.body).not.toMatch(/Shop domain|name="shop"/i);
  });

  it("auth.login: embedded (host) → redirects to /reembed (App Bridge recovery), NEVER the form", async () => {
    const { loader } = await import("../../app/routes/auth.login/route.jsx");
    const r = await run(loader, `https://app.test/auth/login?host=${HOST}&embedded=1`);
    expect(r.threw).toBe(true);
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/reembed/);
    expect(r.location).toContain(`host=${HOST}`);
  });

  it("auth.login: iframe document load with NO params (validateShopAndHostParams dead-end) → /reembed, not the form", async () => {
    const { loader } = await import("../../app/routes/auth.login/route.jsx");
    const r = await run(loader, "https://app.test/auth/login", { "sec-fetch-dest": "iframe" });
    expect(r.threw).toBe(true);
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/reembed/);
  });

  it("auth.login: genuine external visit (no embedded context) still renders the form", async () => {
    const { loader } = await import("../../app/routes/auth.login/route.jsx");
    const r = await run(loader, "https://app.test/auth/login");
    // No redirect thrown → the loader returns data for the form (external only).
    expect(r.threw).toBe(false);
    expect(r.data).toHaveProperty("errors");
  });

  it("shopFromHost decodes both host encodings; rejects garbage", async () => {
    const { shopFromHost } = await import("../../app/utils/embedded.server.js");
    expect(shopFromHost(HOST)).toBe("contentpilot-dev2.myshopify.com");
    expect(shopFromHost(b64url("admin.shopify.com/store/contentpilot-dev2"))).toBe("contentpilot-dev2.myshopify.com");
    expect(shopFromHost("!!notbase64!!")).toBeNull();
    expect(shopFromHost(null)).toBeNull();
  });

  it("isEmbeddedRequest detects host, embedded=1, and iframe dest", async () => {
    const { isEmbeddedRequest } = await import("../../app/utils/embedded.server.js");
    expect(isEmbeddedRequest(new Request("https://a.test/?host=x"))).toBe(true);
    expect(isEmbeddedRequest(new Request("https://a.test/?embedded=1"))).toBe(true);
    expect(isEmbeddedRequest(new Request("https://a.test/", { headers: { "sec-fetch-dest": "iframe" } }))).toBe(true);
    expect(isEmbeddedRequest(new Request("https://a.test/"))).toBe(false);
  });

  // Source guard: neither entry point may render the form without first gating
  // on the embedded check (this is exactly what regressed in 2.1.1).
  it("source guard: _index and auth.login gate the form behind isEmbeddedRequest", () => {
    expect(readFileSync("app/routes/_index/route.jsx", "utf8")).toContain("isEmbeddedRequest");
    expect(readFileSync("app/routes/auth.login/route.jsx", "utf8")).toContain("isEmbeddedRequest");
  });
});
