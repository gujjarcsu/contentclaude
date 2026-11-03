/**
 * Every form and fetcher POST must survive React Router's CSRF origin check
 * the way production delivers it.
 *
 * Fly terminates TLS and forwards plain http to `react-router-serve`, which
 * does not trust the proxy, so the server sees `http://app.navaal.ai/...`
 * while the browser sends `Origin: https://app.navaal.ai`. React Router 7.17
 * compared hosts only; 7.18 (P40, 28 Oct 2026) compares the whole origin,
 * scheme included, and answers 400 "Bad Request" before any action runs.
 *
 * In production that took out every action from a merchant's browser. The
 * first one anybody saw was Home: on a first run the three quick-start
 * fetchers fire on their own, all three got 400, and the route's error
 * boundary showed "Unexpected Server Error" (EBS, reinstalled 2 Nov 07:40 UTC,
 * 12 rejected POSTs to /app/quick-start.data in the durable log).
 *
 * This drives React Router's real request handler with a build carrying our
 * own react-router.config.js, so it fails if the allowance is removed or the
 * check tightens again.
 */
import { describe, it, expect } from "vitest";
import { createRequestHandler } from "react-router";
import config from "../../react-router.config.js";

function buildFrom(cfg) {
  const route = (id, extra = {}) => ({ id, module: `/${id}.js`, hasAction: false, hasLoader: false, hasClientAction: false, hasClientLoader: false, hasClientMiddleware: false, hasErrorBoundary: false, ...extra });
  return {
    entry: { module: { default: async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }) } },
    routes: {
      root: { id: "root", path: "", module: { default: () => null } },
      "routes/app.probe": { id: "routes/app.probe", parentId: "root", path: "app/probe", module: { default: () => null, action: async () => ({ ok: true }) } },
    },
    assets: {
      url: "/assets/manifest.js",
      version: "test",
      entry: { module: "/entry.js", imports: [] },
      routes: { root: route("root"), "routes/app.probe": route("routes/app.probe", { parentId: "root", path: "app/probe", hasAction: true }) },
    },
    publicPath: "/",
    assetsBuildDirectory: "build/client",
    future: cfg.future ?? {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: "lazy", manifestPath: "/__manifest" },
    basename: "/",
    allowedActionOrigins: cfg.allowedActionOrigins ?? false,
  };
}

function post(url, origin) {
  return new Request(url, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: "actionType=probe",
  });
}

describe("action submissions behind the Fly proxy", () => {
  const handle = createRequestHandler(buildFrom(config), "production");

  it("accepts a fetcher POST whose https origin reaches the server as http", async () => {
    const res = await handle(post("http://app.navaal.ai/app/probe.data", "https://app.navaal.ai"));
    expect(res.status).toBe(200);
  });

  it("accepts a document form POST the same way", async () => {
    const res = await handle(post("http://app.navaal.ai/app/probe", "https://app.navaal.ai"));
    expect(res.status).not.toBe(400);
  });

  it("still refuses a POST from another site", async () => {
    const res = await handle(post("http://app.navaal.ai/app/probe.data", "https://evil.example"));
    expect(res.status).toBe(400);
  });

  it("still refuses a look-alike host", async () => {
    const res = await handle(post("http://app.navaal.ai/app/probe.data", "https://app.navaal.ai.evil.example"));
    expect(res.status).toBe(400);
  });
});
