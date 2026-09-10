#!/usr/bin/env node
/**
 * Send REAL, correctly-signed Shopify webhook deliveries to production and print
 * what we answer.
 *
 * This is the script that found the 88.5% failure rate. Shopify's Dev Dashboard
 * tells you a topic is failing; it does not tell you why, and Fly's log
 * retention had already rolled past the deliveries. The only way to know was to
 * reproduce a delivery exactly — same HMAC, same headers, same ages — and read
 * the status code back.
 *
 *   fly ssh console -a contentclaude --machine <id> \
 *     -C "node /app/scripts/webhook-probe--writes-fake-shop-only.mjs"
 *
 * It must run ON THE MACHINE: it signs with SHOPIFY_API_SECRET, which only
 * exists there.
 *
 * SAFETY — read this before running it.
 *
 * app/uninstalled and shop/redact DELETE EVERYTHING for the shop in the
 * x-shopify-shop-domain header. So this script refuses to send anything for a
 * domain that is not the probe domain below, which is not a real store and
 * never has been. There is no flag to override that. A probe that can be
 * pointed at a merchant by editing one string is a loaded gun in a runbook.
 *
 * It does write: the GDPR handlers create audit rows for the probe shop. It
 * deletes its own rows on the way out and prints how many.
 */
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/** Not a real store. Not resolvable. The only domain this script will touch. */
const PROBE_SHOP = "navaal-webhook-probe.myshopify.com";
const BASE = (process.env.SHOPIFY_APP_URL || "https://app.navaal.ai").replace(/\/$/, "");
const SECRET = process.env.SHOPIFY_API_SECRET;
const HOUR = 3600_000;

if (!SECRET) {
  console.error("SHOPIFY_API_SECRET is not set — run this on the Fly machine, not a laptop.");
  process.exit(1);
}

const sign = (raw) => createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");

let n = 0;
async function send(label, { topic, path, body = {}, ageMs = 0, webhookId, shop = PROBE_SHOP }) {
  if (shop !== PROBE_SHOP) throw new Error(`refusing to probe ${shop}`);
  const raw = JSON.stringify(body);
  const headers = {
    "content-type": "application/json",
    "x-shopify-hmac-sha256": sign(raw),
    "x-shopify-shop-domain": shop,
    "x-shopify-topic": topic,
    "x-shopify-webhook-id": webhookId ?? `probe-${Date.now()}-${++n}`,
    "x-shopify-api-version": "2026-04",
  };
  // A missing triggered-at is itself a case worth probing, so allow null.
  if (ageMs !== null) headers["x-shopify-triggered-at"] = new Date(Date.now() - ageMs).toISOString();

  const t0 = Date.now();
  let status, text;
  try {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: raw });
    status = res.status;
    text = (await res.text()).slice(0, 40);
  } catch (err) {
    status = 0;
    text = err.message;
  }
  const ms = Date.now() - t0;
  const mark = status === 200 ? " " : "!";
  console.log(
    `${mark} ${String(status).padEnd(4)} ${String(ms).padStart(5)}ms  ${label}${text ? `  ${text}` : ""}`,
  );
  return { status, ms };
}

const UNINSTALL = { topic: "app/uninstalled", path: "/webhooks/app/uninstalled" };
const SCOPES = {
  topic: "app/scopes_update",
  path: "/webhooks/app/scopes_update",
  body: { current: ["write_products"] },
};
const REDACT = {
  topic: "shop/redact",
  path: "/webhooks/shop/redact",
  body: { shop_id: 1, shop_domain: PROBE_SHOP },
};

console.log(`\nProbing ${BASE} as ${PROBE_SHOP}\n`);

console.log("── the retry window (Shopify retries for ~48 h with the ORIGINAL triggered-at)");
await send("fresh", { ...SCOPES });
await send("12 h old", { ...SCOPES, ageMs: 12 * HOUR });
await send("25 h old   <-- 401 before the fix", { ...SCOPES, ageMs: 25 * HOUR });
await send("47 h old   <-- 401 before the fix", { ...SCOPES, ageMs: 47 * HOUR });
await send("no triggered-at header", { ...SCOPES, ageMs: null });

console.log("\n── replay protection is the webhook id, and must still hold");
const id = `probe-dedup-${Date.now()}`;
await send("1st delivery", { ...SCOPES, webhookId: id });
await send("2nd delivery, same id (expect: Duplicate)", { ...SCOPES, webhookId: id });

console.log("\n── the payload/header shop cross-check must still reject a mismatch");
await send("payload names ANOTHER shop (expect 401)", {
  ...UNINSTALL,
  body: { myshopify_domain: "someone-else.myshopify.com" },
});
await send("payload matches the header", { ...UNINSTALL, body: { myshopify_domain: PROBE_SHOP } });

console.log("\n── mandatory compliance topics, at ages that used to be refused");
await send("shop/redact fresh", { ...REDACT });
await send("shop/redact 25 h old", { ...REDACT, ageMs: 25 * HOUR });
await send("shop/redact 47 h old", { ...REDACT, ageMs: 47 * HOUR });
await send("shop/redact 10 days old", { ...REDACT, ageMs: 240 * HOUR });
await send("customers/redact fresh", {
  topic: "customers/redact",
  path: "/webhooks/customers/redact",
  body: { shop_domain: PROBE_SHOP, customer: { id: 1 } },
});
await send("customers/data_request fresh", {
  topic: "customers/data_request",
  path: "/webhooks/customers/data_request",
  body: { shop_domain: PROBE_SHOP, customer: { id: 1 } },
});

// The handlers answer before they finish; give the deferred half a moment so
// the cleanup below sees the rows it is meant to remove.
await new Promise((r) => setTimeout(r, 2000));

const prisma = new PrismaClient();
try {
  // Only the GDPR handlers create rows for a shop that never installed; the
  // Shop delete is belt-and-braces on the exact probe domain and normally 0.
  const gdpr = await prisma.gDPRRequest.deleteMany({ where: { shop: PROBE_SHOP } });
  const shops = await prisma.shop.deleteMany({ where: { shop: PROBE_SHOP } });
  console.log(`\ncleanup: removed ${gdpr.count} GDPRRequest and ${shops.count} Shop probe rows`);
} finally {
  await prisma.$disconnect();
}
