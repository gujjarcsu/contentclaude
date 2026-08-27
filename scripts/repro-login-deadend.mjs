// Reproduce the 2.1.1 in-admin login dead-end at the routing level.
// Loads the app ROOT with different param shapes and reports the redirect chain
// + whether the "Shop domain" login form renders. No auth/cookies needed — these
// are the public root/auth routes, so this isolates the _index -> auth.login logic.
import { chromium } from "@playwright/test";

const B64 = Buffer.from("contentpilot-dev2.myshopify.com/admin").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const cases = [
  { name: "A) / with host+embedded, NO shop (admin home-nav shape)", url: `https://app.navaal.ai/?host=${B64}&embedded=1` },
  { name: "B) / with shop present", url: `https://app.navaal.ai/?shop=contentpilot-dev2.myshopify.com&host=${B64}&embedded=1` },
  { name: "C) / with NO params at all", url: `https://app.navaal.ai/` },
  { name: "D) /auth/login with host (should auto-recover, no form)", url: `https://app.navaal.ai/auth/login?host=${B64}&embedded=1` },
];

const browser = await chromium.launch({ headless: true });
for (const c of cases) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const chain = [];
  page.on("response", (r) => {
    const s = r.status();
    if (s >= 300 && s < 400) chain.push(`${s} -> ${r.headers()["location"] || "?"}`);
  });
  let finalUrl = "", hasForm = false, err = "";
  try {
    await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    finalUrl = page.url();
    const body = await page.content();
    hasForm = /Shop domain|s-text-field|heading="Log in"|>Log in<|name="shop"/i.test(body);
  } catch (e) { err = e.message; }
  console.log(`\n### ${c.name}`);
  console.log(`   start:  ${c.url}`);
  chain.forEach((h) => console.log(`   ${h}`));
  console.log(`   final:  ${finalUrl}`);
  console.log(`   LOGIN FORM RENDERED: ${hasForm ? "YES ❌" : "no ✅"}${err ? "  (err: " + err + ")" : ""}`);
  await ctx.close();
}
await browser.close();
process.exit(0);
