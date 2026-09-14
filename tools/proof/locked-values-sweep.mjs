#!/usr/bin/env node
/**
 * P5.0 step 3 — sweep the CLASS, not the instance (L18).
 *
 * "Every locked value must have exactly one definition and at least one
 * consumer. Prove there is no second hardcoded copy on the path to Shopify or
 * to a screen, and prove each exported constant is imported by something that
 * is not a test."
 *
 * This prints the evidence rather than asserting it, because the assertion
 * already lives in `tests/utils/billingConfig.test.js` and runs on every
 * commit. What this adds is the TABLE — the thing a person reads once to
 * believe the guard, and re-runs when they stop believing it.
 *
 *   node tools/proof/locked-values-sweep.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
  );

const appFiles = walk("app").filter((f) => /\.(js|jsx)$/.test(f));
const src = (f) => readFileSync(f, "utf8");

/** Comments stripped: a file is not less correct for naming what it refuses to do. */
const code = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

/** Values that are LOCKED by 14-PRICING.md §4, and where each one is defined. */
const LOCKED = [
  { name: "amount (9.99)", value: "9.99", home: "app/utils/billing-plans.js" },
  { name: "amount (29.99)", value: "29.99", home: "app/utils/billing-plans.js" },
  { name: "amount (79.99)", value: "79.99", home: "app/utils/billing-plans.js" },
  { name: "annualAmount (95.9)", value: "95.9", home: "app/utils/billing-plans.js" },
  { name: "annualAmount (287.9)", value: "287.9", home: "app/utils/billing-plans.js" },
  { name: "annualAmount (767.9)", value: "767.9", home: "app/utils/billing-plans.js" },
  // 250 is ALSO Shopify's page-size ceiling for every GraphQL connection, so a
  // bare value grep reports three page-size constants as pricing duplicates.
  // Marked loose rather than left noisy: a sweep that cries wolf is ignored,
  // and being ignored is its own false-green mechanism. TRIAL_CREDITS is
  // guarded structurally instead — it has two non-test importers, listed below.
  { name: "TRIAL_CREDITS (250)", value: "250", home: "app/utils/billing-plans.js", loose: true },
  { name: "TRIAL_DAYS (14)", value: "14", home: "app/utils/billing-plans.js", loose: true },
];

console.log("\n── SECOND COPIES on the path to Shopify or to a screen ──\n");
let dupes = 0;
for (const v of LOCKED) {
  // Word-boundaried on both sides so 14 does not match 2014 and 250 does not
  // match 2500. TRIAL_DAYS is flagged `loose` because 14 is a common small
  // integer; its real guard is the source-level one in billingConfig.test.js.
  const re = new RegExp(`(?<![\\d.])${v.value.replace(".", "\\.")}(?![\\d])`, "g");
  const hits = appFiles
    .filter((f) => f !== v.home)
    .map((f) => [f, (code(src(f)).match(re) ?? []).length])
    .filter(([, n]) => n > 0);
  const shown = v.loose ? [] : hits;
  if (shown.length) dupes += shown.length;
  console.log(
    `${v.name.padEnd(22)} ${v.home}` +
      (v.loose
        ? "   (value collides with a non-pricing constant; guarded structurally instead)"
        : shown.length
          ? `\n  ⚠ ALSO IN: ${shown.map(([f, n]) => `${f} ×${n}`).join(", ")}`
          : "   ✓ no second copy"),
  );
}

console.log("\n── EXPORTED CONSTANTS and their NON-TEST importers ──\n");
const exported = [...code(src("app/utils/billing-plans.js")).matchAll(/export (?:const|function) (\w+)/g)].map(
  (m) => m[1],
);
let orphans = 0;
for (const name of exported) {
  const importers = appFiles.filter((f) => {
    if (f.endsWith("billing-plans.js")) return false;
    const t = src(f);
    return /from\s+["'][^"']*billing-plans\.js["']/.test(t) && new RegExp(`\\b${name}\\b`).test(t);
  });
  if (importers.length === 0) orphans++;
  console.log(
    `${name.padEnd(22)} ${
      importers.length ? `✓ ${importers.length} importer(s): ${importers.map((f) => f.replace("app/", "")).join(", ")}` : "⚠ NONE — dead code that greps as shipped (false green #11)"
    }`,
  );
}

console.log("\n── CREDIT WEIGHTS ──\n");
const weightHome = "app/utils/credits.js";
const weightUsers = appFiles.filter(
  (f) => f !== weightHome && /from\s+["'][^"']*credits\.js["']/.test(src(f)),
);
console.log(`${weightHome} → ${weightUsers.map((f) => f.replace("app/", "")).join(", ") || "⚠ NO CONSUMERS"}`);

console.log(
  `\nRESULT: ${dupes} second copies, ${orphans} exported constants with no non-test importer.\n`,
);
process.exit(dupes === 0 && orphans === 0 ? 0 : 1);
