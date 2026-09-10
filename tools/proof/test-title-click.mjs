// Reproduce the reviewer's EXACT path on the genuine-incognito window: from a
// feature page, click the app NAME/TITLE at the top of the admin sidebar (which
// Shopify points at "/"), and confirm it lands on the dashboard — not the login
// form. Captures the "/" request so we can see host presence and the response.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "navaal-test-2";
const APP = "navaal-seo-geo-content";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;
const OUT = "title-click";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /admin\.shopify\.com\/store/.test(p.url())) || ctx.pages()[0];
const appFrame = () => page.frameLocator('iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[title] ${m}`);

// Log every navaal-domain request/response so we can SEE the "/" hit.
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.hostname === "app.navaal.ai")
    log(
      `→ ${r.method()} ${u.pathname}${u.search ? " [" + [...u.searchParams.keys()].join(",") + "]" : " [no params]"}`,
    );
});
page.on("response", (r) => {
  const u = new URL(r.url());
  if (
    u.hostname === "app.navaal.ai" &&
    (u.pathname === "/" || u.pathname.startsWith("/auth") || u.pathname.startsWith("/reembed"))
  )
    log(`← ${r.status()} ${u.pathname}${r.headers()["location"] ? " → " + r.headers()["location"] : ""}`);
});

const readForm = async () => {
  const t = await appFrame()
    .locator("body")
    .innerText()
    .catch(() => "");
  return /Shop domain|>Log in<|name="shop"/i.test(t)
    ? "LOGIN FORM"
    : /Welcome back|Monthly Usage|Choose Your Plan|Brand voice/i.test(t)
      ? "APP"
      : "?";
};

try {
  log("open a feature page (Products)…");
  await page.goto(`${APP_ROOT}/app/products`, { waitUntil: "domcontentloaded" });
  await appFrame()
    .locator("body")
    .waitFor({ state: "visible", timeout: 40000 })
    .catch(() => {});
  await page.waitForTimeout(4000);
  log("on: " + page.url());

  // Click the APP TITLE in the admin sidebar (top page, NOT the iframe).
  log("locating the app title in the admin sidebar…");
  const title = page
    .getByRole("link", { name: /Navaal:? AI SEO/i })
    .first()
    .or(
      page
        .locator('nav a, aside a, [class*="nav"] a')
        .filter({ hasText: /Navaal/i })
        .first(),
    );
  const found = await title.count().catch(() => 0);
  log("title link candidates: " + found);
  await page.screenshot({ path: `${OUT}/before-title-click.png` }).catch(() => {});
  if (found > 0) {
    await title.click({ timeout: 8000 }).catch((e) => log("click err: " + e.message));
  } else {
    log("title link not found by role/text — navigating app root URL as fallback");
    await page.goto(APP_ROOT, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  await page.waitForTimeout(7000);
  log("after title click → url: " + page.url());
  log("app frame shows: " + (await readForm()));
  await page.screenshot({ path: `${OUT}/after-title-click.png` }).catch(() => {});
} catch (e) {
  log("ERROR: " + e.message);
}
try {
  browser.close();
} catch {
  /* keep */
}
process.exit(0);
