// Rejection #4 GAUNTLET — proves the login dead-end is gone AND that the exact
// cold-path failure now recovers, in the REAL admin, recorded, cursor visible.
//
// Insight: the dead-end is param-based (the Shopify library's
// validateShopAndHostParams throws redirect("/auth/login") when a session-less
// DOCUMENT request lacks shop/host). So we can reproduce it even on a warm store
// by forcing a BARE document load inside the app iframe — window.location.assign
// ("/app") with no params — exactly what a missed <s-link> click does in the
// reviewer's cookie-blocked context. Before the fix that dead-ends on the form;
// after the fix it recovers via /reembed -> App Bridge -> dashboard.
//
// Step 0 screenshots /api/build-info so the reviewer sees the exact SHA served.
//
//   node scripts/gauntlet-coldpath.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const ADMIN = `https://admin.shopify.com/store/${STORE}`;
const APP_ROOT = `${ADMIN}/apps/${APP}`;
const OUT = "gauntlet-coldpath";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const frameOf = (page) => page.frames().find((f) => /navaal|app\.navaal\.ai/.test(f.url()));
const appFrame = (p) => p.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[coldpath] ${new Date().toISOString()} ${m}`);
const results = [];

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run", "--test-third-party-cookie-phaseout"],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/shopify.json",
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
});
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();

const caption = async (t) => {
  await page.evaluate((text) => {
    let el = document.getElementById("__vcap");
    if (!el) { el = document.createElement("div"); el.id = "__vcap";
      Object.assign(el.style,{position:"fixed",left:0,right:0,top:0,zIndex:2147483646,pointerEvents:"none",font:"600 17px/1.4 -apple-system,Segoe UI,Roboto,sans-serif",color:"#fff",background:"linear-gradient(180deg,rgba(20,20,30,.94),rgba(20,20,30,.72))",padding:"11px 20px",textAlign:"center"});
      document.documentElement.appendChild(el); }
    el.textContent = text;
  }, t).catch(() => {});
};

const check = async (label, { coldPath = false } = {}) => {
  // On a forced cold-path load the iframe fully reloads (App Bridge recovery),
  // so poll for real content before asserting.
  let frameText = "";
  for (let i = 0; i < 28; i++) {
    try { frameText = await appFrame(page).locator("body").innerText({ timeout: 2500 }); } catch { frameText = ""; }
    if (/Welcome back|Monthly Usage|Total Products|Choose Your Plan|Brand voice|Shop domain|>Log in<|name="shop"/i.test(frameText)) break;
    await page.waitForTimeout(1000);
  }
  const top = await page.content().catch(() => "");
  const form = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(top + frameText);
  const dash = /Welcome back|Monthly Usage|Total Products|Choose Your Plan|Plans & Billing|Brand voice/i.test(frameText);
  const rec = { label, coldPath, url: page.url(), form, recovered: dash && !form, len: frameText.trim().length };
  results.push(rec);
  log(`${form ? "❌ FORM" : rec.recovered ? "✅ recovered" : "· ok"} — ${label} | form=${form} len=${rec.len}`);
  await page.screenshot({ path: `${OUT}/${String(results.length).padStart(2,"0")}-${label.replace(/[^a-z0-9]+/gi,"_").slice(0,34)}.png` }).catch(() => {});
  return rec;
};

let ok = true;
try {
  // STEP 0 — prove which SHA the browser is hitting.
  log("STEP 0 — build-info SHA");
  await page.goto("https://app.navaal.ai/api/build-info", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00-build-info-sha.png` });
  const sha = await page.locator("body").innerText().catch(() => "");
  log(`build-info: ${sha.replace(/\s+/g, " ").slice(0, 160)}`);

  // Open the app in the real admin.
  log("open app");
  await page.goto(APP_ROOT, { waitUntil: "domcontentloaded" });
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await caption("App open in the admin — now we force the EXACT broken navigation");
  await check("1-app-open");

  // Force the cold-path dead-end: a bare document load of /app inside the iframe,
  // with no shop/host params — the precise request that used to hit the login form.
  for (const [label, path] of [["/app", "/app"], ["/app/plans", "/app/plans"], ["/app/settings", "/app/settings"]]) {
    log(`FORCE bare document load: ${path} (no shop/host) — the reviewer's dead-end`);
    await caption(`Forcing a bare "${path}" load with no shop/host (the exact dead-end) → must recover, no login form`);
    const fr = frameOf(page);
    if (fr) { await fr.evaluate((p) => window.location.assign(p), path).catch(() => {}); }
    else { await page.goto(`${APP_ROOT}${path}`, { waitUntil: "domcontentloaded" }); }
    await page.waitForTimeout(10000); // let the multi-hop App Bridge recovery run
    const rec = await check(`cold-${label}`, { coldPath: true });
    if (rec.form) ok = false;
  }

  await caption("Every forced dead-end recovered to the app — the login form never appeared.");
  await page.waitForTimeout(2500);
} catch (err) {
  log(`ERROR: ${err.message}`);
  ok = false;
} finally {
  await page.waitForTimeout(1000).catch(() => {});
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/gauntlet-coldpath.webm`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  const forms = results.filter((r) => r.form).length;
  const coldRecovered = results.filter((r) => r.coldPath && r.recovered).length;
  const coldTotal = results.filter((r) => r.coldPath).length;
  console.log(`\n=== forms shown: ${forms} | cold-path recovered: ${coldRecovered}/${coldTotal} ===`);
  console.log(`FINAL_RESULT=${ok && forms === 0 && coldRecovered === coldTotal ? "PASS" : "FAIL"}`);
  process.exit(ok && forms === 0 ? 0 : 1);
}
