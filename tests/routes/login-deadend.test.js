/**
 * App Store rejection 2.1.1 — the in-admin login dead-end.
 *
 * The "Shop domain" login form must be UNREACHABLE from inside the Shopify
 * admin. Any embedded request (host / embedded=1 / iframe dest) must be sent
 * back into /app to re-authenticate silently — never answered with the form.
 * These tests lock every server entry point that could render it.
 */
import { describe, it, expect, vi } from "vitest";

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

  it("_index: bare / (no shop/host) → /reembed, NEVER /auth/login (app-title/home nav case)", async () => {
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const r = await run(loader, "https://app.test/");
    expect(r.threw).toBe(true);
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/reembed/);
    expect(r.location).not.toContain("/auth/login");
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

  it("auth.login: admin.shopify.com referer (no params) → /reembed, not the form", async () => {
    const { loader } = await import("../../app/routes/auth.login/route.jsx");
    const r = await run(loader, "https://app.test/auth/login", { referer: "https://admin.shopify.com/store/demo/apps/navaal-seo-geo-content" });
    expect(r.threw).toBe(true);
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/reembed/);
  });

  it("auth.login: genuine external visit (no embedded context, no admin referer) still renders the form", async () => {
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

  it("isEmbeddedRequest detects host, embedded=1, iframe dest, and admin.shopify.com referer", async () => {
    const { isEmbeddedRequest } = await import("../../app/utils/embedded.server.js");
    expect(isEmbeddedRequest(new Request("https://a.test/?host=x"))).toBe(true);
    expect(isEmbeddedRequest(new Request("https://a.test/?embedded=1"))).toBe(true);
    expect(isEmbeddedRequest(new Request("https://a.test/", { headers: { "sec-fetch-dest": "iframe" } }))).toBe(true);
    expect(isEmbeddedRequest(new Request("https://a.test/", { headers: { referer: "https://admin.shopify.com/store/x/apps/y" } }))).toBe(true);
    expect(isEmbeddedRequest(new Request("https://a.test/"))).toBe(false);
  });

  // ── Replacing two source-regex guards with behaviour (Phase 1 item 10) ──
  //
  // These used to be `readFileSync` + a regex over the route source: one
  // checked app.jsx contained `rel="home"`, the other that _index did not
  // contain the string "/auth/login". Both would pass on code that had been
  // refactored into something equivalent-looking and broken, and both would
  // fail on a harmless reformat. What follows drives the loaders instead.

  it("the admin sidebar's app title cannot dead-end, wherever Shopify points it", async () => {
    // `rel="home"` in app.jsx points the app title at /app. The old test read
    // the source for that attribute — but the attribute is belt and braces. The
    // failure it was added for is Shopify pointing the title at a bare "/", and
    // what actually fixed that is the routing below: "/" now re-embeds. So the
    // property worth holding is that BOTH candidate targets are safe.
    const { loader: indexLoader } = await import("../../app/routes/_index/route.jsx");
    const { loader: reembedLoader } = await import("../../app/routes/reembed.jsx");

    // Target 1: a bare "/" — where Shopify points the title with no home link.
    const root = await run(indexLoader, "https://app.test/");
    expect(root.status).toBe(302);
    expect(root.location).toMatch(/^\/reembed/);

    // Target 2: the re-embed page it lands on resolves into the admin at /app.
    const page = await run(reembedLoader, `https://app.test/reembed?host=${HOST}`);
    expect(isReembed(page)).toBe(true);
    expect(page.body).toContain("/apps/navaal-seo-geo-content/app");
    expect(page.body).not.toMatch(/Shop domain|name="shop"/i);
  });

  it("no entry point produces a login form for ANY embedded signal", async () => {
    // The 2.1.1 rejection in one assertion. Every way Shopify can tell us the
    // request came from inside the admin, against both public entry points.
    const { loader: indexLoader } = await import("../../app/routes/_index/route.jsx");
    const { loader: loginLoader } = await import("../../app/routes/auth.login/route.jsx");

    const embeddedSignals = [
      { label: "host param", url: `https://app.test/?host=${HOST}` },
      { label: "embedded=1", url: "https://app.test/?embedded=1" },
      { label: "iframe dest", url: "https://app.test/", headers: { "sec-fetch-dest": "iframe" } },
      { label: "frame dest", url: "https://app.test/", headers: { "sec-fetch-dest": "frame" } },
      {
        label: "admin referer",
        url: "https://app.test/",
        headers: { referer: "https://admin.shopify.com/store/x/apps/y" },
      },
      { label: "host and shop", url: `https://app.test/?host=${HOST}&shop=x.myshopify.com` },
    ];

    for (const { label, url, headers } of embeddedSignals) {
      for (const [name, loader] of [["_index", indexLoader], ["auth.login", loginLoader]]) {
        const r = await run(loader, url, headers);
        // Never data (the form is rendered from returned data), always a
        // redirect into the app or the re-embed page.
        expect(r.isResponse, `${name} answered ${label} with form data`).toBe(true);
        expect(r.status, `${name} / ${label}`).toBe(302);
        expect(r.location, `${name} / ${label}`).toMatch(/^\/(app|reembed)/);
        expect(r.location, `${name} / ${label}`).not.toMatch(/auth\/login/);
      }
    }
  });

  it("a bare / is treated as in-admin even with no signal at all", async () => {
    // There is no legitimate way to reach this app's root outside the admin, so
    // the absence of every signal still must not produce a form.
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const r = await run(loader, "https://app.test/");
    expect(r.status).toBe(302);
    expect(r.location).toMatch(/^\/reembed/);
  });

  it("a genuine external visit to /auth/login still gets the form", async () => {
    // The other half: the guard must not have been implemented by removing the
    // form altogether. A merchant arriving from outside Shopify needs it.
    const { loader } = await import("../../app/routes/auth.login/route.jsx");
    const r = await run(loader, "https://app.test/auth/login");
    expect(r.isResponse).toBe(false);
    expect(r.data).toHaveProperty("errors");
  });
});
