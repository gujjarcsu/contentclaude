/**
 * B4.2 — the storefront Lighthouse impact of the `navaal-geo-schema` theme
 * app extension, as a number, weighted the way Shopify weights it:
 * home 17% · product 40% · collection 43%. Target: under 10 points.
 *
 *   # 1. with the blocks enabled in the theme editor
 *   STORE=navaal-ttv-03 PRODUCT=/products/x COLLECTION=/collections/all LABEL=on  node tools/proof/lighthouse-embed.mjs run
 *   # 2. disable the blocks in the theme editor, then
 *   STORE=navaal-ttv-03 PRODUCT=/products/x COLLECTION=/collections/all LABEL=off node tools/proof/lighthouse-embed.mjs run
 *   # 3. the number
 *   node tools/proof/lighthouse-embed.mjs compare on off
 *
 * A password-protected storefront answers /password to Lighthouse, which
 * measures the password page and calls it 100. Either make the dev store
 * public for the two runs, or pass the storefront's password cookie:
 *   STOREFRONT_COOKIE="storefront_digest=..." — read it from a browser that
 * has entered the password (DevTools → Application → Cookies). Never a
 * commercial storefront: the name-pattern guard refuses.
 *
 * Reads only. Writes tools/proof/out/lh-<label>.json.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

export const WEIGHTS = { home: 0.17, product: 0.4, collection: 0.43 };
const OUT = "tools/proof/out";
const mode = process.argv[2];

const store = process.env.STORE || "";
const guard = /^(navaal-ttv-\d+|navaal-qa-[a-z0-9-]+|contentpilot-dev\d*)$/;

function runOne(url, cookie) {
  const args = [
    "lighthouse",
    url,
    "--quiet",
    "--chrome-flags=--headless=new --no-sandbox",
    "--only-categories=performance",
    "--form-factor=mobile",
    "--output=json",
    "--output-path=stdout",
  ];
  if (cookie) args.push(`--extra-headers=${JSON.stringify({ Cookie: cookie })}`);
  const json = JSON.parse(execFileSync("npx", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" }));
  const score = Math.round((json.categories?.performance?.score ?? 0) * 100);
  const finalUrl = json.finalDisplayedUrl ?? json.finalUrl ?? url;
  return { url, finalUrl, score, passwordPage: /\/password/.test(finalUrl) };
}

if (mode === "run") {
  if (!guard.test(store)) {
    console.error("refusing: STORE must be one of our dev stores by name pattern");
    process.exit(2);
  }
  const label = process.env.LABEL || "run";
  const origin = `https://${store}.myshopify.com`;
  const pages = {
    home: `${origin}/`,
    product: `${origin}${process.env.PRODUCT || "/products"}`,
    collection: `${origin}${process.env.COLLECTION || "/collections/all"}`,
  };
  const cookie = process.env.STOREFRONT_COOKIE || "";
  const result = { store, label, at: new Date().toISOString(), pages: {} };
  for (const [k, url] of Object.entries(pages)) {
    const r = runOne(url, cookie);
    result.pages[k] = r;
    console.log(`${label} ${k.padEnd(10)} ${String(r.score).padStart(3)}  ${r.passwordPage ? "PASSWORD PAGE — not a measurement" : r.finalUrl}`);
  }
  result.weighted = Object.entries(WEIGHTS).reduce((n, [k, w]) => n + w * (result.pages[k]?.score ?? 0), 0);
  result.valid = !Object.values(result.pages).some((p) => p.passwordPage);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/lh-${label}.json`, JSON.stringify(result, null, 2));
  console.log(`weighted ${result.weighted.toFixed(1)} → ${OUT}/lh-${label}.json${result.valid ? "" : "  (INVALID: a password page was measured)"}`);
} else if (mode === "compare") {
  const [a, b] = [process.argv[3], process.argv[4]];
  for (const l of [a, b]) if (!existsSync(`${OUT}/lh-${l}.json`)) throw new Error(`missing ${OUT}/lh-${l}.json`);
  const A = JSON.parse(readFileSync(`${OUT}/lh-${a}.json`, "utf8"));
  const B = JSON.parse(readFileSync(`${OUT}/lh-${b}.json`, "utf8"));
  if (!A.valid || !B.valid) {
    console.error("one run measured a password page — not a comparison");
    process.exit(1);
  }
  for (const k of Object.keys(WEIGHTS)) console.log(`${k.padEnd(10)} ${a}=${A.pages[k].score}  ${b}=${B.pages[k].score}  Δ=${B.pages[k].score - A.pages[k].score}`);
  const delta = B.weighted - A.weighted;
  console.log(`weighted ${a}=${A.weighted.toFixed(1)} ${b}=${B.weighted.toFixed(1)} → impact of the blocks: ${(-delta).toFixed(1)} points (target < 10)`);
  process.exit(Math.abs(delta) < 10 ? 0 : 1);
} else {
  console.error("usage: run | compare <labelA> <labelB>");
  process.exit(2);
}
