/**
 * /app/upgrade-prompt — client-confirmed upgrade-prompt events.
 *   - a background fetcher must never yank the app to a login page: auth miss → { ok:false } 200
 *   - the loader never renders: it sends the visitor back into /app (never /auth/login)
 *   - shop-scoped write: a foreign promptId is a no-op; bad input is a 400
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { db, adminMock } = vi.hoisted(() => ({
  db: { upgradePrompt: { updateMany: vi.fn() } },
  adminMock: vi.fn(),
}));
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: adminMock },
  addDocumentResponseHeaders: () => {},
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));
vi.mock("../../app/utils/logger.server.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const SHOP = "fresh-store.myshopify.com";
const ID = "cmf0abcdefghijklmnopqrst"; // cuid-shaped
const post = (body) => new Request("https://app.navaal.ai/app/upgrade-prompt", { method: "POST", body });
const form = (o) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };

beforeEach(() => {
  db.upgradePrompt.updateMany.mockReset();
  adminMock.mockReset();
  adminMock.mockResolvedValue({ session: { shop: SHOP } });
});

describe("/app/upgrade-prompt", () => {
  it("shown → firstShownAt once + shownCount++ for the shop that owns the prompt", async () => {
    db.upgradePrompt.updateMany.mockResolvedValue({ count: 1 });
    const { action } = await import("../../app/routes/app.upgrade-prompt.jsx");
    const res = await action({ request: post(form({ promptId: ID, event: "shown" })) });
    expect(await res.json()).toEqual({ ok: true, count: 1 });
    expect(db.upgradePrompt.updateMany.mock.calls[0][0].where).toEqual({ id: ID, shop: SHOP, firstShownAt: null });
    expect(db.upgradePrompt.updateMany.mock.calls[1][0]).toMatchObject({ where: { id: ID, shop: SHOP }, data: { shownCount: { increment: 1 } } });
  });

  it("a foreign promptId is a no-op (ok:false, nothing written for another shop)", async () => {
    db.upgradePrompt.updateMany.mockResolvedValue({ count: 0 });
    const { action } = await import("../../app/routes/app.upgrade-prompt.jsx");
    const res = await action({ request: post(form({ promptId: ID, event: "cta_clicked" })) });
    expect(await res.json()).toEqual({ ok: false, count: 0 });
    expect(db.upgradePrompt.updateMany.mock.calls[0][0].where).toEqual({ id: ID, shop: SHOP });
  });

  it("auth miss → { ok:false } with 200 (never a redirect to a login form)", async () => {
    adminMock.mockRejectedValue(new Response(null, { status: 302, headers: { location: "/auth/login" } }));
    const { action } = await import("../../app/routes/app.upgrade-prompt.jsx");
    const res = await action({ request: post(form({ promptId: ID, event: "shown" })) });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    expect(db.upgradePrompt.updateMany).not.toHaveBeenCalled();
  });

  it("bad input → 400 and nothing written", async () => {
    const { action } = await import("../../app/routes/app.upgrade-prompt.jsx");
    for (const body of [{ promptId: "<x>", event: "shown" }, { promptId: ID, event: "purchased" }]) {
      const res = await action({ request: post(form(body)) });
      expect(res.status).toBe(400);
    }
    expect(db.upgradePrompt.updateMany).not.toHaveBeenCalled();
  });

  it("loader sends a visitor back into /app with the auth params (never /auth/login)", async () => {
    const { loader } = await import("../../app/routes/app.upgrade-prompt.jsx");
    let res;
    try { res = await loader({ request: new Request(`https://app.navaal.ai/app/upgrade-prompt?shop=${SHOP}&host=abc&embedded=1`) }); } catch (e) { res = e; }
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/app\?/);
    expect(res.headers.get("location")).toContain("host=abc");
    expect(res.headers.get("location")).not.toContain("auth/login");
  });

  it("QuotaUpgradePrompt source: amber only, reset line unconditional, no dark-pattern copy", () => {
    const src = readFileSync("app/components/UpgradePrompt.jsx", "utf8");
    expect(src).toContain("Or wait — your {planLabel} generations reset on {upsell.resetDate}.");
    expect(src).not.toMatch(/tone="critical"/);
    expect(src).not.toMatch(/countdown|ends in|hurry|only .* left today|offer ends/i);
    expect(src).toContain("Compare all plans");
  });
});
