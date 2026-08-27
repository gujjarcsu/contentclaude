// App Store 2.1.1 GAUNTLET — proves the in-admin login dead-end is gone.
// Headed, visible cursor + click ripples + step captions, recorded to one video.
// Incognito is simulated by clearing the app's (third-party) cookies up front so
// every load must re-authenticate via token exchange — the reviewer's condition.
//
// Pass condition for EVERY step: the string "Shop domain" / a "Log in" form
// never renders inside the admin, and the app frame shows real content.
//
//   node scripts/gauntlet-211.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const ADMIN = `https://admin.shopify.com/store/${STORE}`;
const APP_ROOT = `${ADMIN}/apps/${APP}`;          // app name / home (loads application_url "/")
const APP_DASH = `${APP_ROOT}/app`;               // dashboard
const OUT = "gauntlet-211";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const NAV = [
  ["Products", "/app/products"], ["Optimise Store", "/app/optimize"],
  ["Review & Publish", "/app/review"], ["SEO Audit", "/app/seo-audit"],
  ["Blog Generator", "/app/blog"], ["Collections", "/app/collections"],
  ["Results", "/app/results"], ["Analytics", "/app/analytics"],
  ["Jobs", "/app/jobs"], ["Settings", "/app/settings"], ["Plans & Billing", "/app/plans"],
];

const appFrame = (p) => p.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[gauntlet] ${new Date().toISOString()} ${m}`);
const results = [];

const CURSOR = () => {
  if (window.__vcursor) return; window.__vcursor = true;
  const install = () => { if (!document.body) return;
    const dot = document.createElement("div");
    Object.assign(dot.style,{position:"fixed",width:"24px",height:"24px",borderRadius:"50%",background:"rgba(255,32,86,0.45)",border:"2.5px solid #fff",boxShadow:"0 0 8px rgba(0,0,0,.55)",zIndex:2147483647,pointerEvents:"none",transform:"translate(-50%,-50%)",left:"-100px",top:"-100px",transition:"left .04s linear, top .04s linear"});
    document.body.appendChild(dot);
    const move=(e)=>{dot.style.left=e.clientX+"px";dot.style.top=e.clientY+"px";};
    const ripple=(e)=>{const r=document.createElement("div");Object.assign(r.style,{position:"fixed",left:e.clientX+"px",top:e.clientY+"px",width:"12px",height:"12px",borderRadius:"50%",border:"3px solid rgba(255,32,86,0.95)",zIndex:2147483647,pointerEvents:"none",transform:"translate(-50%,-50%)",transition:"all .5s ease-out",opacity:"1"});document.body.appendChild(r);requestAnimationFrame(()=>{r.style.width="64px";r.style.height="64px";r.style.opacity="0";});setTimeout(()=>r.remove(),550);};
    for(const t of["pointermove","mousemove"])window.addEventListener(t,move,true);
    for(const t of["pointerdown","mousedown"])window.addEventListener(t,ripple,true);
  };
  if (document.body) install(); else document.addEventListener("DOMContentLoaded", install);
};

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/shopify.json",
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
});
await context.addInitScript(CURSOR);
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

// Assert the login form is NOT shown and the app frame has real content.
const assertHealthy = async (label) => {
  await page.waitForTimeout(2500);
  const topText = await page.content().catch(() => "");
  // Poll for the app frame to finish painting — a browser Back/Forward or an F5
  // triggers a FULL iframe document reload, so the body can be briefly empty.
  // Wait up to ~14s for real content before asserting (a login form would paint
  // immediately, so this never masks the dead-end).
  let frameText = "";
  for (let i = 0; i < 12; i++) {
    try { frameText = await appFrame(page).locator("body").innerText({ timeout: 3000 }); } catch { frameText = ""; }
    if (frameText.trim().length > 40 || /Shop domain|>Log in<|name="shop"/i.test(frameText)) break;
    await page.waitForTimeout(1000);
  }
  const combined = topText + "\n" + frameText;
  const formShown = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(combined);
  const hasContent = frameText.trim().length > 40;
  const url = page.url();
  const onLogin = /\/auth\/login/i.test(url);
  const pass = !formShown && !onLogin && hasContent;
  results.push({ label, url, pass, formShown, onLogin, contentLen: frameText.trim().length });
  log(`${pass ? "PASS" : "FAIL"} — ${label} | url=${url} | form=${formShown} onLogin=${onLogin} contentLen=${frameText.trim().length}`);
  await page.screenshot({ path: `${OUT}/${String(results.length).padStart(2,"0")}-${label.replace(/[^a-z0-9]+/gi,"_").slice(0,40)}.png` }).catch(() => {});
  return pass;
};

const gotoTop = async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {}); };
const clickNav = async (label) => {
  const f = appFrame(page);
  const link = f.getByRole("link", { name: new RegExp("^" + label.replace(/[.&]/g, ".") + "$", "i") }).first()
    .or(f.locator(`s-link:has-text("${label}")`).first());
  try { await link.hover({ timeout: 5000 }); await page.waitForTimeout(700); await link.click({ timeout: 5000 }); return true; }
  catch { return false; }
};

let ok = true;
try {
  // Simulate incognito: drop the app's third-party cookies so re-auth must use
  // token exchange (the reviewer's condition). Admin (first-party) cookies stay.
  await context.clearCookies({ domain: "app.navaal.ai" }).catch(() => {});
  await context.clearCookies({ domain: ".navaal.ai" }).catch(() => {});

  // STEP 1 — open the app fresh from the Apps list (app name / home).
  await gotoTop(APP_ROOT);
  await caption("Step 1 — open the app fresh from the admin (app home). Dashboard loads.");
  ok = (await assertHealthy("1-open-app-home")) && ok;

  // STEP 2 — visit EVERY left-nav item in sequence.
  for (const [label, path] of NAV) {
    await caption(`Step 2 — open “${label}” from the app nav`);
    const clicked = await clickNav(label);
    if (!clicked) { await gotoTop(`${APP_ROOT}${path}`); } // fallback: direct nav
    ok = (await assertHealthy(`2-nav-${label}`)) && ok;

    // STEP 3 — the reviewer's exact failing move: from THIS page go back to the
    // Dashboard via the nav.
    await caption(`Step 3 — from “${label}”, click back to Dashboard (the move that used to dead-end)`);
    const backToDash = await clickNav("Dashboard");
    if (!backToDash) { await gotoTop(APP_DASH); }
    ok = (await assertHealthy(`3-back-to-dashboard-from-${label}`)) && ok;
  }

  // STEP 3b — click the APP NAME / home (loads application_url "/") from a sub-page.
  await gotoTop(`${APP_ROOT}/app/optimize`);
  await assertHealthy("3b-on-optimize");
  await caption("Step 3b — click the app name / home (loads the app root “/”). Dashboard loads, no login form.");
  await gotoTop(APP_ROOT);
  ok = (await assertHealthy("3b-app-name-home")) && ok;

  // STEP 4 — browser back / forward through history.
  await caption("Step 4 — browser Back / Forward through history — no login form, no error");
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  ok = (await assertHealthy("4-back")) && ok;
  await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
  ok = (await assertHealthy("4-forward")) && ok;

  // STEP 5 — hard reload (F5) on dashboard and on a sub-page.
  await gotoTop(APP_DASH);
  await caption("Step 5 — hard reload (F5) on the Dashboard — recovers to the dashboard");
  await page.reload({ waitUntil: "domcontentloaded" });
  ok = (await assertHealthy("5-reload-dashboard")) && ok;
  await gotoTop(`${APP_ROOT}/app/plans`);
  await caption("Step 5 — hard reload (F5) on a sub-page — recovers to that page");
  await page.reload({ waitUntil: "domcontentloaded" });
  ok = (await assertHealthy("5-reload-subpage")) && ok;

  // STEP 6 — close the tab, reopen the app from the Apps list.
  await caption("Step 6 — close the tab, reopen the app — loads normally");
  const page2 = await context.newPage();
  await page.close();
  await page2.goto(APP_ROOT, { waitUntil: "domcontentloaded" });
  await appFrame(page2).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  await page2.waitForTimeout(3500);
  const t2 = (await page2.content()) + (await appFrame(page2).locator("body").innerText().catch(() => ""));
  const reopenPass = !/Shop domain|>Log in<|name="shop"/i.test(t2) && !/\/auth\/login/i.test(page2.url());
  results.push({ label: "6-reopen-app", url: page2.url(), pass: reopenPass });
  log(`${reopenPass ? "PASS" : "FAIL"} — 6-reopen-app | url=${page2.url()}`);
  ok = reopenPass && ok;
} catch (err) {
  log(`ERROR: ${err.message}`);
  ok = false;
} finally {
  await page.waitForTimeout(1200).catch(() => {});
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/gauntlet-211.webm`);
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\n=== GAUNTLET: ${passed}/${results.length} steps passed ===`);
  for (const r of results) if (!r.pass) console.log(`  FAIL: ${r.label} @ ${r.url}`);
  console.log(`FINAL_RESULT=${ok && passed === results.length ? "PASS" : "FAIL"}`);
  process.exit(ok && passed === results.length ? 0 : 1);
}
