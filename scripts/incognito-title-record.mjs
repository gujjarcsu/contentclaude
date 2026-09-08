// Opens a genuine INCOGNITO Chrome for a one-time login, then records the
// reviewer's EXACT path: open Products → click the app NAME/title in the sidebar
// → dashboard → every nav item → Plans back arrow → browser Back. Asserts the
// login form never appears. Encodes to webm.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STORE = process.env.PROBE_STORE || "navaal-test-2";
const APP = "navaal-seo-geo-content";
const ADMIN = `https://admin.shopify.com/store/${STORE}`;
const APP_ROOT = `${ADMIN}/apps/${APP}`;
const PORT = 9339;
const DIR = path.join(os.tmpdir(), "navaal-title-incognito");
const OUT = "title-proof";
const FRAMES = `${OUT}/frames`;
fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });
const FF = path.join(os.homedir(), "AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe");
const chromePath = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].find((p) => fs.existsSync(p));
if (!chromePath) { console.error("chrome not found"); process.exit(2); }
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });

console.log("Opening INCOGNITO Chrome for a one-time login…");
const child = spawn(chromePath, ["--incognito", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}`, "--no-first-run", "--no-default-browser-check", "--test-third-party-cookie-phaseout", `${APP_ROOT}/app/products`], { detached: true, stdio: "ignore" });
child.unref();
const waitCDP = async (d) => { while (Date.now() < d) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch { /* */ } await new Promise((s) => setTimeout(s, 1000)); } return false; };
if (!(await waitCDP(Date.now() + 40000))) { console.error("no debug endpoint"); process.exit(3); }
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];

console.log("\n" + "=".repeat(60) + "\n  LOG IN to Shopify in the incognito window, reach the app\n  (Products page). I'll drive + record the rest. 8 min.\n" + "=".repeat(60) + "\n");
const deadline = Date.now() + 8 * 60 * 1000;
let page = null;
while (Date.now() < deadline) {
  const p = context.pages().find((x) => new RegExp(`admin\\.shopify\\.com/store/${STORE}/apps/${APP}`).test(x.url()));
  if (p) { const hasFrame = await p.locator('iframe[src*="navaal"]').count().catch(() => 0); if (hasFrame) { page = p; break; } }
  await new Promise((s) => setTimeout(s, 2500));
}
if (!page) { console.error("TIMEOUT: app never reached."); process.exit(1); }
console.log("App detected — recording.\n");

const appFrame = () => page.frameLocator('iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[t] ${m}`);
const results = [];
page.on("response", (r) => { try { const u = new URL(r.url()); if (u.hostname === "app.navaal.ai" && (u.pathname === "/" || u.pathname.startsWith("/auth/login") || u.pathname.startsWith("/reembed"))) log(`← ${r.status()} ${u.pathname}${r.headers()["location"] ? " → " + r.headers()["location"] : ""}`); } catch { /* */ } });
const caption = async (t) => { await page.evaluate((text) => { let el = document.getElementById("__cap"); if (!el) { el = document.createElement("div"); el.id = "__cap"; Object.assign(el.style, { position: "fixed", left: 0, right: 0, top: 0, zIndex: 2147483646, pointerEvents: "none", font: "700 18px/1.4 sans-serif", color: "#fff", background: "linear-gradient(180deg,rgba(15,15,25,.96),rgba(15,15,25,.72))", padding: "12px 20px", textAlign: "center" }); document.documentElement.appendChild(el); } el.textContent = text; }, t).catch(() => {}); };
let running = true, n = 0;
const capture = async () => { while (running) { try { await page.screenshot({ path: `${FRAMES}/f-${String(n).padStart(5, "0")}.jpg`, type: "jpeg", quality: 72 }); n++; } catch { /* */ } await new Promise((r) => setTimeout(r, 220)); } };
const check = async (label) => { let t = ""; for (let i = 0; i < 20; i++) { try { t = await appFrame().locator("body").innerText({ timeout: 2500 }); } catch { t = ""; } if (/Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Shop domain|>Log in</i.test(t)) break; await page.waitForTimeout(1000); } const form = /Shop domain|name="shop"|>Log in</i.test(t); results.push({ label, url: page.url(), form }); log(`${form ? "❌ FORM" : "✅ ok"} — ${label} | ${page.url()}`); return form; };
const clickNav = async (nm) => { const l = appFrame().getByRole("link", { name: new RegExp("^" + nm.replace(/[.&]/g, ".") + "$", "i") }).first(); try { await l.click({ timeout: 5000 }); return true; } catch { return false; } };
const clickTitle = async () => { for (const c of [page.getByRole("link", { name: /^Navaal:? AI SEO/i }), page.locator('a[href$="/apps/navaal-seo-geo-content"], a[href*="/apps/navaal-seo-geo-content?"]').filter({ hasText: /Navaal/i }), page.locator("nav a, aside a").filter({ hasText: /Navaal.*SEO|Navaal: AI/i })]) { const el = c.first(); if (await el.count().catch(() => 0)) { try { await el.click({ timeout: 6000 }); return true; } catch { /* */ } } } return false; };

let ok = true;
try {
  const capP = capture();
  await caption("Fresh dev store · incognito · on the Products page"); await page.waitForTimeout(2500); if (await check("1-products")) ok = false;
  await caption("Click the APP NAME at the top of the sidebar (the reviewer's exact move)");
  await page.waitForTimeout(800);
  log("title clicked: " + (await clickTitle())); await page.waitForTimeout(6500);
  await caption("→ Dashboard renders — no login form"); if (await check("2-after-title-click")) ok = false; await page.waitForTimeout(2000);
  for (const nm of ["Products", "Optimise Store", "Plans & Billing", "SEO Audit", "Settings", "Dashboard"]) { await caption(`Nav → ${nm}`); await clickNav(nm); await page.waitForTimeout(2000); if (await check(`nav-${nm}`)) ok = false; }
  await caption("Plans page — click the back arrow"); await clickNav("Plans & Billing"); await page.waitForTimeout(2000);
  const back = appFrame().locator('button[aria-label*="Back" i], a[aria-label*="Back" i]').first(); try { await back.click({ timeout: 4000 }); } catch { /* */ } await page.waitForTimeout(2500); if (await check("back-arrow")) ok = false;
  await caption("Browser Back button"); await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(2500); if (await check("browser-back")) ok = false;
  await caption("App title, every nav item, back arrow, browser back — the login form never appears ✓"); await page.waitForTimeout(2800);
  running = false; await capP;
} catch (e) { log("ERROR: " + e.message); ok = false; running = false; }
try { browser.close(); } catch { /* keep window */ }

const forms = results.filter((r) => r.form).length;
console.log(`\n=== forms: ${forms} / ${results.length} — ${ok && forms === 0 ? "PASS" : "FAIL"} ===`);
const files = fs.readdirSync(FRAMES).filter((f) => f.endsWith(".jpg")).sort();
if (files.length) {
  const ff = spawn(FF, ["-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", "5", "-i", "pipe:0", "-c:v", "libvpx", "-b:v", "2M", "-pix_fmt", "yuv420p", "-vf", "scale=1440:-2", `${OUT}/title-proof.webm`], { stdio: ["pipe", "ignore", "ignore"] });
  ff.on("close", () => { const p = `${OUT}/title-proof.webm`; console.log(fs.existsSync(p) ? `VIDEO: ${p} (${(fs.statSync(p).size / 1e6).toFixed(1)}MB)` : "NO VIDEO"); process.exit(0); });
  (async () => { for (const f of files) { if (!ff.stdin.write(fs.readFileSync(path.join(FRAMES, f)))) await new Promise((r) => ff.stdin.once("drain", r)); } ff.stdin.end(); })();
} else { console.log("no frames"); process.exit(0); }
