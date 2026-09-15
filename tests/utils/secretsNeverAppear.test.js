/**
 * Phase 12 Part E, line A9 — secrets never appear anywhere.
 *
 * A full generation with a MERCHANT's own key, then with OUR key, under a
 * provider that answers normally and then a provider that echoes the key
 * back in an error body (as a hostile or careless upstream might); and every
 * Bing path that touches a merchant's Bing key, under a Bing that echoes the
 * key back in an error. Every log line, every thrown error (message and
 * stack), and every value returned to the caller is grepped for both keys —
 * the whole key and any twelve-character window of it — and the test fails
 * on a single hit.
 *
 * What this does NOT cover, said plainly: the network request itself carries
 * the key by design (x-api-key, apikey=); a transport-level capture is out
 * of scope. The runs here are the code paths, with fetch mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const MERCHANT_KEY = "sk-ant-api03-MERCHANT-SECRET-0123456789abcdefghijklmnopqrstuvwxyz";
const OUR_KEY = "sk-ant-api03-OURS-SECRET-zyxwvutsrqponmlkjihgfedcba9876543210";
const BING_KEY = "bing-secret-1234567890abcdef1234567890abcdef";

const { log, ctx, db, secretBox } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    log: { info: fn(), warn: fn(), error: fn(), debug: fn() },
    ctx: { merchantKey: null },
    db: { shop: { findUnique: fn(), updateMany: fn(), update: fn() }, usageRecord: { updateMany: fn(), create: fn() }, plan: { findUnique: fn() } },
    secretBox: { key: "" },
  };
});
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/usageContext.server.js", () => ({ currentMerchantKey: () => (ctx.merchantKey ? { key: ctx.merchantKey, shop: "m.myshopify.com" } : null), currentUsageRecord: () => null }));
vi.mock("../../app/utils/plans.server.js", () => ({ recordTokensUsed: vi.fn(async () => {}) }));
vi.mock("../../app/utils/secretBox.server.js", () => ({
  isEnabled: () => true,
  encrypt: (v) => ({ ciphertext: `enc:${v.length}`, iv: "iv", tag: "tag" }),
  decrypt: () => secretBox.key,
}));

const ai = await import("../../app/utils/ai.server.js");
const bing = await import("../../app/utils/bing.server.js");

/** Everything that left the code path: log args, thrown errors, returned values. */
function collected(extra = []) {
  const parts = [];
  for (const f of Object.values(log)) for (const c of f.mock.calls) parts.push(JSON.stringify(c));
  for (const x of extra) parts.push(x instanceof Error ? `${x.message}\n${x.stack}` : JSON.stringify(x));
  return parts.join("\n");
}
function windows(key) {
  const out = [key];
  for (let i = 0; i + 12 <= key.length; i += 6) out.push(key.slice(i, i + 12));
  return out;
}
function assertNoSecret(text, key, label) {
  for (const w of windows(key)) expect(text, `${label}: ${w.slice(0, 4)}… appeared`).not.toContain(w);
}

const product = { id: "gid://shopify/Product/1", title: "Trade Work Boot", description: "A".repeat(150), productType: "Footwear", vendor: "Acme", tags: [], variants: [{ price: "129.00" }] };
const brandVoice = { storeName: "Acme", brandTone: "professional", language: "en" };

beforeEach(() => {
  for (const f of Object.values(log)) f.mockReset();
  for (const m of Object.values(db)) for (const f of Object.values(m)) f.mockReset();
  ctx.merchantKey = null;
  process.env.ANTHROPIC_API_KEY = OUR_KEY;
  db.shop.findUnique.mockResolvedValue(null);
});

describe("a full generation", () => {
  const okResponse = () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ content: [{ type: "text", text: "<description>A boot for the trade. Steel toe, oiled leather, resoleable. Made for concrete and rain and long days on both.</description>" }], usage: { input_tokens: 120, output_tokens: 60 } }),
  });
  const hostileResponse = (key) => ({
    ok: false,
    status: 401,
    headers: { get: () => null },
    text: async () => `{"error":{"type":"authentication_error","message":"invalid x-api-key ${key}"}}`,
    json: async () => ({ error: { type: "authentication_error", message: `invalid x-api-key ${key}` } }),
  });

  it("with the merchant's own key, on a provider that answers: no key in any log line or the returned draft", async () => {
    ctx.merchantKey = MERCHANT_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());
    const out = await ai.generateProductContent(product, brandVoice, ["description"]);
    // the request carried the key by design — and only there
    expect(fetchSpy.mock.calls[0][1].headers["x-api-key"]).toBe(MERCHANT_KEY);
    fetchSpy.mockRestore();
    const text = collected([out]);
    assertNoSecret(text, MERCHANT_KEY, "merchant key");
    assertNoSecret(text, OUR_KEY, "our key");
    expect(JSON.stringify(out)).not.toMatch(/sk-ant/);
  });

  it("with our key, on a provider that echoes the key back in a 401 body: the error the caller sees and every log line are clean", async () => {
    ctx.merchantKey = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(hostileResponse(OUR_KEY));
    let thrown = null;
    let out = null;
    try {
      out = await ai.generateProductContent(product, brandVoice, ["description"]);
    } catch (e) {
      thrown = e;
    }
    fetchSpy.mockRestore();
    const text = collected([thrown ?? out]);
    assertNoSecret(text, OUR_KEY, "our key (401 echo)");
    assertNoSecret(text, MERCHANT_KEY, "merchant key");
  });

  it("with the merchant's key, on the same hostile provider: nothing of the key survives into the pause message either", async () => {
    ctx.merchantKey = MERCHANT_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(hostileResponse(MERCHANT_KEY));
    let thrown = null;
    try {
      await ai.generateProductContent(product, brandVoice, ["description"]);
    } catch (e) {
      thrown = e;
    }
    fetchSpy.mockRestore();
    assertNoSecret(collected([thrown]), MERCHANT_KEY, "merchant key (401 echo)");
  });
});

describe("every Bing path that touches the merchant's key", () => {
  const SHOP = "a-store.myshopify.com";
  beforeEach(() => {
    secretBox.key = BING_KEY;
    db.shop.findUnique.mockResolvedValue({ bingKeyCiphertext: "enc", bingKeyIv: "iv", bingKeyTag: "tag", bingKeyValidatedAt: null, bingSiteUrl: "https://a-store.myshopify.com/", bingEnabledAt: null });
    db.shop.updateMany.mockResolvedValue({ count: 1 });
    db.shop.update.mockResolvedValue({});
  });

  it("submit, url info, quota and page stats under a Bing that answers, then under one that echoes the key in an error", async () => {
    const answers = { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ d: null }), text: async () => "{}" };
    const echoes = { ok: false, status: 401, headers: { get: () => "application/json" }, json: async () => ({ Message: `Invalid apikey=${BING_KEY}` }), text: async () => `Invalid apikey=${BING_KEY}` };
    for (const response of [answers, echoes]) {
      for (const f of Object.values(log)) f.mockReset();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      const results = [];
      const errors = [];
      for (const call of [
        () => bing.submitUrls(SHOP, "https://a-store.myshopify.com/", ["https://a-store.myshopify.com/products/x"]),
        () => bing.urlInfo(SHOP, "https://a-store.myshopify.com/", "https://a-store.myshopify.com/products/x"),
        () => bing.submissionQuota(SHOP, "https://a-store.myshopify.com/"),
        () => bing.pageQueryStats(SHOP, "https://a-store.myshopify.com/", "https://a-store.myshopify.com/products/x"),
        () => bing.bingKeyStatus(SHOP),
        () => bing.saveBingKey(SHOP, BING_KEY, { storefrontOrigin: "https://a-store.myshopify.com" }),
      ]) {
        try {
          results.push(await call());
        } catch (e) {
          errors.push(e);
        }
      }
      // the request URL carried the key by design — and only there
      expect(fetchSpy.mock.calls.some(([u]) => String(u).includes(`apikey=${BING_KEY}`))).toBe(true);
      fetchSpy.mockRestore();
      const text = collected([...results, ...errors]);
      assertNoSecret(text, BING_KEY, `bing key (${response.ok ? "answers" : "echoes"})`);
      expect(text).not.toMatch(/apikey=(?!\[redacted\])[^&"'\s]{8,}/);
    }
  });
});
