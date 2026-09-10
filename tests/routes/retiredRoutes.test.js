/**
 * Phase 3 — the five retired routes.
 *
 * `/app/welcome` and `/app/setup` (item 3.1, replaced by the Start state on
 * Home) and `/app/results` and `/app/analytics` (the owner's approved five-item
 * nav: Home · Products · Review · Blog · Settings).
 *
 * Deleting them outright would have been wrong. A merchant with a bookmark or
 * an open tab, and an App Store reviewer following a link from an earlier
 * submission, must land somewhere sensible rather than on a 404 inside the
 * Shopify admin frame. So each answers a **same-origin 302 to `/app`**.
 *
 * Two things about that redirect are load-bearing, and both were the subject of
 * App Store rejections:
 *
 *   1. It is SAME-ORIGIN. A redirect to `admin.shopify.com` from inside the
 *      embedded frame is a cross-origin top-level navigation.
 *   2. It carries the Shopify auth params. Third-party cookies are blocked in
 *      the iframe, so `id_token` and `session` have to survive the hop or the
 *      merchant lands on a page that cannot authenticate — which reads to them
 *      as the app logging them out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const { authenticate } = vi.hoisted(() => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));

const RETIRED = [
  ["app/routes/app.welcome.jsx", "/app/welcome"],
  ["app/routes/app.setup.jsx", "/app/setup"],
  ["app/routes/app.results.jsx", "/app/results"],
  ["app/routes/app.analytics.jsx", "/app/analytics"],
];

const SHOP = "a-store.myshopify.com";
const HOST = Buffer.from(`${SHOP}/admin`).toString("base64url");

async function hit(file, query) {
  const mod = await import(/* @vite-ignore */ `../../${file}`);
  try {
    const res = await mod.loader({ request: new Request(`https://app.navaal.ai${query}`) });
    return { thrown: false, res };
  } catch (e) {
    if (e instanceof Response) return { thrown: true, res: e };
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: {} });
});

describe("every retired route redirects to /app", () => {
  it.each(RETIRED)("%s answers 302 to /app", async (file, path) => {
    const { res } = await hit(file, `${path}?host=${HOST}&shop=${SHOP}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/app(\?|$)/);
  });

  it.each(RETIRED)("%s redirects SAME-ORIGIN, never to admin.shopify.com", async (file, path) => {
    const { res } = await hit(file, `${path}?host=${HOST}&shop=${SHOP}`);
    const loc = res.headers.get("location");
    expect(loc.startsWith("/")).toBe(true);
    expect(loc).not.toMatch(/^https?:\/\//);
    expect(loc).not.toMatch(/admin\.shopify\.com/);
  });

  it.each(RETIRED)("%s carries every auth parameter through", async (file, path) => {
    const { res } = await hit(
      file,
      `${path}?host=${HOST}&shop=${SHOP}&id_token=tok123&embedded=1&locale=en&session=sess1`,
    );
    const q = new URLSearchParams(res.headers.get("location").split("?")[1]);
    expect(q.get("host")).toBe(HOST);
    expect(q.get("shop")).toBe(SHOP);
    expect(q.get("id_token")).toBe("tok123");
    expect(q.get("session")).toBe("sess1");
    expect(q.get("embedded")).toBe("1");
    expect(q.get("locale")).toBe("en");
  });

  it.each(RETIRED)("%s invents no parameter that was not sent", async (file, path) => {
    const { res } = await hit(file, `${path}?host=${HOST}&shop=${SHOP}`);
    const q = new URLSearchParams(res.headers.get("location").split("?")[1]);
    expect(q.get("id_token")).toBeNull();
    expect(q.get("hmac")).toBeNull();
  });

  it.each(RETIRED)("%s still authenticates first — it is not a hole in G3", async (file, path) => {
    await hit(file, `${path}?host=${HOST}&shop=${SHOP}`);
    expect(authenticate.admin).toHaveBeenCalledTimes(1);
  });

  it("a bare request with no params still lands on /app", async () => {
    const { res } = await hit("app/routes/app.welcome.jsx", "/app/welcome");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
  });
});

describe("the retired files carry no surviving behaviour", () => {
  const read = (f) => readFileSync(f, "utf8");

  it.each(RETIRED)("%s exports no action — nothing can still be submitted to it", (file) => {
    expect(read(file)).not.toMatch(/export\s+(const|async function|function)\s+action/);
  });

  it.each(RETIRED)("%s renders no component", (file) => {
    expect(read(file)).not.toMatch(/export\s+default/);
  });

  it.each(RETIRED)("%s spends no credit and calls no generator", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/tryConsumeGeneration|withGenerationCredit|ai\.server/);
  });

  it("no surviving screen links to a retired route", () => {
    // A dead link inside the admin is worse than a missing one: it looks like
    // the app is broken rather than like the feature moved.
    const retiredPaths = RETIRED.map(([, p]) => p);
    const retiredFiles = new Set(RETIRED.map(([f]) => f));
    let swept = 0;
    for (const dir of ["app/routes", "app/components"]) {
      for (const name of readdirSync(dir)) {
        if (!/\.(js|jsx)$/.test(name)) continue;
        const f = `${dir}/${name}`;
        if (retiredFiles.has(f)) continue;
        swept += 1;
        const src = read(f)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^[ \t]*\/\/.*$/gm, "");
        for (const p of retiredPaths) {
          expect(src, `${f} still links to ${p}`).not.toContain(`"${p}"`);
          expect(src, `${f} still links to ${p}`).not.toContain(`\`${p}`);
        }
      }
    }
    expect(swept, "no files were swept").toBeGreaterThan(10);
  });
});
