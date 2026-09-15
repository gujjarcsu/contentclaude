// TASK 12 — Route 3. Playwright setInputFiles through CDP; Polaris DropZone accepts it.
// RUN THIS ON WINDOWS (the device VM has no display):
//   cd C:\Users\PC4\contentclaude
//   node tools\proof\listing-upload.mjs
// A real Chromium window opens. Sign in yourself when it stops at the login wall.
// This script NEVER types an email, password or code.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RUN = path.join(ROOT, "docs/history/_pw-run");
const SHOTS = path.join(RUN, "shots");
const PROFILE = path.join(ROOT, "docs/history/_pw-profile");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const EDITOR = "https://apps.shopify.com/services/partner-app-submissions/1279a14cca41d4a6f8e6e3c485870b77/en";

// slot k -> the alt text that is on the live listing RIGHT NOW (the cross-check)
const OLD_ALTS = [
  "Navaal app dashboard with GEO features and usage stats",
  "Product list showing AI content generation status",
  "SEO Audit results showing missing metadata by product",
];
// slot k -> the file and the alt text it must carry when this is done
const SLOTS = [
  { file: "listing-assets/02-review-desktop.png",   alt: "Navaal Review: six drafts, each approved before publishing" },
  { file: "listing-assets/03-products-desktop.png", alt: "Navaal Products: catalogue view with content status per product" },
  { file: "listing-assets/05-settings-desktop.png", alt: "Navaal Settings: brand voice, language and approval rules" },
];

const report = { startedAt: new Date().toISOString(), steps: [] };
const LOG = path.join(RUN, "console.log");
const say = (m) => {
  console.log(m);
  report.steps.push({ t: new Date().toISOString(), m });
  try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {}
};
const dump = () => fs.writeFileSync(path.join(RUN, "upload-report.json"), JSON.stringify(report, null, 2));
const die = (m) => { say("ABORT: " + m); report.ok = false; dump(); throw new Error(m); };

// a crash must still leave evidence behind
for (const ev of ["unhandledRejection", "uncaughtException"]) {
  process.on(ev, (e) => {
    report.ok = false;
    report.crash = { ev, message: String(e && e.message || e), stack: String(e && e.stack || "").split("\n").slice(0, 6) };
    try { say(`CRASH (${ev}): ${report.crash.message}`); dump(); } catch {}
    process.exit(1);
  });
}

for (const s of SLOTS) {
  const abs = path.join(ROOT, s.file);
  if (!fs.existsSync(abs)) die(`missing asset ${s.file}`);
  s.abs = abs;
  s.bytes = fs.statSync(abs).size;
  const b = fs.readFileSync(abs);
  s.px = `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  if (s.px !== "3200x1800") die(`${s.file} is ${s.px}, not 3200x1800`);
}
say(`assets verified: ${SLOTS.map(s => `${path.basename(s.file)} ${s.px} ${s.bytes}B`).join(" | ")}`);

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1600, height: 1000 },
  args: ["--no-first-run", "--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());

const uploads = [];
page.on("response", (r) => {
  if (r.request().method() !== "GET" && /upload|image|asset|staged|s3|amazonaws|shopifycloud/i.test(r.url())) {
    uploads.push({ t: Date.now(), status: r.status(), method: r.request().method(), url: r.url().slice(0, 160) });
  }
});

await page.goto(EDITOR, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);

// ---- the login wall: the owner signs in, in this window. This script does not. ----
const editorReady = async () => {
  try {
    if (!/partner-app-submissions|edit_listing/.test(page.url())) return false;
    return (await page.locator("input[type=file]").count()) >= 3;
  } catch { return false; }
};
if (!(await editorReady())) {
  say("");
  say("  ===================================================================");
  say("  LOGIN WALL. Sign in in the Chromium window that just opened.");
  say("  This script will not type anything. It is watching, and continues");
  say("  by itself the moment the listing editor loads.");
  say("  ===================================================================");
  say("");
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    if (await editorReady()) break;
    if (/accounts\.shopify\.com/.test(page.url()) === false && /partner-app-submissions/.test(page.url()) === false) {
      // owner navigated somewhere else; nudge back only when signed in
    }
  }
  if (!(await editorReady())) {
    // one last try: the owner may have signed in but landed elsewhere
    await page.goto(EDITOR, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  if (!(await editorReady())) die("still not on the listing editor after 20 minutes");
}
say(`editor loaded: ${page.url()}`);
await page.screenshot({ path: path.join(SHOTS, "01-editor.png") });

// ---- map the three screenshot slots by the alt text they carry now ----
const mark = async () => page.evaluate((oldAlts) => {
  document.querySelectorAll("[data-cw-alt],[data-cw-file]").forEach(e => {
    e.removeAttribute("data-cw-alt"); e.removeAttribute("data-cw-file");
  });
  const found = [];
  document.querySelectorAll("input").forEach((el) => {
    const k = oldAlts.indexOf((el.value || "").trim());
    if (k >= 0) {
      el.setAttribute("data-cw-alt", String(k));
      let a = el, depth = 0, fi = null;
      while (a && depth < 10) { fi = a.querySelector("input[type=file]"); if (fi) break; a = a.parentElement; depth++; }
      if (fi) {
        if (fi.hasAttribute("data-cw-file")) { found.push({ k, depth, collidesWith: fi.getAttribute("data-cw-file") }); return; }
        fi.setAttribute("data-cw-file", String(k)); found.push({ k, depth });
      }
    }
  });
  return {
    found,
    distinct: document.querySelectorAll("input[type=file][data-cw-file]").length,
    previews: Array.from(document.querySelectorAll("img")).map(i => i.src).filter(s => /cdn|shopify/i.test(s)),
    fileInputs: document.querySelectorAll("input[type=file]").length,
  };
}, OLD_ALTS);

let map = await mark();
say(`slot map: ${JSON.stringify(map.found)} | file inputs on page: ${map.fileInputs}`);
if (map.found.length !== 3) die(`expected to find all 3 current alt texts paired with a file input, found ${map.found.length}. The listing is not in the state this script was written for — nothing was changed.`);
if (map.distinct !== 3) die(`the 3 alt texts resolve to ${map.distinct} file input(s), not 3 — a file would land in the wrong slot. Nothing was changed. ${JSON.stringify(map.found)}`);
report.previewsBefore = map.previews;

const srcOf = (k) => page.evaluate((kk) => {
  const fi = document.querySelector(`input[type=file][data-cw-file="${kk}"]`);
  if (!fi) return null;
  let a = fi, depth = 0;
  while (a && depth < 10) { const im = a.querySelector("img"); if (im) return im.src; a = a.parentElement; depth++; }
  return null;
}, k);

// ---- one slot at a time ----
// Two routes per slot, in this order. Route A is the one the DropZone is built for:
// clicking it opens Chromium's own file chooser, which Playwright intercepts.
// Route B is setInputFiles on the hidden input. The 2026-09-15 11:43 run proved B
// alone is silent here: preview unchanged after 120s and ZERO network requests.
const slotEl = (k) => page.evaluateHandle((kk) => {
  const fi = document.querySelector(`input[type=file][data-cw-file="${kk}"]`);
  if (!fi) return null;
  return fi.closest(".Polaris-DropZone") || fi.parentElement;
}, k);

const filesOn = (k) => page.evaluate((kk) => {
  const fi = document.querySelector(`input[type=file][data-cw-file="${kk}"]`);
  if (!fi) return { present: false };
  return {
    present: true, count: fi.files ? fi.files.length : -1,
    name: fi.files && fi.files[0] ? fi.files[0].name : null,
    size: fi.files && fi.files[0] ? fi.files[0].size : null,
    disabled: fi.disabled, accept: fi.accept || null, multiple: fi.multiple,
    inDropZone: !!fi.closest(".Polaris-DropZone"),
  };
}, k);

const settled = async (k, before, n0) => {
  const after = await srcOf(k);
  const changed = !!after && after !== before;
  const hosted = changed && /^https:\/\//.test(after) && !/^blob:|^data:/.test(after);
  const uploaded2xx = uploads.slice(n0).some((u) => u.status >= 200 && u.status < 300);
  return { after, changed, accepted: hosted || (changed && uploaded2xx) };
};

for (let k = 0; k < 3; k++) {
  const s = SLOTS[k];
  const before = await srcOf(k);
  say(`slot ${k + 1}: ${path.basename(s.file)} -> preview before = ${String(before).slice(0, 90)}…`);

  const handle = (await slotEl(k)).asElement();
  if (handle) await handle.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, `02-slot${k + 1}-before.png`) });

  const attempts = [];
  let res = { accepted: false, after: before, changed: false };

  // ---- route A: the file chooser ----
  const n0 = uploads.length;
  let routeA = "not attempted";
  if (handle) {
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15000 }),
        handle.click({ timeout: 10000 }),
      ]);
      await chooser.setFiles(s.abs);
      routeA = "file chooser opened and was given the file";
    } catch (e) { routeA = `no file chooser: ${e.message.split("\n")[0]}`; }
  } else { routeA = "could not resolve the DropZone element"; }
  say(`slot ${k + 1} route A — ${routeA}`);
  let waited = 0;
  while (waited < 45000) {
    await page.waitForTimeout(2000); waited += 2000;
    res = await settled(k, before, n0);
    if (res.accepted) break;
  }
  attempts.push({ route: "A filechooser", detail: routeA, waitedMs: waited, filesOnInput: await filesOn(k), ...res });

  // ---- route B: setInputFiles on the hidden input ----
  if (!res.accepted) {
    const n1 = uploads.length;
    let routeB = "ok";
    try {
      await page.locator(`input[type=file][data-cw-file="${k}"]`).setInputFiles(s.abs, { timeout: 15000 });
    } catch (e) { routeB = `threw: ${e.message.split("\n")[0]}`; }
    const landed = await filesOn(k);
    say(`slot ${k + 1} route B — setInputFiles ${routeB}; the input now holds ${landed.count} file(s) ${landed.name || ""}`);
    let w2 = 0;
    while (w2 < 45000) {
      await page.waitForTimeout(2000); w2 += 2000;
      res = await settled(k, before, n1);
      if (res.accepted) break;
    }
    attempts.push({ route: "B setInputFiles", detail: routeB, waitedMs: w2, filesOnInput: landed, ...res });
  }

  await page.screenshot({ path: path.join(SHOTS, `02-slot${k + 1}-after.png`) });
  report.steps.push({ slot: k + 1, file: s.file, before, attempts, net: uploads.slice(n0) });

  if (!res.accepted) {
    report.diagnostics = report.diagnostics || {};
    report.diagnostics[`slot${k + 1}`] = await page.evaluate((kk) => {
      const fi = document.querySelector(`input[type=file][data-cw-file="${kk}"]`);
      if (!fi) return { note: "input vanished" };
      const dz = fi.closest(".Polaris-DropZone");
      const item = dz ? dz.parentElement : fi.parentElement;
      return {
        inputOuter: fi.outerHTML.slice(0, 400),
        dzClass: dz ? dz.className : null,
        dzHTML: dz ? dz.outerHTML.slice(0, 1200) : null,
        itemHTML: item ? item.outerHTML.slice(0, 2000) : null,
      };
    }, k).catch((e) => ({ error: e.message }));
    if (res.changed) die(`slot ${k + 1} shows a local preview (${String(res.after).slice(0, 30)}…) but no upload reached Shopify — stopping before any Save; alt text will not be saved over an old picture again.`);
    die(`slot ${k + 1} did not take the file on either route — stopping before any Save, so nothing is written. Diagnostics are in the report.`);
  }
  say(`slot ${k + 1}: ACCEPTED -> ${String(res.after).slice(0, 90)}…`);
  map = await mark(); // re-mark: React may have replaced the nodes
}


// ---- alt text, then ONE save ----
for (let k = 0; k < 3; k++) {
  const el = page.locator(`input[data-cw-alt="${k}"]`).first();
  const max = await el.getAttribute("maxlength");
  if (SLOTS[k].alt.length > Number(max || 64)) die(`alt ${k + 1} is ${SLOTS[k].alt.length} chars, field max is ${max}`);
  await el.fill(SLOTS[k].alt);
  say(`alt ${k + 1} set (${SLOTS[k].alt.length}/${max}): ${SLOTS[k].alt}`);
}
await page.screenshot({ path: path.join(SHOTS, "03-before-save.png") });

const saveBtn = page.getByRole("button", { name: /^\s*Save\s*$/ }).first();
await saveBtn.waitFor({ state: "visible", timeout: 20000 });
say("clicking Save (once)");
await saveBtn.click();
await page.waitForTimeout(12000);
await page.screenshot({ path: path.join(SHOTS, "04-after-save.png") });

// ---- fresh load read-back ----
await page.goto(EDITOR, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);
const readback = await page.evaluate(() => {
  const fis = Array.from(document.querySelectorAll("input[type=file]"));
  return fis.map((fi) => {
    let a = fi, depth = 0, img = null, alt = null;
    while (a && depth < 10) {
      if (!img) img = a.querySelector("img");
      if (!alt) { const t = Array.from(a.querySelectorAll("input")).find(x => x.type === "text" && x !== fi); if (t) alt = t.value; }
      if (img && alt) break;
      a = a.parentElement; depth++;
    }
    return { src: img ? img.src : null, alt };
  });
});
report.readback = readback;
await page.screenshot({ path: path.join(SHOTS, "05-readback.png") });
say("read-back on a fresh load:\n" + JSON.stringify(readback, null, 2));

report.ok = true;
report.finishedAt = new Date().toISOString();
dump();
say("done. report: docs/history/_pw-run/upload-report.json  shots: docs/history/_pw-run/shots/");
say("leaving the window open for 30s");
await page.waitForTimeout(30000);
await ctx.close();
