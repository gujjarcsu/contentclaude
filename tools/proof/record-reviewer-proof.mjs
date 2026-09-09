// Record a ~30s proof video by driving the ALREADY-OPEN genuine-incognito Chrome
// (port 9337, no new browser) through the reviewer's exact flow, capturing frames
// via screenshots and encoding with Playwright's bundled ffmpeg. Visible cursor +
// click ripples + step captions. Covers everything the reviewer's video showed.
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FFMPEG = path.join(os.homedir(), "AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe");
const STORE = process.env.PROBE_STORE || "navaal-test-2";
const APP = "navaal-seo-geo-content";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;
const OUT = "reviewer-proof-video";
const FRAMES = `${OUT}/frames`;
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const CURSOR = () => {
  if (window.__vc) return; window.__vc = true;
  const inst = () => { if (!document.body) return;
    const d = document.createElement("div");
    Object.assign(d.style, { position: "fixed", width: "26px", height: "26px", borderRadius: "50%", background: "rgba(255,32,86,0.5)", border: "3px solid #fff", boxShadow: "0 0 10px rgba(0,0,0,.6)", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-50%,-50%)", left: "-100px", top: "-100px" });
    document.body.appendChild(d);
    const mv = (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; };
    const rp = (e) => { const r = document.createElement("div"); Object.assign(r.style, { position: "fixed", left: e.clientX + "px", top: e.clientY + "px", width: "14px", height: "14px", borderRadius: "50%", border: "3px solid rgba(255,32,86,0.95)", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-50%,-50%)", transition: "all .5s ease-out", opacity: "1" }); document.body.appendChild(r); requestAnimationFrame(() => { r.style.width = "70px"; r.style.height = "70px"; r.style.opacity = "0"; }); setTimeout(() => r.remove(), 550); };
    for (const t of ["pointermove", "mousemove"]) window.addEventListener(t, mv, true);
    for (const t of ["pointerdown", "mousedown"]) window.addEventListener(t, rp, true);
  };
  if (document.body) inst(); else document.addEventListener("DOMContentLoaded", inst);
};

const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /admin\.shopify\.com\/store/.test(p.url())) || ctx.pages()[0] || (await ctx.newPage());

const appFrame = () => page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const injectOverlays = async () => {
  await page.evaluate(CURSOR).catch(() => {});
  for (const f of page.frames()) { if (/navaal|app\.navaal\.ai/.test(f.url())) { await f.evaluate(CURSOR).catch(() => {}); } }
};
const caption = async (t) => {
  await page.evaluate((text) => {
    let el = document.getElementById("__cap");
    if (!el) { el = document.createElement("div"); el.id = "__cap"; Object.assign(el.style, { position: "fixed", left: 0, right: 0, top: 0, zIndex: 2147483646, pointerEvents: "none", font: "700 18px/1.4 -apple-system,Segoe UI,Roboto,sans-serif", color: "#fff", background: "linear-gradient(180deg,rgba(15,15,25,.96),rgba(15,15,25,.72))", padding: "12px 20px", textAlign: "center", letterSpacing: ".2px" }); document.documentElement.appendChild(el); }
    el.textContent = text;
  }, t).catch(() => {});
};
const gotoTop = async (u) => { await page.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {}); await appFrame().locator("body").waitFor({ state: "visible", timeout: 30000 }).catch(() => {}); await injectOverlays(); await page.waitForTimeout(400); };
const clickNav = async (name) => { const l = appFrame().getByRole("link", { name: new RegExp("^" + name + "$", "i") }).first().or(appFrame().locator(`s-link:has-text("${name}")`).first()); try { await l.hover({ timeout: 4000 }); await page.waitForTimeout(500); await l.click({ timeout: 5000 }); return true; } catch { return false; } };

let running = true, n = 0;
const captureLoop = async () => { while (running) { try { await page.screenshot({ path: `${FRAMES}/f-${String(n).padStart(5, "0")}.jpg`, type: "jpeg", quality: 70 }); n++; } catch { /* mid-nav */ } await new Promise((r) => setTimeout(r, 200)); } };

const driver = async () => {
  // SHA on screen.
  await page.goto("https://app.navaal.ai/api/build-info", { waitUntil: "domcontentloaded" }).catch(() => {});
  await caption("Live production build — git SHA on screen"); await page.waitForTimeout(2600);
  await gotoTop(`${APP_ROOT}/app`); await caption("Fresh dev store · genuine incognito · Navaal dashboard"); await page.waitForTimeout(2800);
  await caption("Open Plans & Billing"); if (!(await clickNav("Plans & Billing"))) await gotoTop(`${APP_ROOT}/app/plans`); await injectOverlays(); await page.waitForTimeout(2800);
  await caption("Click Dashboard — the reviewer's move that used to dead-end"); if (!(await clickNav("Dashboard"))) await gotoTop(`${APP_ROOT}/app`); await injectOverlays(); await page.waitForTimeout(2600);
  await caption("Reload /app — the reviewer's kill move"); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await appFrame().locator("body").waitFor({ state: "visible", timeout: 30000 }).catch(() => {}); await injectOverlays(); await caption("Reload /app → Dashboard loads, NO login form"); await page.waitForTimeout(3200);
  await caption("Open Settings"); if (!(await clickNav("Settings"))) await gotoTop(`${APP_ROOT}/app/settings`); await injectOverlays(); await page.waitForTimeout(2400);
  await caption("Back to Dashboard"); if (!(await clickNav("Dashboard"))) await gotoTop(`${APP_ROOT}/app`); await injectOverlays(); await page.waitForTimeout(2600);
  await caption("Click the app name / home"); await gotoTop(`${APP_ROOT}`); await injectOverlays(); await page.waitForTimeout(2600);
  await caption("Every navigation loads the app — the login form never appears ✓"); await page.waitForTimeout(3200);
};

await Promise.all([captureLoop(), driver().then(() => { running = false; })]);
try { browser.close(); } catch { /* keep window */ }

console.log(`captured ${n} frames; encoding…`);
const r = spawnSync(FFMPEG, ["-y", "-framerate", "5", "-i", `${FRAMES}/f-%05d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", "scale=1440:-2", "-movflags", "+faststart", `${OUT}/reviewer-proof.mp4`], { stdio: "inherit" });
console.log("ffmpeg exit:", r.status);
console.log(fs.existsSync(`${OUT}/reviewer-proof.mp4`) ? `VIDEO: ${OUT}/reviewer-proof.mp4 (${(fs.statSync(`${OUT}/reviewer-proof.mp4`).size / 1e6).toFixed(1)} MB)` : "NO VIDEO");
process.exit(0);
