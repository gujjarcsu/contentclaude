// Install Navaal on a DEV store starting from an App Store SEARCH, exactly the
// way a merchant does — so Shopify appends surface_type/surface_detail/… to the
// install URL and the app's install tracker (brief item 2) records them. Logs
// every navigation (top page + app iframe) so the surface params are visible
// in the evidence, and screenshots each step.
//
//   PROBE_STORE=navaal-qa-fresh SEARCH_QUERY="navaal seo" node scripts/store-install-from-appstore.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "navaal-qa-fresh";
const LISTING_HANDLE = "navaal-ai-seo-geo-content";
const APP_HANDLE = "navaal-seo-geo-content";
const QUERY = process.env.SEARCH_QUERY || "navaal seo";
const OUT = process.env.OUT_DIR || "proof-items12";
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[install] ${new Date().toISOString()} ${m}`);

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({ storageState: "tests/e2e/.auth/shopify.json", viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
let page = await context.newPage();
const navs = [];
page.on("framenavigated", (f) => {
  const u = f.url();
  if (!u || u === "about:blank") return;
  navs.push({ t: new Date().toISOString(), frame: f === page.mainFrame() ? "top" : "iframe", url: u });
  if (/surface_|app\.navaal\.ai/.test(u)) log(`${f === page.mainFrame() ? "TOP" : "IFRAME"} → ${u.slice(0, 300)}`);
});
let step = 0;
const shot = async (name) => { step++; await page.screenshot({ path: `${OUT}/install-${String(step).padStart(2, "0")}-${name}.png` }).catch(() => {}); };
const clickFirst = async (locators, label) => {
  for (const l of locators) {
    try { await l.waitFor({ state: "visible", timeout: 8000 }); await l.click(); log(`clicked: ${label}`); return true; } catch { /* next */ }
  }
  log(`NOT FOUND: ${label}`);
  return false;
};

let ok = false;
try {
  // 1. App Store search
  await page.goto(`https://apps.shopify.com/search?q=${encodeURIComponent(QUERY)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await shot("search");
  // 2. Click our listing from the results (this is what carries surface_type=search)
  const listingLink = page.locator(`a[href*="/${LISTING_HANDLE}"]`).first();
  await listingLink.waitFor({ state: "visible", timeout: 30000 });
  const href = await listingLink.getAttribute("href");
  log("listing href from search: " + href);
  await listingLink.click();
  await page.waitForTimeout(4000);
  await shot("listing");
  log("listing url: " + page.url());

  // 3. Install from the listing. Dismiss the cookie banner first; the Install
  // link may open a NEW TAB — follow it if so.
  await page.getByRole("button", { name: /accept cookies/i }).first().click({ timeout: 3000 }).catch(() => {});
  const newPagePromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  await clickFirst([
    page.getByRole("link", { name: /^install$/i }).first(),
    page.getByRole("button", { name: /^install$/i }).first(),
    page.locator('a[href*="/install"]').first(),
  ], "Install (listing)");
  const newPage = await newPagePromise;
  if (newPage) {
    log("install opened a new tab — following it");
    page = newPage;
    page.on("framenavigated", (f) => {
      const u = f.url();
      if (!u || u === "about:blank") return;
      navs.push({ t: new Date().toISOString(), frame: f === page.mainFrame() ? "top" : "iframe", url: u });
      if (/surface_|app.navaal.ai/.test(u)) log(`${f === page.mainFrame() ? "TOP" : "IFRAME"} → ${u.slice(0, 300)}`);
    });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
  }
  await page.waitForTimeout(5000);
  await shot("after-install-click");
  log("url: " + page.url());

  // 4. Store picker (account has several dev stores) — pick ours if shown.
  if (/accounts\.shopify\.com|select|stores/i.test(page.url()) || (await page.getByText(new RegExp(STORE, "i")).count()) > 0) {
    await clickFirst([
      page.getByRole("link", { name: new RegExp(STORE, "i") }).first(),
      page.getByRole("button", { name: new RegExp(STORE, "i") }).first(),
      page.getByText(new RegExp(`^${STORE}`, "i")).first(),
    ], `store ${STORE}`);
    await page.waitForTimeout(5000);
    await shot("store-picked");
    log("url: " + page.url());
  }

  // 5. Admin install/consent page → Install
  for (let i = 0; i < 2; i++) {
    const done = await clickFirst([
      page.getByRole("button", { name: /^install( app)?$/i }).first(),
      page.getByRole("link", { name: /^install( app)?$/i }).first(),
    ], "Install (admin consent)");
    await page.waitForTimeout(6000);
    await shot(`consent-${i + 1}`);
    log("url: " + page.url());
    if (!done) break;
    if (new RegExp(`/store/${STORE}/apps/${APP_HANDLE}`).test(page.url())) break;
  }

  // 6. App loaded inside the admin?
  const appFrame = page.frameLocator('iframe[name^="app-iframe"], iframe[src*="app.navaal.ai"]').first();
  await appFrame.locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await shot("app-loaded");
  const iframeUrls = navs.filter((n) => n.frame === "iframe" && /app\.navaal\.ai/.test(n.url)).map((n) => n.url);
  const withSurface = iframeUrls.find((u) => /surface_type|surface_detail/.test(u));
  log("app iframe url(s):\n  " + iframeUrls.slice(0, 6).join("\n  "));
  ok = new RegExp(`/store/${STORE}/apps/${APP_HANDLE}`).test(page.url()) && iframeUrls.length > 0;
  fs.writeFileSync(`${OUT}/install-navigations.json`, JSON.stringify({ store: STORE, query: QUERY, listingHref: href, finalUrl: page.url(), surfaceParamsSeen: !!withSurface, navs }, null, 2));
  log(`surface params seen on the app URL: ${!!withSurface}`);
} catch (e) {
  log("ERROR " + e.message);
  await shot("error");
  fs.writeFileSync(`${OUT}/install-navigations.json`, JSON.stringify({ store: STORE, error: e.message, navs }, null, 2));
} finally {
  await context.close(); await browser.close();
  console.log(`INSTALL_RESULT=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
