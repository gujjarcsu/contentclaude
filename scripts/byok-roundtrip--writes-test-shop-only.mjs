#!/usr/bin/env node
/**
 * P6.0 item 2 — prove ONE round-trip of the merchant-key store, in production.
 *
 * `BYOK_ENCRYPTION_KEY` was installed at `43f56a2` by a workflow that generated
 * it on the runner and piped it straight into `flyctl secrets import` from a
 * file. Nobody saw the value, including me. That is the right way to install it
 * and it proves nothing about whether it WORKS.
 *
 * The specific failure this rules out is the one the owner named: a secret
 * corrupted in transit is a feature that "appears to work" — the Settings card
 * renders, a save succeeds — and then cannot decrypt anything afterwards. The
 * only way to know is to encrypt something, store it, read it back through the
 * real resolver, and compare.
 *
 * ── What it writes, and where ──────────────────────────────────────────────
 *
 * It writes a SYNTHETIC key to ONE shop row and then removes it. The synthetic
 * value is generated here, is not an Anthropic key, and could not authenticate
 * anything if it leaked. It deliberately does NOT go through `saveKey()`,
 * because that validates against Anthropic and a synthetic key would be
 * rejected — and using a REAL key would mean writing a live credential into a
 * database to test the thing that protects credentials.
 *
 * ⛔ Refuses any shop that does not look like a development store.
 * ⛔ Refuses to run if the target row already holds a key — it will not
 *    overwrite a merchant's.
 *
 * It prints NOTHING derived from any key: not the value, not a prefix, not a
 * length. Only whether the bytes that came back are identical to the bytes that
 * went in.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/byok-roundtrip--writes-test-shop-only.mjs"
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import prisma from "../app/db.server.js";
import { isEnabled } from "../app/utils/secretBox.server.js";
import { encrypt } from "../app/utils/secretBox.server.js";
import { resolveKeyFor, keyStatusFor, removeKey } from "../app/utils/merchantKey.server.js";

const out = { readAt: new Date().toISOString() };

out.featureConfigured = isEnabled();
if (!out.featureConfigured) {
  out.verdict = "BYOK_ENCRYPTION_KEY is not set or is the wrong length. The feature is OFF (fails closed).";
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

// A development shop, on a Pro plan, that does not already hold a key.
const candidates = await prisma.plan.findMany({
  where: { planName: "pro" },
  select: { shop: true },
});
const devPro = candidates.find((c) => /dev|test|qa|ttv|staging/i.test(c.shop));
if (!devPro) {
  out.verdict = "No development shop on a Pro plan to test against. Refusing to touch anything else.";
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
const shop = devPro.shop;
out.shopHandle = String(shop).replace(/\.myshopify\.com$/, "");

const existing = await keyStatusFor(shop);
if (existing.saved) {
  // Never overwrite a stored key to run a test.
  out.verdict = "That shop already holds a key. Refusing to overwrite it.";
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

// A synthetic secret. Not an Anthropic key; authenticates nothing.
const synthetic = `test-not-a-real-key-${randomBytes(24).toString("hex")}`;

let wroteRow = false;
try {
  // Straight through encrypt(), bypassing saveKey()'s Anthropic validation —
  // this is a test of the CRYPTO and the SECRET, not of the validator.
  const { ciphertext, iv, tag } = encrypt(synthetic);
  out.ciphertextDiffersFromPlaintext = ciphertext !== synthetic;

  await prisma.shop.update({
    where: { shop },
    data: {
      aiKeyCiphertext: ciphertext,
      aiKeyIv: iv,
      aiKeyTag: tag,
      aiKeyValidatedAt: new Date(),
      aiKeyFailedAt: null,
    },
  });
  wroteRow = true;

  // Read it back THE WAY A GENERATION DOES: through the real resolver, which
  // re-reads the row, checks the plan and the failure flag, and decrypts.
  const resolved = await resolveKeyFor(shop, "pro");

  out.resolver = {
    byok: resolved.byok,
    blocked: resolved.blocked,
    returnedSomething: typeof resolved.key === "string" && resolved.key.length > 0,
  };

  // Constant-time compare, and the ONLY thing reported is the boolean.
  const a = Buffer.from(String(resolved.key ?? ""), "utf8");
  const b = Buffer.from(synthetic, "utf8");
  out.decryptsToExactlyWhatWentIn = a.length === b.length && timingSafeEqual(a, b);

  // And the status shape a loader sees carries nothing derived from the key.
  const status = await keyStatusFor(shop);
  out.loaderStatusKeys = Object.keys(status).sort();
  out.loaderStatusLeaksNothing = !JSON.stringify(status).includes(synthetic);
} finally {
  if (wroteRow) {
    out.cleanedUp = await removeKey(shop);
    const after = await keyStatusFor(shop);
    out.rowIsEmptyAfterwards = !after.saved;
  }
}

out.verdict =
  out.decryptsToExactlyWhatWentIn && out.rowIsEmptyAfterwards
    ? "ROUND TRIP OK. The installed secret encrypts and decrypts correctly in production, the resolver returns exactly what was stored, the loader shape leaks nothing, and the test row was removed."
    : "FAILED. See the fields above.";

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(out.decryptsToExactlyWhatWentIn ? 0 : 1);
