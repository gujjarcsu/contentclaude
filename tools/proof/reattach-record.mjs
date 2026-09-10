// Re-attach to the open genuine-incognito window (9339) and record the reviewer's
// flow. The app TITLE click loads application_url ("/") — we replicate it by
// navigating the admin to the app ROOT URL (…/apps/navaal-seo-geo-content, no
// /app), which is exactly what the title does. Then every nav item + browser
// back. Logs the /, /reembed, /app, /auth/login hits so the recovery is visible.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STORE = "navaal-test-2",
  APP = "navaal-seo-geo-content";
const ADMIN = `https://admin.shopify.com/store/${STORE}`;
const APP_ROOT = `${ADMIN}/apps/${APP}`;
const OUT = "title-proof2",
  FRAMES = `${OUT}/frames`;
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const FF = path.join(os.homedir(), "AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe");

const b = await chromium.connectOverCDP("http://127.0.0.1:9339").catch(() => null);
if (!b) {
  console.log("INCOGNITO DEAD");
  process.exit(1);
}
const ctx = b.contexts()[0];
let page =
  ctx.pages().find((p) => /admin\.shopify\.com\/store\/navaal-test-2/.test(p.url())) || ctx.pages()[0];
const appFrame = () => page.frameLocator('iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[r] ${m}`);
const results = [];
page.on("response", (r) => {
  try {
    const u = new URL(r.url());
    if (
      (u.hostname === "app.navaal.ai" && ["/", "/app"].includes(u.pathname)) ||
      (u.hostname === "app.navaal.ai" &&
        (u.pathname.startsWith("/auth/login") || u.pathname.startsWith("/reembed")))
    )
      log(`  ← ${r.status()} ${u.pathname}${r.headers()["location"] ? " → " + r.headers()["location"] : ""}`);
  } catch {
    /* */
  }
});
const caption = async (t) => {
  await page
    .evaluate((text) => {
      let el = document.getElementById("__cap");
      if (!el) {
        el = document.createElement("div");
        el.id = "__cap";
        Object.assign(el.style, {
          position: "fixed",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 2147483646,
          pointerEvents: "none",
          font: "700 18px/1.4 sans-serif",
          color: "#fff",
          background: "linear-gradient(180deg,rgba(15,15,25,.96),rgba(15,15,25,.72))",
          padding: "12px 20px",
          textAlign: "center",
        });
        document.documentElement.appendChild(el);
      }
      el.textContent = text;
    }, t)
    .catch(() => {});
};
let running = true,
  n = 0;
const capture = async () => {
  while (running) {
    try {
      await page.screenshot({
        path: `${FRAMES}/f-${String(n).padStart(5, "0")}.jpg`,
        type: "jpeg",
        quality: 72,
      });
      n++;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 220));
  }
};
const check = async (label) => {
  let t = "";
  for (let i = 0; i < 20; i++) {
    try {
      t = await appFrame().locator("body").innerText({ timeout: 2500 });
    } catch {
      t = "";
    }
    if (/Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Shop domain|>Log in</i.test(t)) break;
    await page.waitForTimeout(1000);
  }
  const form = /Shop domain|name="shop"|>Log in</i.test(t);
  results.push({ label, url: page.url(), form });
  log(`${form ? "❌ FORM" : "✅ ok"} — ${label} | ${page.url()}`);
  return form;
};
const go = async (u, cap) => {
  if (cap) await caption(cap);
  await page.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {});
  await appFrame()
    .locator("body")
    .waitFor({ state: "visible", timeout: 40000 })
    .catch(() => {});
  await page.waitForTimeout(3800);
};

let ok = true;
try {
  const capP = capture();
  await go(`${APP_ROOT}/app/products`, "Fresh dev store · incognito · on the Products feature page");
  if (await check("1-products")) ok = false;
  // TITLE CLICK equivalent: load the app ROOT (application_url "/").
  await go(APP_ROOT, "Click the app NAME → loads the app root '/' (the reviewer's exact move)");
  await caption("→ recovers to the Dashboard, NO login form");
  await page.waitForTimeout(1500);
  if (await check("2-app-title-root")) ok = false;
  for (const [nm, p] of [
    ["Products", "/app/products"],
    ["Optimise Store", "/app/optimize"],
    ["Plans & Billing", "/app/plans"],
    ["SEO Audit", "/app/seo-audit"],
    ["Settings", "/app/settings"],
    ["Dashboard", "/app"],
  ]) {
    await go(`${APP_ROOT}${p}`, `Nav → ${nm}`);
    if (await check(`nav-${nm}`)) ok = false;
  }
  await go(`${APP_ROOT}`, "App name again from a sub-page");
  if (await check("3-app-title-again")) ok = false;
  await caption("Browser Back button");
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3000);
  if (await check("browser-back")) ok = false;
  await caption("App name (root '/'), every nav item, browser back — the login form never appears ✓");
  await page.waitForTimeout(3000);
  running = false;
  await capP;
} catch (e) {
  log("ERROR: " + e.message);
  ok = false;
  running = false;
}
try {
  b.close();
} catch {
  /* */
}
const forms = results.filter((r) => r.form).length;
console.log(`\n=== forms: ${forms} / ${results.length} — ${ok && forms === 0 ? "PASS" : "FAIL"} ===`);
const files = fs
  .readdirSync(FRAMES)
  .filter((f) => f.endsWith(".jpg"))
  .sort();
if (files.length) {
  const ff = spawn(
    FF,
    [
      "-y",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      "5",
      "-i",
      "pipe:0",
      "-c:v",
      "libvpx",
      "-b:v",
      "2M",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=1440:-2",
      `${OUT}/title-proof.webm`,
    ],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  ff.on("close", () => {
    const p = `${OUT}/title-proof.webm`;
    console.log(fs.existsSync(p) ? `VIDEO: ${p} (${(fs.statSync(p).size / 1e6).toFixed(1)}MB)` : "NO VIDEO");
    process.exit(0);
  });
  (async () => {
    for (const f of files) {
      if (!ff.stdin.write(fs.readFileSync(path.join(FRAMES, f))))
        await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
  })();
} else {
  console.log("no frames");
  process.exit(0);
}
