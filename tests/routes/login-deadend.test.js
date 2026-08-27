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
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));

const b64url = (s) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const HOST = b64url("contentpilot-dev2.myshopify.com/admin");

// Loaders signal a redirect by THROWING a Response; capture it uniformly.
async function run(loader, url, headers) {
  try {
    const res = await loader({ request: new Request(url, headers ? { headers } : undefined) });
    return { threw: false, data: res };
  } catch (e) {
    if (e instanceof Response) return { threw: true, status: e.status, location: e.headers.get("location") };
    throw e;
  }
}

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

  it("auth.login: embedded (host) → redirects to /app, NEVER renders the form", async () => {
    const { loader } = await import("../../app/routes/auth.login/route.jsx");
    const r = await run(loader, `https://app.test/auth/login?host=${HOST}&embedded=1`);
    expect(r.threw).toBe(true);
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/app\?/);
    expect(r.location).toContain("shop=contentpilot-dev2.myshopify.com");
  });

  it("auth.login: iframe document load with no params → /app, not the form", async () => {
    const { loader } = await import("../../app/routes/auth.login/route.jsx");
    const r = await run(loader, "https://app.test/auth/login", { "sec-fetch-dest": "iframe" });
    expect(r.threw).toBe(true);
    expect(r.location).toMatch(/^\/app/);
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
