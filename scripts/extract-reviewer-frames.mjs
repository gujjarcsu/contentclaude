// Load the reviewer's screencast and extract frames so we can SEE the exact
// flow (URLs, clicks, where the dead-end happens). Frames are saved as PNGs.
//   node scripts/extract-reviewer-frames.mjs <webm-url>
import { chromium } from "@playwright/test";
import fs from "node:fs";

const URL = process.argv[2] || "https://screenshot.click/64958-19888-25334-74251-94592.webm";
const OUT = "reviewer-frames";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

// Navigate straight to the video; Chromium renders a <video> for a direct file.
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);

// Ensure there is a full-viewport video element we can drive.
const hasVideo = await page.evaluate(async (src) => {
  let v = document.querySelector("video");
  if (!v) {
    v = document.createElement("video");
    v.src = src;
    v.style.width = "100vw"; v.style.height = "100vh"; v.style.objectFit = "contain";
    v.muted = true; v.controls = false;
    document.body.innerHTML = ""; document.body.style.margin = "0"; document.body.appendChild(v);
  }
  await new Promise((res) => {
    if (v.readyState >= 1 && v.duration) return res();
    v.addEventListener("loadedmetadata", () => res(), { once: true });
    setTimeout(res, 8000);
  });
  return { duration: v.duration || 0, w: v.videoWidth, h: v.videoHeight };
}, URL);
console.log("video meta:", JSON.stringify(hasVideo));

const dur = hasVideo.duration || 0;
if (!dur || !isFinite(dur)) { console.log("Could not read duration; grabbing periodic screenshots instead."); }

const N = 24;
const total = dur && isFinite(dur) ? dur : 24;
for (let i = 0; i <= N; i++) {
  const t = (total * i) / N;
  await page.evaluate((tt) => {
    const v = document.querySelector("video");
    if (v) { v.pause(); v.currentTime = tt; }
  }, t);
  // wait for the seek to render
  await page.waitForTimeout(700);
  const label = `${String(i).padStart(2, "0")}_t${t.toFixed(1)}s`;
  await page.screenshot({ path: `${OUT}/${label}.png` }).catch(() => {});
  console.log(`frame ${label}`);
}
await ctx.close();
await browser.close();
console.log(`\nSaved ${N + 1} frames to ${OUT}/ (duration ${total.toFixed(1)}s)`);
process.exit(0);
