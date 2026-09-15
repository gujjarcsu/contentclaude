#!/usr/bin/env node
/* tools/prospects/recheck.mjs — re-count a prospect's public catalogue before an email is sent.
 *
 *   node tools/prospects/recheck.mjs brbarbados.com [dressmagenta.com ...]
 *
 * PROSPECTS.md rule 4: the counts in the table were true on 2026-09-15; a merchant who fixed their
 * catalogue since and gets an email saying otherwise will not reply twice. This reads the same
 * public surface the table was built from (`/products.json`, paginated at 250, public pages only —
 * nothing is written, nothing is signed in) and prints today's whole-catalogue counts in the same
 * words the table uses. Barcode is not counted: `products.json` does not expose it (PROSPECTS.md).
 *
 * Exit 0 always; a store that refuses the fetch prints `unreachable` and is skipped.
 */
const UA = "Mozilla/5.0 (compatible; navaal-prospect-recheck/1.0; +https://navaal.ai)";
const stripHtml = (s) => String(s || "")
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;|&#\d+;/g, " ")
  .replace(/\s+/g, " ").trim();

async function catalogue(host) {
  const all = [];
  for (let page = 1; page <= 40; page++) {
    const url = `https://${host}/products.json?limit=250&page=${page}`;
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    const j = await r.json();
    const items = Array.isArray(j.products) ? j.products : [];
    all.push(...items);
    if (items.length < 250) break;
  }
  return all;
}

for (const raw of process.argv.slice(2)) {
  const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  let products;
  try { products = await catalogue(host); } catch (e) { console.log(`${host}\tunreachable\t${e.message}`); continue; }
  const n = products.length;
  const shortDesc = products.filter((p) => stripHtml(p.body_html).length < 120).length;
  const noType = products.filter((p) => !String(p.product_type || "").trim()).length;
  const noImage = products.filter((p) => !(Array.isArray(p.images) && p.images.length)).length;
  console.log(`${host}\t${n} products`);
  console.log(`  ${shortDesc} of ${n} products have a description under 120 characters`);
  console.log(`  ${noType} of ${n} products have no product type set`);
  console.log(`  ${noImage} of ${n} products have no image`);
}
