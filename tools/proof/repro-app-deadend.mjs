// Forensics for rejection #4: does a cookieless /app document load (the
// reviewer's "reload /app -> blank -> login form") dead-end on the form in
// PRODUCTION? Tests the /app and /app/* routes directly — the path the 2.1.1
// fix did NOT touch (it only fixed / and /auth/login). Follows the full redirect
// chain and reports whether the login form renders.
import { chromium } from "@playwright/test";

const B64 = Buffer.from("q491r2-si.myshopify.com/admin").toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const cases = [
  { name: "A) /app  host+embedded, NO id_token, NO cookie (reviewer reload)", url: `https://app.navaal.ai/app?host=${B64}&embedded=1` },
  { name: "B) /app  bare, no params, no cookie", url: `https://app.navaal.ai/app` },
  { name: "C) /app/plans host+embedded, no cookie", url: `https://app.navaal.ai/app/plans?host=${B64}&embedded=1` },
  { name: "D) /app/settings host+embedded, no cookie", url: `https://app.navaal.ai/app/settings?host=${B64}&embedded=1` },
];

const browser = await chromium.launch({ headless: true });
for (const c of cases) {
  const ctx = await browser.newContext(); // fresh = no cookies (incognito-like)
  const page = await ctx.newPage();
  const chain = [];
  page.on("response", (r) => { const s=r.status(); if (s>=300&&s<400) chain.push(`${s} ${new URL(r.url()).pathname} -> ${r.headers()["location"]||"?"}`); });
  let finalUrl="", hasForm=false, title="", err="", bodySnippet="";
  try {
    await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    finalUrl = page.url();
    const body = await page.content();
    hasForm = /Shop domain|s-text-field|heading="Log in"|>Log in<|name="shop"/i.test(body);
    title = await page.title().catch(()=> "");
    bodySnippet = (await page.locator("body").innerText().catch(()=> "")).replace(/\s+/g," ").slice(0,120);
  } catch (e) { err = e.message; }
  console.log(`\n### ${c.name}`);
  chain.forEach((h)=>console.log(`   ${h}`));
  console.log(`   final: ${finalUrl}`);
  console.log(`   title: ${title}`);
  console.log(`   body:  ${bodySnippet}`);
  console.log(`   LOGIN FORM: ${hasForm ? "YES ❌" : "no ✅"}${err? "  (err: "+err+")":""}`);
  await ctx.close();
}
await browser.close();
process.exit(0);
