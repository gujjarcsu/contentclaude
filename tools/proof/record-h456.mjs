// TASK 8 — the three recordings. RUN THIS ON WINDOWS (the device VM has no display).
//   cd C:\Users\PC4\contentclaude
//   node tools\proof\record-h456.mjs h4          (or h5, or h6)
//
// It records the page with Playwright's recordVideo and gets out of your way: you drive the flow,
// it captures the video and a timestamped trail of every URL the page lands on. That matters for
// H6, where the charge approval is YOUR click by design - this script never approves anything.
// It never types an email, password or code either; at the login wall it waits and watches.
//
// The URL bar is NOT in a Playwright recording - the file names say so.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WHICH = (process.argv[2] || "h4").toLowerCase();
const SPEC = {
  h4: { file: "H4-fresh-install-to-first-draft-no-urlbar", budgetMs: 120000,
        what: "fresh install on a dev store -> grant -> first screen -> first draft. Under 120s." },
  h5: { file: "H5-free-store-to-cap-no-urlbar", budgetMs: 0,
        what: "a Free store driven toward its cap: the warning surface, then the 100% card. Then stop." },
  h6: { file: "H6-upgrade-approve-cancel-no-urlbar", budgetMs: 0,
        what: "100% card -> Upgrade -> Shopify's approval page -> YOU click Approve (dev store, Test charge) -> back in the app -> cancel that test subscription." },
}[WHICH];
if (!SPEC) { console.error("usage: node tools\\proof\\record-h456.mjs h4|h5|h6"); process.exit(1); }

const OUT = path.join(process.cwd(), "docs/history/recordings");
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(process.cwd(), "docs/history/_pw-profile");

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  args: ["--no-first-run", "--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());

const t0 = Date.now();
const trail = [];
let tabSeq = 0;
const mark = (u, tab) => {
  const e = { atMs: Date.now() - t0, tab, url: String(u).slice(0, 160) };
  trail.push(e);
  console.log(`  [${(e.atMs / 1000).toFixed(1)}s] (tab${tab}) ${e.url}`);
};
// Trail EVERY page, not just the first. A Shopify install opens the app in a NEW tab, so a
// first-page-only trail stops dead at the App Store URL and the whole flow goes unrecorded.
const attach = (p) => {
  const myTab = ++tabSeq;
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) mark(f.url(), myTab); });
  p.on("close", () => console.log(`  (tab${myTab} closed)`));
  return myTab;
};
attach(page);
ctx.on("page", async (p) => {
  const n = attach(p);
  console.log(`  -> new tab${n} opened`);
  try { await p.waitForLoadState("domcontentloaded", { timeout: 15000 }); mark(p.url(), n); } catch {}
});

console.log(`\n  ${WHICH.toUpperCase()} - ${SPEC.what}`);
console.log(`  Recording to ${OUT}`);
console.log(`  Drive the flow yourself. This script only watches and records.`);
if (SPEC.budgetMs) console.log(`  Budget: ${SPEC.budgetMs / 1000}s - the clock starts at the first app URL.`);
console.log(`  At the login wall, sign in yourself. Close the window when the flow is done.\n`);

await page.goto("https://admin.shopify.com/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

// Wait until the window is closed. Nothing is clicked for you.
await new Promise((resolve) => {
  ctx.on("close", resolve);
  page.on("close", resolve);
});

// The clock must start at the install boundary, not at the first app URL the take happens to hit.
// A take that wanders - switching stores, or uninstalling and reinstalling mid-recording - has more
// than one app segment, and bracketing it end to end measures the wandering, not the flow.
const isApp = (u) => /app\.navaal\.ai|\/apps\/navaal/i.test(u);
const isInstallBoundary = (u) => /settings\/apps|\/oauth\/|\/grant|app_installations/i.test(u);
const lastMs = trail.length ? trail[trail.length - 1].atMs : 0;
const lastBoundary = [...trail].reverse().find((e) => isInstallBoundary(e.url));
const clockStart = trail.find((e) => isApp(e.url) && (!lastBoundary || e.atMs > lastBoundary.atMs));
const appSegments = trail.filter((e) => isApp(e.url)).length;
const boundariesAfterFirstApp = (() => {
  const fa = trail.find((e) => isApp(e.url));
  return fa ? trail.filter((e) => e.atMs > fa.atMs && isInstallBoundary(e.url)).length : 0;
})();
const mixed = boundariesAfterFirstApp > 0;
const elapsed = clockStart ? lastMs - clockStart.atMs : null;
const report = {
  which: WHICH, what: SPEC.what,
  startedAt: new Date(t0).toISOString(),
  totalMs: lastMs,
  clockStartAtMs: clockStart ? clockStart.atMs : null,
  clockStartUrl: clockStart ? clockStart.url : null,
  elapsedFromClockStartMs: elapsed,
  budgetMs: SPEC.budgetMs || null,
  withinBudget: (SPEC.budgetMs && elapsed !== null && !mixed) ? elapsed <= SPEC.budgetMs : null,
  takeLooksMixed: mixed,
  verdictNote: mixed
    ? "NO VERDICT. This take navigates back through an install boundary AFTER the app was already open, so it contains more than the measured flow - most likely a store switch or an uninstall/reinstall inside the recording. Re-record the flow alone, or read the bracket off the trail by hand."
    : (elapsed === null ? "NO VERDICT: the take never reached an app URL." : "Clock runs from the first app URL after the last install boundary to the last navigation."),
  appSegments,
  note: "Playwright recordVideo does not capture the browser URL bar; the URL trail below is the substitute.",
  trail,
};
fs.writeFileSync(path.join(OUT, `${SPEC.file}.json`), JSON.stringify(report, null, 2));
console.log(`\n  report: docs/history/recordings/${SPEC.file}.json`);
console.log(`  one .webm PER TAB lands in that folder - rename them ${SPEC.file}-tab1.webm, -tab2.webm ...\n`);
await ctx.close();
