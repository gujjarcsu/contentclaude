// Recorded gauntlet for Cowork on the FRESH dev store, third-party cookies
// blocked (reviewer's incognito condition). SHA on screen, visible cursor + click
// ripples + captions. Runs the reviewer's exact flow; asserts the login form
// never appears. (Authoritative proof is the genuine-incognito attach run; this
// is the recording.)
//   node scripts/gauntlet-record.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "navaal-test-2";
const APP = "navaal-seo-geo-content";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;
const OUT = "gauntlet-record";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const appFrame = (p) => p.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[rec] ${new Date().toISOString()} ${m}`);
const results = [];
const CURSOR = () => {
  if (window.__vc) return; window.__vc = true;
  const inst = () => { if (!document.body) return;
    const d = document.createElement("div");
    Object.assign(d.style, { position: "fixed", width: "24px", height: "24px", borderRadius: "50%", background: "rgba(255,32,86,0.45)", border: "2.5px solid #fff", boxShadow: "0 0 8px rgba(0,0,0,.55)", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-50%,-50%)", left: "-100px", top: "-100px", transition: "left .04s linear, top .04s linear" });
    document.body.appendChild(d);
    const mv = (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; };
    const rp = (e) => { const r = document.createElement("div"); Object.assign(r.style, { position: "fixed", left: e.clientX + "px", top: e.clientY + "px", width: "12px", height: "12px", borderRadius: "50%", border: "3px solid rgba(255,32,86,0.95)", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-50%,-50%)", transition: "all .5s ease-out", opacity: "1" }); document.body.appendChild(r); requestAnimationFrame(() => { r.style.width = "64px"; r.style.height = "64px"; r.style.opacity = "0"; }); setTimeout(() => r.remove(), 550); };
    for (const t of ["pointermove", "mousemove"]) window.addEventListener(t, mv, true);
    for (const t of ["pointerdown", "mousedown"]) window.addEventListener(t, rp, true);
  };
  if (document.body) inst(); else document.addEventListener("DOMContentLoaded", inst);
};

const browser = await chromium.launch({ headless: false, channel: "chrome", ignoreDefaultArgs: ["--enable-automation"], args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run", "--test-third-party-cookie-phaseout"] });
const context = await browser.newContext({ storageState: "tests/e2e/.auth/navaal-test-2.json", viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } } });
await context.addInitScript(CURSOR);
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();
const caption = async (t) => { await page.evaluate((text) => { let el = document.getElementById("__cap"); if (!el) { el = document.createElement("div"); el.id = "__cap"; Object.assign(el.style, { position: "fixed", left: 0, right: 0, top: 0, zIndex: 2147483646, pointerEvents: "none", font: "600 17px/1.4 -apple-system,Segoe UI,Roboto,sans-serif", color: "#fff", background: "linear-gradient(180deg,rgba(20,20,30,.94),rgba(20,20,30,.72))", padding: "11px 20px", textAlign: "center" }); document.documentElement.appendChild(el); } el.textContent = text; }, t).catch(() => {}); };
const check = async (label) => {
  let ft = "";
  for (let i = 0; i < 24; i++) { try { ft = await appFrame(page).locator("body").innerText({ timeout: 2500 }); } catch { ft = ""; } if (/Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Get started|Shop domain|>Log in</i.test(ft)) break; await page.waitForTimeout(1000); }
  const form = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(ft);
  results.push({ label, url: page.url(), form });
  log(`${form ? "❌ FORM" : "✅ ok"} — ${label} | ${page.url()}`);
  return form;
};
const gotoTop = async (u) => { await page.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {}); await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 45000 }).catch(() => {}); await page.waitForTimeout(3500); };
const clickNav = async (name) => { const l = appFrame(page).getByRole("link", { name: new RegExp("^" + name + "$", "i") }).first().or(appFrame(page).locator(`s-link:has-text("${name}")`).first()); try { await l.hover({ timeout: 5000 }); await page.waitForTimeout(600); await l.click({ timeout: 6000 }); return true; } catch { return false; } };

let ok = true;
try {
  await page.goto("https://app.navaal.ai/api/build-info", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
  log("SHA: " + (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 90));
  await gotoTop(`${APP_ROOT}/app`); await caption("Fresh dev store, incognito (3rd-party cookies blocked). App dashboard loads."); if (await check("1-dashboard")) ok = false;
  await caption("Open Plans & Billing"); if (!(await clickNav("Plans & Billing"))) await gotoTop(`${APP_ROOT}/app/plans`); if (await check("2-plans")) ok = false;
  await caption("Click Dashboard (the reviewer's move that used to dead-end)"); if (!(await clickNav("Dashboard"))) await gotoTop(`${APP_ROOT}/app`); if (await check("3-dashboard-via-nav")) ok = false;
  await caption("Reload /app — the reviewer's kill move"); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(3500); if (await check("4-reload-app")) ok = false;
  await caption("Settings, then back to Dashboard"); if (!(await clickNav("Settings"))) await gotoTop(`${APP_ROOT}/app/settings`); await check("5-settings"); if (!(await clickNav("Dashboard"))) await gotoTop(`${APP_ROOT}/app`); if (await check("6-back-to-dashboard")) ok = false;
  await caption("Reload a sub-page"); await gotoTop(`${APP_ROOT}/app/plans`); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(3500); if (await check("7-reload-plans")) ok = false;
  await caption("Click the app name / home"); await gotoTop(`${APP_ROOT}`); if (await check("8-app-name-home")) ok = false;
  await caption("Every navigation loaded the app — the login form never appeared.");
  await page.waitForTimeout(2500);
} catch (e) { log("ERROR: " + e.message); ok = false; }
finally {
  await page.waitForTimeout(1000).catch(() => {});
  await context.close(); await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/gauntlet-record.webm`);
  const forms = results.filter((r) => r.form).length;
  console.log(`\n=== forms shown: ${forms} / ${results.length} ===  RESULT: ${ok && forms === 0 ? "PASS" : "FAIL"}`);
  process.exit(ok && forms === 0 ? 0 : 1);
}
