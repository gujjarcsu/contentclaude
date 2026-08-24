/**
 * App Store 1.2.2 regression — the billing return flow.
 *
 * Before the fix, the subscription return_url pointed at /app/plans; after
 * approval Shopify top-level-redirected there with no embedded context/session,
 * auth failed, and the merchant landed on the bare /auth/login form — the plan
 * never appeared to change. The fix routes the return through a public
 * /billing/callback that reads the offline token, records the plan, and 302s
 * back INTO the embedded admin Plans page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

vi.mock("../../app/shopify.server", () => ({ apiVersion: "2026-04" }));

const getFreshOfflineSession = vi.fn();
vi.mock("../../app/utils/offlineToken.server.js", () => ({
  getFreshOfflineSession: (...a) => getFreshOfflineSession(...a),
}));

const syncBillingToPlan = vi.fn(async () => {});
vi.mock("../../app/utils/plans.server", () => ({
  syncBillingToPlan: (...a) => syncBillingToPlan(...a),
}));

vi.mock("../../app/utils/cache.server.js", () => ({ invalidateCache: vi.fn(async () => {}) }));
vi.mock("../../app/utils/logger.server", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const { loader } = await import("../../app/routes/billing.callback.jsx");

const run = (qs) => loader({ request: new Request(`https://app.navaal.ai/billing/callback?${qs}`) });
const gqlResponse = (subs) => ({
  json: async () => ({ data: { currentAppInstallation: { activeSubscriptions: subs } } }),
});

describe("billing.callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFreshOfflineSession.mockResolvedValue({ shop: "s.myshopify.com", accessToken: "tok" });
  });

  it("redirects an ACTIVE subscription back into the embedded admin Plans page (upgraded)", async () => {
    mockFetch.mockResolvedValue(gqlResponse([{ id: "gid://shopify/AppSubscription/1", name: "Professional Plan", status: "ACTIVE" }]));
    const res = await run("shop=ap13ht-zv.myshopify.com&charge_id=41354297366");
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location");
    expect(loc).toBe("https://admin.shopify.com/store/ap13ht-zv/apps/navaal-seo-geo-content/app/plans?upgraded=1");
    // Never our bare domain / login form
    expect(loc).not.toContain("/auth/login");
    expect(loc).not.toContain("app.navaal.ai");
    // DB was updated from Shopify's live state
    expect(syncBillingToPlan).toHaveBeenCalledWith("ap13ht-zv.myshopify.com", expect.arrayContaining([
      expect.objectContaining({ name: "Professional Plan", status: "ACTIVE" }),
    ]));
  });

  it("redirects a declined/empty subscription to the Plans page with declined=1", async () => {
    mockFetch.mockResolvedValue(gqlResponse([]));
    const res = await run("shop=ap13ht-zv.myshopify.com&charge_id=999");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/apps/navaal-seo-geo-content/app/plans?declined=1");
    expect(syncBillingToPlan).toHaveBeenCalledWith("ap13ht-zv.myshopify.com", []);
  });

  it("still returns the merchant into the app on an offline-session failure (never a dead end)", async () => {
    getFreshOfflineSession.mockResolvedValue(null);
    const res = await run("shop=ap13ht-zv.myshopify.com&charge_id=1");
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location");
    expect(loc).toContain("/apps/navaal-seo-geo-content/app/plans?billing_error=1");
    expect(loc).not.toContain("/auth/login");
  });

  it("redirects a missing/invalid shop to the app's admin entry, not a login form", async () => {
    const res = await run("charge_id=1");
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location");
    expect(loc).toBe("https://admin.shopify.com/apps/navaal-seo-geo-content");
    expect(loc).not.toContain("/auth/login");
    expect(getFreshOfflineSession).not.toHaveBeenCalled();
  });

  it("source guard: the subscribe return_url points at /billing/callback, not /app/plans", () => {
    const src = readFileSync(join(repoRoot, "app/routes/app.plans.jsx"), "utf8");
    expect(src).toMatch(/returnUrl:\s*`\$\{process\.env\.SHOPIFY_APP_URL\}\/billing\/callback\?shop=/);
    expect(src).not.toMatch(/returnUrl:\s*`\$\{process\.env\.SHOPIFY_APP_URL\}\/app\/plans`/);
  });
});
