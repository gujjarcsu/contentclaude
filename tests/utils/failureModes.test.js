/**
 * Phase 12 Part E, line A7 — failure is loud, bounded and recoverable.
 *
 * The runbook's table (docs/navaal/RUNBOOK.md §7) cites, per failure, the
 * test that breaks it on purpose. Most were written before this phase; the
 * four here are the ones that had no explicit controlled break:
 *
 *   - Shopify rejects our API version (a 4xx with a body that names it)
 *   - Shopify answers 5xx / the network drops mid-read
 *   - an expired trial (Shopify cancels the subscription; the plan row is no
 *     longer active)
 *   - a revoked token (Shopify refuses shop { name })
 *
 * Each shows the merchant a truthful screen or sentence, never a silent zero,
 * and the runbook row for it names this file.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";

const { db, log } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: { plan: { findUnique: fn() }, shop: { findUnique: fn() }, usageRecord: { findMany: fn(), aggregate: fn(), create: fn() }, $transaction: fn(), session: { findFirst: fn() } },
    log: { info: fn(), warn: fn(), error: fn(), debug: fn() },
  };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (_k, fn) => fn()), setCache: vi.fn(), invalidateCache: vi.fn(), getRedis: async () => null }));

const { shopifyQuery, productsPage } = await import("../../app/utils/shopifyQuery.server.js");
const src = (p) => code(readFileSync(p, "utf8"));

beforeEach(() => {
  for (const m of Object.values(db)) if (typeof m !== "function") for (const f of Object.values(m)) f.mockReset();
  for (const f of Object.values(log)) f.mockReset();
});

describe("Shopify rejects our API version", () => {
  it("a rejected API version is a read failure the merchant is told about — never an empty catalogue presented as real", async () => {
    const graphql = vi.fn(async () => ({ status: 400, headers: { get: () => null }, json: async () => ({ errors: [{ message: "Unsupported API version 2026-04. See https://shopify.dev/api/usage/versioning" }] }) }));
    const r = await shopifyQuery(graphql, "query { products(first: 1) { edges { node { id } } } }", {}, { shop: "s.myshopify.com", label: "products", maxRetries: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("errors");
    expect(r.error).toMatch(/Unsupported API version/);
    const page = productsPage(r);
    expect(page).toMatchObject({ ok: false, edges: [], throttled: false });
    // what the screen says when ok is false: the sentence exists, and it is not a zero
    const products = src("app/routes/app.products.jsx");
    expect(products).toMatch(/We could not read your full product list from Shopify just now\. This list may be incomplete\./);
    expect(src("app/routes/app._index.jsx")).toMatch(/We could not read this from Shopify just now/);
    // and the owner has a clock, not a surprise
    expect(readFileSync("app/utils/clocks.js", "utf8")).toMatch(/key: "admin-api-2026-04"/);
  });
});

describe("Shopify 5xx or the network drops mid-read", () => {
  it("a transport failure is retried once and then returned as data, not thrown into the screen", async () => {
    const graphql = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const r = await shopifyQuery(graphql, "query { shop { name } }", {}, { shop: "s.myshopify.com", label: "name", maxRetries: 0 });
    expect(r).toMatchObject({ ok: false, reason: "transport", error: "socket hang up" });
    expect(log.warn.mock.calls.some((c) => /failed after retries/.test(c[1]))).toBe(true);
  });

  it("a 503 with an HTML body is a no-data failure with the status in the reason", async () => {
    const graphql = vi.fn(async () => ({ status: 503, headers: { get: () => null }, json: async () => { throw new Error("not json"); } }));
    const r = await shopifyQuery(graphql, "query { shop { name } }", {}, { maxRetries: 0 });
    expect(r).toMatchObject({ ok: false, reason: "no_data" });
    expect(r.error).toMatch(/HTTP 503/);
  });
});

describe("an expired trial", () => {
  it("a plan that is no longer active is denied with the plan named and nothing charged — the gate, not a zero", async () => {
    const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
    db.$transaction.mockImplementation(async (fn) => fn({ plan: { findUnique: async () => ({ shop: "s", planName: "starter", status: "cancelled", monthlyCredits: 500, trialEndsAt: new Date("2026-09-01T00:00:00Z") }) } }));
    const r = await tryConsumeGeneration("s.myshopify.com", "description");
    expect(r).toMatchObject({ allowed: false, planName: "starter", remaining: 0 });
    expect(db.usageRecord.create).not.toHaveBeenCalled();
  });
});

describe("a revoked token", () => {
  it("Shopify refusing shop { name } is 'not installed', which the reconcile counts and never deletes on", async () => {
    const { probeInstalled } = await import("../../app/utils/installState.server.js");
    const p = await probeInstalled("s.myshopify.com", { fetchImpl: async () => ({ status: 401, json: async () => ({ errors: "[API] Invalid API key or access token" }) }), loadSession: async () => ({ accessToken: "t" }) });
    expect(p).toEqual({ installed: false, status: 401, reason: "token_not_honoured" });
    const s = src("app/utils/installState.server.js");
    expect(s).toMatch(/install_state_contradicted_reverse/);
    expect(s).toMatch(/counted, not stamped/);
  });
});

describe("the runbook cites every row", () => {
  it("docs/navaal/RUNBOOK.md names this file and the five 3 am failures", () => {
    const rb = readFileSync("docs/navaal/RUNBOOK.md", "utf8");
    expect(rb).toMatch(/failureModes\.test\.js/);
    for (const h of ["## 1. Database down", "## 2. Redis down", "## 3. AI provider down", "## 4. Shopify rejects our API version", "## 5. A merchant reports wrong content published"]) expect(rb).toContain(h);
    expect(rb).toMatch(/## 6\. The restore drill/);
    expect(rb).toMatch(/NOT YET EXECUTED/);
    for (const cite of ["circuitBreaker.test.js", "jobRecovery.test.js", "health.deep.test.js", "webhookRetryWindow.test.js", "adminGraphql.publish.test.js", "installState.test.js", "restoreOriginal.test.js", "scheduledWeek.test.js"]) expect(rb, cite).toContain(cite);
  });
});
