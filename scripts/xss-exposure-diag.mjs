#!/usr/bin/env node
/**
 * P0 / A5 — how much stored FAQ content could have been rendered UNESCAPED on a
 * merchant's storefront.
 *
 * `faq_visible.liquid` interpolated AI-generated FAQ text with no `| escape`.
 * Liquid does not auto-escape, so any `<` in that text was live HTML on the
 * merchant's product page, against THEIR customers. Fixed in `7942c30`
 * (2026-09-09 11:26 UTC) and **released to storefronts only on 2026-09-14** as
 * app version `p0-xss-f505584` — the version had not moved since 04:34 UTC on
 * 9 Sep, so the unescaped block was served for five days after the fix existed.
 *
 * The fix protects content rendered from now on. This asks the separate
 * question: **is there content already stored that contains markup?**
 *
 * ── Two blocks, two risks ──────────────────────────────────────────────────
 *
 *   faq_visible.liquid   `{{ qa.name }}` → raw HTML in the page body.
 *   faq_schema.liquid    `<script type="application/ld+json">{{ ... | json }}`
 *                        → a `</script>` inside the JSON closes the tag early and
 *                        everything after it is parsed as HTML. Whether Liquid's
 *                        `json` filter escapes `<` decides that, and this script
 *                        reports the raw finding either way.
 *
 * ── PRIVACY: STRICTER THAN THE OTHER DIAGNOSTICS ───────────────────────────
 *
 * A shop with an XSS exposure is a shop with a vulnerability. This prints
 * **no shop domain and no handle** — not even the stripped handle the other
 * scripts use — only an index, a CLASS (dev or merchant), and counts. It prints
 * no metafield content, ever: reproducing a payload into a CI log is publishing
 * it. The owner can map an index back to a store from the database.
 *
 * READ ONLY. It writes nothing.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/xss-exposure-diag.mjs"
 */
import prisma from "../app/db.server.js";
import { getFreshOfflineSession } from "../app/utils/offlineToken.server.js";

const API_VERSION = "2026-04";
const PAGE = 100;
const MAX_PAGES = 60;

/** A store we own. Anything else is treated as a real merchant. */
const DEV_PATTERN = /dev|test|qa|ttv|staging|app-review|contentpilot|peter-shops|r20bcm/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shopGraphql(session, query, variables, attempt = 0) {
  const res = await fetch(`https://${session.shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 3) throw new Error(`HTTP ${res.status} after retries`);
    await sleep(1000 * 2 ** attempt);
    return shopGraphql(session, query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body?.errors?.[0]?.extensions?.code === "THROTTLED") {
    if (attempt >= 3) throw new Error("throttled after retries");
    await sleep(1000 * 2 ** (attempt + 1));
    return shopGraphql(session, query, variables, attempt + 1);
  }
  if (body?.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

const FAQ_QUERY = `
query faqMetafields($cursor: String) {
  products(first: ${PAGE}, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      metafield(namespace: "contentclaude", key: "faq_schema") { value updatedAt }
    }
  }
}`;

/**
 * Does this string contain markup that would render, or break a script tag?
 *
 * Checks the raw characters AND the entity forms, because `&lt;script&gt;`
 * stored in JSON and then double-decoded is the same problem arriving by a
 * different route. Returns the CATEGORY only — never the text.
 */
function inspect(text) {
  const s = String(text ?? "");
  const findings = [];
  if (/[<>]/.test(s)) findings.push("raw_angle_bracket");
  if (/&lt;|&gt;|&#0*60;|&#0*62;|&#x0*3c;|&#x0*3e;/i.test(s)) findings.push("entity_angle_bracket");
  // The one that matters most for the JSON-LD block: it closes the script tag.
  if (/<\s*\/\s*script/i.test(s)) findings.push("SCRIPT_CLOSE");
  if (/<\s*(script|img|svg|iframe|a\b|on\w+=)/i.test(s)) findings.push("TAG_LIKE");
  return findings;
}

const out = { readAt: new Date().toISOString() };

const shops = (
  await prisma.generatedContent.findMany({ distinct: ["shop"], select: { shop: true } })
).map((r) => r.shop);

const perShop = [];
let metafieldsRead = 0;
let qaPairsChecked = 0;
let shopsUnreachable = 0;
let devHits = 0;
let merchantHits = 0;

for (const [i, shop] of shops.entries()) {
  const isDev = DEV_PATTERN.test(shop);
  const row = { index: i, class: isDev ? "dev" : "MERCHANT" };

  let session = null;
  try {
    session = await getFreshOfflineSession(shop);
  } catch {
    session = null;
  }
  if (!session?.accessToken) {
    shopsUnreachable++;
    row.reachable = false;
    perShop.push(row);
    continue;
  }

  let cursor = null;
  let metafields = 0;
  let pairs = 0;
  const hits = {};
  let affectedProducts = 0;
  let truncated = true;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await shopGraphql(session, FAQ_QUERY, { cursor });
      const conn = data?.products;
      if (!conn) break;
      for (const node of conn.nodes ?? []) {
        const mf = node.metafield;
        if (!mf?.value) continue;
        metafields++;
        let parsed = null;
        try {
          parsed = JSON.parse(mf.value);
        } catch {
          parsed = null;
        }
        const entities = parsed?.mainEntity ?? [];
        let productAffected = false;
        for (const qa of entities) {
          pairs++;
          for (const f of [...inspect(qa?.name), ...inspect(qa?.acceptedAnswer?.text)]) {
            hits[f] = (hits[f] ?? 0) + 1;
            productAffected = true;
          }
        }
        if (productAffected) affectedProducts++;
      }
      if (!conn.pageInfo?.hasNextPage) {
        truncated = false;
        break;
      }
      cursor = conn.pageInfo.endCursor;
    }
  } catch (err) {
    shopsUnreachable++;
    row.reachable = false;
    row.error = String(err.message).slice(0, 60);
    perShop.push(row);
    continue;
  }

  metafieldsRead += metafields;
  qaPairsChecked += pairs;
  const total = Object.values(hits).reduce((a, b) => a + b, 0);
  if (total > 0) {
    if (isDev) devHits += total;
    else merchantHits += total;
  }

  perShop.push({
    ...row,
    reachable: true,
    faqMetafields: metafields,
    qaPairsChecked: pairs,
    truncated,
    affectedProducts,
    findings: total > 0 ? hits : null,
  });
}

out.shopsWithContent = shops.length;
out.shopsUnreachable = shopsUnreachable;
out.faqMetafieldsRead = metafieldsRead;
out.qaPairsChecked = qaPairsChecked;
// THE NUMBERS A5 IS ABOUT.
out.hitsOnDevStores = devHits;
out.hitsOnMerchantStores = merchantHits;
out.perShop = perShop;

out.verdict =
  merchantHits > 0
    ? `ROUTE TO THE OWNER: ${merchantHits} finding(s) on a NON-dev store. See perShop for the index and class; the domain is deliberately not printed.`
    : devHits > 0
      ? `No merchant store affected. ${devHits} finding(s) on development stores — re-normalise those through toPlainText.`
      : `ZERO. ${metafieldsRead} FAQ metafields read across ${shops.length - shopsUnreachable} reachable shops, ${qaPairsChecked} question/answer pairs checked, no angle bracket or entity found in any of them.`;

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
