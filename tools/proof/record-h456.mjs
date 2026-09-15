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
const mark = (u) => {
  const e = { atMs: Date.now() - t0, url: String(u).slice(0, 160) };
  trail.push(e);
  console.log(`  [${(e.atMs / 1000).toFixed(1)}s] ${e.url}`);
};
page.on("framenavigated", (f) => { if (f === page.mainFrame()) mark(f.url()); });

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

const firstApp = trail.find((e) => /app\.navaal\.ai|\/apps\/navaal/i.test(e.url));
const lastMs = trail.length ? trail[trail.length - 1].atMs : 0;
const report = {
  which: WHICH, what: SPEC.what,
  startedAt: new Date(t0).toISOString(),
  totalMs: lastMs,
  firstAppUrlAtMs: firstApp ? firstApp.atMs : null,
  elapsedInAppMs: firstApp ? lastMs - firstApp.atMs : null,
  budgetMs: SPEC.budgetMs || null,
  withinBudget: SPEC.budgetMs && firstApp ? (lastMs - firstApp.atMs) <= SPEC.budgetMs : null,
  note: "Playwright recordVideo does not capture the browser URL bar; the URL trail below is the substitute.",
  trail,
};
fs.writeFileSync(path.join(OUT, `${SPEC.file}.json`), JSON.stringify(report, null, 2));
console.log(`\n  report: docs/history/recordings/${SPEC.file}.json`);
console.log(`  the .webm lands in that folder too - rename it to ${SPEC.file}.webm\n`);
await ctx.close();
