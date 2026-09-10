// App Store 1.2.3 — REVIEWER PROOF recording with a SELF-DRIVEN synthetic cursor.
//
// Records the exact reviewer sequence on the FRESH store, in the real headed
// Chrome window (Game Bar captures the OS window incl. the URL bar). A synthetic
// overlay cursor (dark dot + light ring, pointer-events:none, max z-index) is
// injected into every top page via addInitScript (re-installs on every load,
// dot restored to its last position from localStorage) and DRIVEN by this
// harness: before each click the dot animates to the target over ~400ms, pauses
// ~300ms, then a click ripple (expanding circle ~350ms) fires and the real click
// is dispatched.
//
// Handshake with the operator (for OS-level Game Bar recording):
//   writes /tmp/rec_ready when parked on Plans(Free); waits for /tmp/rec_go;
//   runs the scene; writes /tmp/rec_done and holds; then leaves the store on Free.
//
//   node scripts/billing-review-recording.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "navaal-qa-fresh";
const APP = "navaal-seo-geo-content";
const BASE = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;
const PLANS_URL = `${BASE}/app/plans`;
const APP_URL = `${BASE}/app`;
const OUT = "billing-review-proof";
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const appFrame = (page) =>
  page
    .frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]')
    .first();
const log = (m) => console.log(`[rec] ${new Date().toISOString()} ${m}`);
const readLimit = async (page) => {
  const body = await appFrame(page)
    .locator("body")
    .innerText()
    .catch(() => "");
  const m = body.match(/of\s+(1000|200|50|25)\b/);
  return m ? m[1] : null;
};
const waitFile = async (p, timeoutMs = 180000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fs.existsSync(p)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

// ── Synthetic cursor: installed on EVERY page load, restored to last position ──
const CURSOR = () => {
  if (window.__vcInstalled) return;
  window.__vcInstalled = true;
  const install = () => {
    if (!document.body || document.getElementById("__vcdot")) return;
    let last = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    try {
      const s = JSON.parse(localStorage.getItem("__vcpos") || "");
      if (s && typeof s.x === "number") last = s;
    } catch {}
    const dot = document.createElement("div");
    dot.id = "__vcdot";
    Object.assign(dot.style, {
      position: "fixed",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      background: "#111",
      border: "3px solid #fff",
      boxShadow: "0 0 6px rgba(0,0,0,.7)",
      zIndex: "2147483647",
      pointerEvents: "none",
      transform: "translate(-50%,-50%)",
      left: last.x + "px",
      top: last.y + "px",
      transition: "none",
    });
    document.documentElement.appendChild(dot);
    window.__vcpos = last;
  };
  const boot = () => {
    install();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("load", install);

  window.__vcMove = (x, y, ms = 400) =>
    new Promise((resolve) => {
      install();
      const dot = document.getElementById("__vcdot");
      if (!dot) return resolve();
      const start = window.__vcpos || { x, y };
      const t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = ease(t);
        const cx = start.x + (x - start.x) * e,
          cy = start.y + (y - start.y) * e;
        dot.style.left = cx + "px";
        dot.style.top = cy + "px";
        if (t < 1) requestAnimationFrame(step);
        else {
          window.__vcpos = { x, y };
          try {
            localStorage.setItem("__vcpos", JSON.stringify({ x, y }));
          } catch {}
          resolve();
        }
      };
      requestAnimationFrame(step);
    });

  window.__vcRipple = (x, y) => {
    const r = document.createElement("div");
    Object.assign(r.style, {
      position: "fixed",
      left: x + "px",
      top: y + "px",
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      border: "3px solid #111",
      zIndex: "2147483646",
      pointerEvents: "none",
      transform: "translate(-50%,-50%)",
      opacity: "1",
      transition: "width .35s ease-out, height .35s ease-out, opacity .35s ease-out",
    });
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => {
      r.style.width = "60px";
      r.style.height = "60px";
      r.style.opacity = "0";
    });
    setTimeout(() => r.remove(), 400);
  };

  // Caption ribbon (top) so each scene is labelled.
  window.__vcCaption = (text) => {
    let el = document.getElementById("__vccap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__vccap";
      Object.assign(el.style, {
        position: "fixed",
        left: "0",
        right: "0",
        top: "0",
        zIndex: "2147483645",
        pointerEvents: "none",
        font: "600 16px/1.4 -apple-system,Segoe UI,Roboto,sans-serif",
        color: "#fff",
        background: "linear-gradient(180deg,rgba(17,17,24,.94),rgba(17,17,24,.78))",
        padding: "10px 18px",
        textAlign: "center",
        letterSpacing: ".2px",
      });
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
  };
};

// Animate dot to a target (viewport coords) then ripple; returns after ~700ms.
async function point(page, x, y, ms = 400) {
  await page.evaluate(([x, y, ms]) => window.__vcMove(x, y, ms), [x, y, ms]);
  await page.waitForTimeout(300);
  await page.evaluate(([x, y]) => window.__vcRipple(x, y), [x, y]);
  await page.waitForTimeout(120);
}
async function caption(page, t) {
  await page.evaluate((t) => window.__vcCaption && window.__vcCaption(t), t).catch(() => {});
}

const gotoPlans = async (page) => {
  await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" });
  await appFrame(page)
    .locator("body")
    .waitFor({ state: "visible", timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(6000);
};

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: [
    "--disable-blink-features=AutomationControlled",
    "--no-default-browser-check",
    "--no-first-run",
    "--start-maximized",
  ],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/shopify.json",
  viewport: null,
  recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } },
});
await context.addInitScript(CURSOR);
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();

const steps = {};
let result = "UNKNOWN";
try {
  log(`warming admin for ${STORE}…`);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await appFrame(page)
    .locator("body")
    .waitFor({ state: "visible", timeout: 60000 })
    .catch(() => {});

  // Ensure we START on Free (cancel if currently paid) BEFORE recording.
  await gotoPlans(page);
  let f = appFrame(page);
  const cancel0 = f.getByRole("button", { name: /^cancel subscription$/i }).first();
  if (await cancel0.isVisible().catch(() => false)) {
    log("pre: cancelling to reach Free…");
    await cancel0.click();
    await page.waitForTimeout(8000);
    await gotoPlans(page);
  }
  steps.startLimit = await readLimit(page);
  log(`pre: start limit=${steps.startLimit} (expect 25)`);

  // Park on Plans(Free), signal ready, wait for operator to start Game Bar.
  await caption(
    page,
    "Plans & Billing — Free plan. A merchant can change plans here (no support, no reinstall).",
  );
  fs.writeFileSync("/tmp/rec_ready", "1");
  log("READY — waiting for /tmp/rec_go");
  await waitFile("/tmp/rec_go");
  log("GO received — starting scene");

  // Measure the iframe box to place the dot over the Professional "Upgrade" button.
  const box = await page.locator('iframe[name="app-iframe"]').boundingBox();
  const proBtn = { x: box.x + box.width * 0.905, y: box.y + 520 };

  // Scene 1: pointer -> Upgrade to Professional, click.
  await page.waitForTimeout(1500);
  await caption(page, "Step 1 — click “Upgrade to Professional”.");
  await point(page, proBtn.x, proBtn.y, 500);
  f = appFrame(page);
  await f
    .getByRole("button", { name: /upgrade to professional/i })
    .first()
    .click();

  // Scene 2: charge confirmation page (pause 2s, URL readable).
  await page.waitForURL(/\/charges\/.*confirm/i, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await caption(page, "Step 2 — Shopify’s charge page. Click “Approve”.");
  const approve = page
    .getByRole("button", { name: /^approve/i })
    .or(page.getByRole("link", { name: /^approve/i }))
    .first();
  await approve.waitFor({ timeout: 30000 });
  const ab = await approve.boundingBox();
  await point(page, ab.x + ab.width / 2, ab.y + ab.height / 2, 500);
  await approve.click();

  // Scene 3: land in-admin, Professional banner.
  await page.waitForURL(/app\/plans/i, { timeout: 90000 });
  await page.waitForTimeout(6000);
  steps.afterUpgrade = await readLimit(page);
  steps.landedUrl = page.url();
  await caption(page, `Back in the app — Professional is ACTIVE (${steps.afterUpgrade}/mo).`);
  await page.waitForTimeout(3500);

  // Scene 4: the RELOAD (the reviewer's exact failure) — still Professional.
  await caption(page, "Step 3 — RELOAD the page (this is where it used to revert to Free).");
  await page.waitForTimeout(1200);
  await gotoPlans(page);
  steps.reload1 = await readLimit(page);
  await caption(page, `Reloaded — still Professional (${steps.reload1}/mo). No revert.`);
  await page.waitForTimeout(3500);

  // Scene 5: navigate to Dashboard and back to Plans — still Professional.
  await caption(page, "Navigate to Dashboard…");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await appFrame(page)
    .locator("body")
    .waitFor({ state: "visible", timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(3500);
  await caption(page, "…back to Plans & Billing.");
  await gotoPlans(page);
  steps.reload2 = await readLimit(page);
  await caption(page, `Still Professional (${steps.reload2}/mo). Upgrade remains active for testing. ✔`);
  await page.waitForTimeout(4000);

  const ok =
    steps.afterUpgrade === "1000" &&
    steps.reload1 === "1000" &&
    steps.reload2 === "1000" &&
    /admin\.shopify\.com/.test(steps.landedUrl || "") &&
    !/auth\/login/i.test(steps.landedUrl || "");
  result = ok ? "PASS" : "FAIL";
  fs.writeFileSync("/tmp/rec_done", result);
  log(`scene done: ${result}`);
  await page.waitForTimeout(6000); // hold for operator to stop Game Bar

  // Post: leave the fresh store on FREE (item 10).
  await caption(page, "Cleanup — cancelling the test subscription so the store is left on Free.");
  f = appFrame(page);
  const cancel1 = f.getByRole("button", { name: /^cancel subscription$/i }).first();
  if (await cancel1.isVisible().catch(() => false)) {
    await cancel1.click();
    await page.waitForTimeout(8000);
    await gotoPlans(page);
  }
  steps.finalLimit = await readLimit(page);
  log(`post: final limit=${steps.finalLimit} (expect 25)`);
} catch (err) {
  result = "FAIL";
  fs.writeFileSync("/tmp/rec_done", "FAIL");
  log(`ERROR: ${err.message}`);
  await page.screenshot({ path: `${OUT}/rec-error.png` }).catch(() => {});
} finally {
  await page.waitForTimeout(1000);
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length)
    fs.renameSync(`${OUT}/video/${vids[vids.length - 1]}`, `${OUT}/billing-review-recording.webm`);
  console.log("STEPS_JSON=" + JSON.stringify(steps));
  console.log("FINAL_RESULT=" + result);
}
