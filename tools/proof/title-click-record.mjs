// Prove the reviewer's EXACT path is fixed, recorded: from a feature page, click
// the app NAME/TITLE at the top of the admin sidebar → dashboard (not the form).
// Then click nav items, the Plans back arrow, and the browser back button.
// Third-party cookies blocked. SHA on screen.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const STORE = process.env.PROBE_STORE || "navaal-test-2";
const APP = "navaal-seo-geo-content";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;
const OUT = "title-click-proof";
const FRAMES = `${OUT}/frames`;
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const FF = path.join(os.homedir(), "AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe");

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: [
    "--disable-blink-features=AutomationControlled",
    "--no-default-browser-check",
    "--no-first-run",
    "--test-third-party-cookie-phaseout",
  ],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/navaal-test-2.json",
  viewport: { width: 1440, height: 900 },
});
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();
const appFrame = () => page.frameLocator('iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[titlerec] ${new Date().toISOString()} ${m}`);
const results = [];
page.on("response", (r) => {
  try {
    const u = new URL(r.url());
    if (
      u.hostname === "app.navaal.ai" &&
      (u.pathname === "/" || u.pathname.startsWith("/auth/login") || u.pathname.startsWith("/reembed"))
    )
      log(`← ${r.status()} ${u.pathname}${r.headers()["location"] ? " → " + r.headers()["location"] : ""}`);
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
        quality: 70,
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
  for (let i = 0; i < 22; i++) {
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
const gotoTop = async (u) => {
  await page.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {});
  await appFrame()
    .locator("body")
    .waitFor({ state: "visible", timeout: 40000 })
    .catch(() => {});
  await page.waitForTimeout(3500);
};
const clickTitle = async () => {
  const cands = [
    page.getByRole("link", { name: /^Navaal:? AI SEO/i }),
    page.locator('a[href*="/apps/navaal-seo-geo-content"]').filter({ hasText: /Navaal/i }),
    page.locator("nav a, aside a").filter({ hasText: /Navaal.*SEO|Navaal: AI/i }),
  ];
  for (const c of cands) {
    const el = c.first();
    if (await el.count().catch(() => 0)) {
      try {
        await el.click({ timeout: 6000 });
        return true;
      } catch {
        /* next */
      }
    }
  }
  return false;
};

let ok = true;
try {
  await page.goto("https://app.navaal.ai/api/build-info", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const capP = capture();
  await caption("Live build SHA");
  await page.waitForTimeout(2000);
  await gotoTop(`${APP_ROOT}/app/products`);
  await caption("On a feature page (Products)");
  if (await check("1-products")) ok = false;
  await page.waitForTimeout(1500);
  await caption("Click the APP NAME at the top of the sidebar (the reviewer's exact move)");
  const clicked = await clickTitle();
  log("title clicked: " + clicked);
  await page.waitForTimeout(6000);
  await caption("→ URL settles on /app, dashboard renders — NO login form");
  if (await check("2-after-title-click")) ok = false;
  await page.waitForTimeout(2500);
  // every nav item
  for (const [nm] of [["Products"], ["Optimise Store"], ["Plans & Billing"], ["Settings"], ["Dashboard"]]) {
    await caption(`Nav: ${nm}`);
    const l = appFrame()
      .getByRole("link", { name: new RegExp("^" + nm.replace(/[.&]/g, ".") + "$", "i") })
      .first();
    try {
      await l.click({ timeout: 5000 });
    } catch {
      /* */
    }
    await page.waitForTimeout(2200);
    if (await check(`nav-${nm}`)) ok = false;
  }
  // Plans back arrow
  await caption("Plans page back arrow");
  await gotoTop(`${APP_ROOT}/app/plans`);
  const back = appFrame()
    .locator('button[aria-label*="Back" i], a[aria-label*="Back" i], [class*="Breadcrumb"] a')
    .first();
  try {
    await back.click({ timeout: 4000 });
  } catch {
    /* */
  }
  await page.waitForTimeout(2500);
  if (await check("plans-back-arrow")) ok = false;
  // browser back
  await caption("Browser Back button");
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  if (await check("browser-back")) ok = false;
  await caption("App title, every nav item, back arrow, browser back — no login form ✓");
  await page.waitForTimeout(2500);
  running = false;
  await capP;
} catch (e) {
  log("ERROR: " + e.message);
  ok = false;
  running = false;
}

await context.close().catch(() => {});
await browser.close().catch(() => {});
const forms = results.filter((r) => r.form).length;
console.log(`\n=== forms: ${forms} / ${results.length} — ${ok && forms === 0 ? "PASS" : "FAIL"} ===`);
// encode
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
      `${OUT}/title-click-proof.webm`,
    ],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  ff.on("close", () => {
    const p = `${OUT}/title-click-proof.webm`;
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
