/**
 * C0.7 / P5.5 — bring your own AI key, at Pro.
 *
 * The decision this tests is in `04-DECISIONS.md` and was recorded BEFORE the
 * code: **a generation on a merchant's own key costs zero credits, and is still
 * recorded.**
 *
 * The rest of this file is about the rule that has no second chance. L9, and
 * `04-DECISIONS.md` states it twice: the key is **never logged, never returned
 * to the client, never in an error message — not the key, not a prefix, not a
 * length.** A leak here is not a bug that gets fixed in the next deploy; it is
 * a merchant's Anthropic credentials in a log aggregator forever.
 *
 * So those assertions are mechanical rather than trusting: they read the source
 * of every file that touches key material and fail on the SHAPES that leak,
 * not on whether anyone remembered to be careful.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unwrapT } from "../helpers/code.js"; // Phase 12 Part D: source guards see through t("…")
import { readFileSync } from "node:fs";

/**
 * Comments stripped before every "the source must not contain X" assertion.
 *
 * Learned twice now. In Phase 4 a presence check passed on a docstring that
 * merely QUOTED the merchant copy, so deleting the copy failed nothing. Here it
 * bit the other way round: these rules fired on the comments EXPLAINING them —
 * `secretBox.server.js` says "its own secret, not SHOPIFY_API_SECRET", and
 * `ai.server.js` documents the six reads it replaced. A file is not less safe
 * for naming the thing it refuses to do.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
}

const { prisma } = vi.hoisted(() => ({
  prisma: {
    shop: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/logger.server.js", () => ({ default: logger }));

/** A 32-byte key, base64. Test-only, and it is not a secret: it protects nothing. */
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const SHOP = "s.myshopify.com";
const FAKE_MERCHANT_KEY = "sk-ant-api03-EXAMPLE-NOT-A-REAL-KEY-0000000000";

describe("secretBox — the encryption", () => {
  beforeEach(() => {
    process.env.BYOK_ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
  });
  afterEach(() => {
    delete process.env.BYOK_ENCRYPTION_KEY;
  });

  it("round-trips a key", async () => {
    const { encrypt, decrypt } = await import("../../app/utils/secretBox.server.js");
    const box = encrypt(FAKE_MERCHANT_KEY);
    expect(decrypt(box)).toBe(FAKE_MERCHANT_KEY);
  });

  it("never produces the same ciphertext twice", async () => {
    // A fresh random IV per write. Reusing an IV under one key is the classic
    // way to break GCM, so this asserts the IV is not derived from anything
    // stable like the shop domain.
    const { encrypt } = await import("../../app/utils/secretBox.server.js");
    const a = encrypt(FAKE_MERCHANT_KEY);
    const b = encrypt(FAKE_MERCHANT_KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a tampered ciphertext instead of returning garbage", async () => {
    // This is why GCM and not CBC. Without the auth tag, a flipped byte
    // decrypts to nonsense that then gets sent to Anthropic AS IF it were a key.
    const { encrypt, decrypt } = await import("../../app/utils/secretBox.server.js");
    const box = encrypt(FAKE_MERCHANT_KEY);
    const bytes = Buffer.from(box.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(decrypt({ ...box, ciphertext: bytes.toString("base64") })).toBeNull();
  });

  it("refuses a tampered auth tag", async () => {
    const { encrypt, decrypt } = await import("../../app/utils/secretBox.server.js");
    const box = encrypt(FAKE_MERCHANT_KEY);
    const tag = Buffer.from(box.tag, "base64");
    tag[0] ^= 0xff;
    expect(decrypt({ ...box, tag: tag.toString("base64") })).toBeNull();
  });

  it("cannot decrypt under a different deployment key", async () => {
    const { encrypt } = await import("../../app/utils/secretBox.server.js");
    const box = encrypt(FAKE_MERCHANT_KEY);
    vi.resetModules();
    process.env.BYOK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const { decrypt } = await import("../../app/utils/secretBox.server.js");
    expect(decrypt(box)).toBeNull();
  });
});

describe("secretBox — FAILS CLOSED", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    delete process.env.BYOK_ENCRYPTION_KEY;
  });

  it("is disabled with no deployment key, rather than using a fallback", async () => {
    // The alternative — deriving a key from something in the source tree, or
    // reusing SHOPIFY_API_SECRET — would mean a merchant's credentials in the
    // database protected by a value an attacker with the repo already has.
    delete process.env.BYOK_ENCRYPTION_KEY;
    const { isEnabled, encrypt } = await import("../../app/utils/secretBox.server.js");
    expect(isEnabled()).toBe(false);
    expect(() => encrypt(FAKE_MERCHANT_KEY)).toThrow();
  });

  it("is disabled on a WRONG-LENGTH key rather than padding it", async () => {
    process.env.BYOK_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    const { isEnabled } = await import("../../app/utils/secretBox.server.js");
    expect(isEnabled()).toBe(false);
  });

  it("has no fallback key material anywhere in the source", async () => {
    const src = code(unwrapT(readFileSync("app/utils/secretBox.server.js", "utf8")));
    expect(src).not.toMatch(/SHOPIFY_API_SECRET/);
    expect(src).not.toMatch(/\|\|\s*["'`][A-Za-z0-9+/=]{16,}/);
  });
});

describe("THE LEAK RULES — mechanical, not trusted", () => {
  const FILES = [
    "app/utils/secretBox.server.js",
    "app/utils/merchantKey.server.js",
    "app/routes/app.settings.jsx",
    "app/utils/usageContext.server.js",
  ];

  it.each(FILES)("%s never logs key material", (file) => {
    const src = code(unwrapT(readFileSync(file, "utf8")));
    // Any logger call that mentions a key-bearing identifier.
    const logCalls = src.match(/logger\.\w+\([\s\S]{0,400}?\)/g) ?? [];
    for (const call of logCalls) {
      expect(call, `logs key material:\n${call}`).not.toMatch(
        /\b(apiKey|aiKey|plaintext|ciphertext|merchantKey|key)\s*[,:}]/,
      );
    }
  });

  it.each(FILES)("%s never takes a prefix, suffix or length of a key", (file) => {
    const src = code(unwrapT(readFileSync(file, "utf8")));
    // "not the key, not a prefix, not a length" — these are the shapes that
    // produce one, and each looks perfectly reasonable in review.
    expect(src).not.toMatch(/\b(apiKey|aiKey|plaintext|merchantKey)\b[^\n]{0,40}\.(slice|substring|substr)\(/);
    expect(src).not.toMatch(/\b(apiKey|aiKey|plaintext|merchantKey)\b[^\n]{0,40}\.length\b/);
    expect(src).not.toMatch(/last4|lastFour|keyPrefix|maskedKey/i);
  });

  it("the schema has no column that could hold part of a key", () => {
    // The easiest place to break the rule while sounding reasonable: a last4
    // for a nicer Settings card would put a merchant's secret into every
    // backup, every logged row and every support screenshot.
    const schema = code(unwrapT(readFileSync("prisma/schema.prisma", "utf8")));
    const shopModel = schema.slice(schema.indexOf("model Shop {"), schema.indexOf("model ProductScore"));
    expect(shopModel).toMatch(/aiKeyCiphertext/);
    expect(shopModel).not.toMatch(/aiKeyLast4|aiKeyPrefix|aiKeyLength|aiKeyPlain/i);
  });

  it("the Settings loader can only ever send booleans and a timestamp", () => {
    const src = code(unwrapT(readFileSync("app/routes/app.settings.jsx", "utf8")));
    // keyStatusFor is the only reader, and it returns no key material at all —
    // so there is no branch in the route that COULD serialise one.
    expect(src).toMatch(/keyStatusFor/);
    expect(src).not.toMatch(/resolveKeyFor|decrypt\(/);
  });

  it("keyStatusFor returns nothing derived from the key", async () => {
    process.env.BYOK_ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
    prisma.shop.findUnique.mockResolvedValue({
      aiKeyCiphertext: "abc",
      aiKeyValidatedAt: new Date("2026-09-14T00:00:00Z"),
      aiKeyFailedAt: null,
    });
    const { keyStatusFor } = await import("../../app/utils/merchantKey.server.js");
    const status = await keyStatusFor(SHOP);
    expect(Object.keys(status).sort()).toEqual(["configured", "failing", "saved", "validatedAt"]);
    expect(JSON.stringify(status)).not.toContain("abc");
    delete process.env.BYOK_ENCRYPTION_KEY;
  });

  it("a validation failure carries a code, never Anthropic's own text", () => {
    // An upstream error body can echo the request, headers included. This is
    // the one string that reaches a merchant's screen.
    const src = code(unwrapT(readFileSync("app/utils/merchantKey.server.js", "utf8")));
    expect(src).not.toMatch(/reason:\s*(await )?res\.(text|statusText)/);
    expect(src).not.toMatch(/reason:\s*body/);
    expect(src).toMatch(/reason: "rejected"/);
  });
});

describe("validation happens on SAVE, not at 2am", () => {
  beforeEach(() => {
    process.env.BYOK_ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.BYOK_ENCRYPTION_KEY;
    vi.unstubAllGlobals();
  });

  it("stores nothing when Anthropic rejects the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    const { saveKey } = await import("../../app/utils/merchantKey.server.js");
    const r = await saveKey(SHOP, FAKE_MERCHANT_KEY);
    expect(r).toEqual({ ok: false, reason: "rejected" });
    expect(prisma.shop.update).not.toHaveBeenCalled();
  });

  it("stores nothing when Anthropic is unreachable — no optimistic save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const { saveKey } = await import("../../app/utils/merchantKey.server.js");
    expect(await saveKey(SHOP, FAKE_MERCHANT_KEY)).toEqual({ ok: false, reason: "unreachable" });
    expect(prisma.shop.update).not.toHaveBeenCalled();
  });

  it("distinguishes a rate limit from a bad key", async () => {
    // A 429 must not tell a merchant their working key is wrong.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429 })));
    const { saveKey } = await import("../../app/utils/merchantKey.server.js");
    expect((await saveKey(SHOP, FAKE_MERCHANT_KEY)).reason).toBe("rate_limited");
  });

  it("stores ciphertext, iv and tag — and clears a previous failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
    const { saveKey } = await import("../../app/utils/merchantKey.server.js");
    expect(await saveKey(SHOP, FAKE_MERCHANT_KEY)).toEqual({ ok: true });
    const data = prisma.shop.update.mock.calls[0][0].data;
    expect(data.aiKeyCiphertext).toBeTruthy();
    expect(data.aiKeyIv).toBeTruthy();
    expect(data.aiKeyTag).toBeTruthy();
    expect(data.aiKeyValidatedAt).toBeInstanceOf(Date);
    // The merchant fixing the thing we told them about.
    expect(data.aiKeyFailedAt).toBeNull();
    // The plaintext is nowhere in what is written.
    expect(JSON.stringify(data)).not.toContain(FAKE_MERCHANT_KEY);
  });

  it("the validation call uses the CHEAPEST model and one token", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { validateKey } = await import("../../app/utils/merchantKey.server.js");
    await validateKey(FAKE_MERCHANT_KEY);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.max_tokens).toBe(1);
  });
});

describe("a failing key PAUSES, and never falls back to our key", () => {
  beforeEach(() => {
    process.env.BYOK_ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.BYOK_ENCRYPTION_KEY;
  });

  it("resolveKeyFor reports blocked once a failure is stamped", async () => {
    prisma.shop.findUnique.mockResolvedValue({
      aiKeyCiphertext: "x",
      aiKeyIv: "y",
      aiKeyTag: "z",
      aiKeyValidatedAt: new Date(),
      aiKeyFailedAt: new Date(),
    });
    const { resolveKeyFor } = await import("../../app/utils/merchantKey.server.js");
    const r = await resolveKeyFor(SHOP, "pro");
    expect(r.blocked).toBe(true);
    expect(r.key).toBeNull();
  });

  it("an undecryptable row blocks rather than silently using our key", async () => {
    // A rotated BYOK_ENCRYPTION_KEY, or a tampered row. The merchant has to
    // re-enter the key either way, and continuing on ours would spend our money
    // on work they believe they are paying for.
    prisma.shop.findUnique.mockResolvedValue({
      aiKeyCiphertext: "not-real-ciphertext",
      aiKeyIv: "AAAAAAAAAAAAAAAA",
      aiKeyTag: "AAAAAAAAAAAAAAAAAAAAAA==",
      aiKeyValidatedAt: new Date(),
      aiKeyFailedAt: null,
    });
    const { resolveKeyFor } = await import("../../app/utils/merchantKey.server.js");
    expect((await resolveKeyFor(SHOP, "pro")).blocked).toBe(true);
  });

  it("only 401/403 marks a key as failing — not a 429 or a 500", async () => {
    // Turning a transient upstream blip into a forced re-paste is a support
    // ticket we created ourselves.
    const { isAuthFailure } = await import("../../app/utils/merchantKey.server.js");
    expect(isAuthFailure({ status: 401 })).toBe(true);
    expect(isAuthFailure({ status: 403 })).toBe(true);
    expect(isAuthFailure({ status: 429 })).toBe(false);
    expect(isAuthFailure({ status: 500 })).toBe(false);
    expect(isAuthFailure(new Error("socket hang up"))).toBe(false);
  });

  it("markKeyFailing is first-writer-wins, so a bulk burst stamps once", async () => {
    const { markKeyFailing } = await import("../../app/utils/merchantKey.server.js");
    await markKeyFailing(SHOP);
    expect(prisma.shop.updateMany).toHaveBeenCalledWith({
      where: { shop: SHOP, aiKeyFailedAt: null },
      data: { aiKeyFailedAt: expect.any(Date) },
    });
  });

  it("a shop below Pro is never given a merchant key", async () => {
    const { resolveKeyFor } = await import("../../app/utils/merchantKey.server.js");
    for (const plan of ["free", "starter", "growth"]) {
      expect((await resolveKeyFor(SHOP, plan)).byok, plan).toBe(false);
    }
  });
});

describe("the key follows the async chain, because bulk runs concurrently", () => {
  it("two concurrent generations each see their OWN shop's key", async () => {
    // The bug this prevents is the worst one this feature could have: billing
    // one merchant's job to another merchant's Anthropic account. A
    // module-level "current key" would do exactly that.
    const { withMerchantKey, currentMerchantKey } = await import(
      "../../app/utils/usageContext.server.js"
    );
    const seen = [];
    const run = (key, shop, delay) =>
      withMerchantKey({ key, shop }, async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push([shop, currentMerchantKey()?.key]);
      });
    await Promise.all([run("KEY-A", "a.myshopify.com", 12), run("KEY-B", "b.myshopify.com", 1)]);
    expect(seen.sort()).toEqual([
      ["a.myshopify.com", "KEY-A"],
      ["b.myshopify.com", "KEY-B"],
    ]);
  });

  it("outside a context there is no key, so ai.server.js uses ours", async () => {
    const { currentMerchantKey } = await import("../../app/utils/usageContext.server.js");
    expect(currentMerchantKey()).toBeNull();
  });

  it("ai.server.js reads the key in ONE place, not six", async () => {
    // It was six copies of `process.env.ANTHROPIC_API_KEY`, each with its own
    // guard — the same shape P5.0 was spent removing one directory over.
    const src = code(unwrapT(readFileSync("app/utils/ai.server.js", "utf8")));
    const reads = src.match(/process\.env\.ANTHROPIC_API_KEY/g) ?? [];
    expect(reads).toHaveLength(1);
    expect(src).toMatch(/function resolveApiKey\(\)/);
    expect(src).toMatch(/currentMerchantKey\(\)/);
  });
});

describe("the billing rule a merchant can read", () => {
  it("the plan card says BYOK generations use no credits", () => {
    const src = unwrapT(readFileSync("app/routes/app.plans.jsx", "utf8"));
    expect(src).toMatch(/own AI key/i);
    expect(src).toMatch(/no credits/i);
  });

  it("the Settings card says it too, in bold, not in a help article", () => {
    const src = unwrapT(readFileSync("app/routes/app.settings.jsx", "utf8"));
    expect(src).toMatch(/doesn(&apos;|')t count against your monthly/i);
  });

  it("04-DECISIONS.md recorded the decision before the code", () => {
    const src = unwrapT(readFileSync("docs/navaal/04-DECISIONS.md", "utf8"));
    expect(src).toMatch(/BYO KEY — DECIDED/);
    expect(src).toMatch(/costs them ZERO credits/i);
  });
});
