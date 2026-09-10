#!/usr/bin/env node
/**
 * deploy-watch — measure, from OUTSIDE, what a deploy does to a merchant.
 *
 * Fly's dashboard reports what Fly believes about its own machines. It cannot
 * report what a request from the public internet experienced, and that is the
 * only number that matters: Shopify's webhook delivery gives us ~5 s before it
 * calls the delivery failed, and a merchant clicking Generate has no dashboard.
 *
 * So this polls the public URL on a FIXED interval and records every sample.
 *
 * ── Three things that make it a check rather than decoration ───────────────
 *
 * 1. **The tick is independent of the response.** A naive poller awaits each
 *    request before scheduling the next, so when the app hangs for 20 s the
 *    poller stops sampling and the outage is invisible in the data — it looks
 *    like a gap, and a gap looks like nothing. Here the timer fires every
 *    INTERVAL_MS whether or not the last request came back, so an outage
 *    produces a pile of concurrent slow samples, which is what it really is.
 *
 * 2. **No keep-alive.** A reused socket can make a machine that is going away
 *    look alive until the socket finally errors. Every sample opens a fresh
 *    connection, which is also what Shopify's webhook delivery does.
 *
 * 3. **A long request timeout (30 s), not a short one.** Aborting at 5 s would
 *    record "error" and throw away the actual latency. We want the number.
 *
 * If the app were completely down for the whole run, this prints
 * `nonOk` == `samples` and a max latency of the timeout — not an empty report.
 * If the URL were wrong it fails on the pre-flight sample before the deploy
 * starts. Both were tested by pointing it at a dead port; see PROGRESS.md.
 *
 * Usage:
 *   node tools/proof/deploy-watch.mjs --url https://app.navaal.ai/api/health \
 *        --seconds 420 --label after-fix
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { request } from "node:https";
import { URL } from "node:url";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const URL_STR = args.get("url") || "https://app.navaal.ai/api/health";
const DEEP_URL = args.get("deep") || `${URL_STR}?deep=1`;
const SECONDS = Number(args.get("seconds") || 420);
const LABEL = args.get("label") || "run";
const INTERVAL_MS = Number(args.get("interval") || 250);
/** How often to ask the deep check, which is the only endpoint that names the build sha. */
const DEEP_INTERVAL_MS = Number(args.get("deepInterval") || 2000);
const TIMEOUT_MS = Number(args.get("timeout") || 30_000);
const OUT_DIR = args.get("out") || "tools/proof/out";
/** A sample slower than this is what we are counting. Shopify's webhook budget is ~5 s. */
const SLOW_MS = Number(args.get("slow") || 1000);

const started = Date.now();
const samples = [];
const shas = [];
let seq = 0;
let inFlight = 0;

/** One request. Never throws — a failure IS a sample. */
function sample(urlStr, into, extra) {
  const n = ++seq;
  const t0 = Date.now();
  const u = new URL(urlStr);
  inFlight += 1;

  const done = (fields) => {
    inFlight -= 1;
    into.push({ n, at: t0 - started, ms: Date.now() - t0, ...fields });
  };

  const req = request(
    {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      // A fresh connection every time: a reused socket hides a machine that is
      // going away, and Shopify's webhook delivery does not reuse one either.
      agent: false,
      headers: { Connection: "close", "User-Agent": "navaal-deploy-watch/1" },
      timeout: TIMEOUT_MS,
    },
    (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        // Only the deep check needs its body read; cap it regardless.
        if (extra?.wantBody && body.length < 4000) body += c;
      });
      res.on("end", () => done({ status: res.statusCode, body: extra?.wantBody ? body : undefined }));
    },
  );

  req.on("timeout", () => req.destroy(new Error(`timeout after ${TIMEOUT_MS}ms`)));
  req.on("error", (err) => done({ status: 0, error: err.message }));
  req.end();
}

console.log(`[deploy-watch] ${LABEL}: polling ${URL_STR} every ${INTERVAL_MS}ms for ${SECONDS}s`);

// Pre-flight: if the very first sample cannot reach the app, stop now rather
// than producing a clean-looking report of an unreachable host.
await new Promise((resolve) => {
  const pre = [];
  sample(URL_STR, pre, {});
  const wait = setInterval(() => {
    if (pre.length) {
      clearInterval(wait);
      if (pre[0].status !== 200) {
        console.error(`[deploy-watch] PRE-FLIGHT FAILED: status=${pre[0].status} ${pre[0].error || ""}`);
        process.exit(2);
      }
      console.log(`[deploy-watch] pre-flight ok (${pre[0].ms}ms) — start the deploy now`);
      resolve();
    }
  }, 100);
});

const tick = setInterval(() => sample(URL_STR, samples, {}), INTERVAL_MS);
const deepTick = setInterval(() => sample(DEEP_URL, shas, { wantBody: true }), DEEP_INTERVAL_MS);

// Progress, so a long run is not a silent one.
const progress = setInterval(() => {
  const slow = samples.filter((s) => s.ms > SLOW_MS).length;
  const bad = samples.filter((s) => s.status !== 200).length;
  console.log(
    `[deploy-watch] t=${Math.round((Date.now() - started) / 1000)}s samples=${samples.length} ` +
      `inFlight=${inFlight} nonOk=${bad} over${SLOW_MS}ms=${slow}`,
  );
}, 15_000);

await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(tick);
clearInterval(deepTick);
clearInterval(progress);

// Give anything still in flight its full timeout before summarising, or a
// hanging request at the end would be dropped from the very statistic it is.
const drainUntil = Date.now() + TIMEOUT_MS + 1000;
while (inFlight > 0 && Date.now() < drainUntil) await new Promise((r) => setTimeout(r, 250));

samples.sort((a, b) => a.n - b.n);
const lat = samples.map((s) => s.ms).sort((a, b) => a - b);
const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))] : 0);

const nonOk = samples.filter((s) => s.status !== 200);
const slow = samples.filter((s) => s.ms > SLOW_MS);
// The window is measured from the START of the first slow request to the END
// of the last one — the span a merchant would have experienced as "it's stuck".
const slowWindowMs = slow.length ? Math.max(...slow.map((s) => s.at + s.ms)) - Math.min(...slow.map((s) => s.at)) : 0;

const byStatus = {};
for (const s of samples) byStatus[s.status || `err:${s.error}`] = (byStatus[s.status || `err:${s.error}`] || 0) + 1;

const shaTimeline = [];
for (const d of shas) {
  let build = null;
  try {
    build = JSON.parse(d.body || "{}")?.checks?.build ?? null;
  } catch {
    build = null;
  }
  const last = shaTimeline[shaTimeline.length - 1];
  if (!last || last.build !== build || last.status !== d.status) {
    shaTimeline.push({ at: d.at, ms: d.ms, status: d.status, build });
  }
}

const summary = {
  label: LABEL,
  url: URL_STR,
  startedAt: new Date(started).toISOString(),
  seconds: SECONDS,
  intervalMs: INTERVAL_MS,
  samples: samples.length,
  nonOk: nonOk.length,
  byStatus,
  maxMs: lat.length ? lat[lat.length - 1] : 0,
  p50: pct(50),
  p90: pct(90),
  p99: pct(99),
  overSlowMs: { threshold: SLOW_MS, count: slow.length, windowMs: slowWindowMs },
  worst: samples
    .slice()
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10)
    .map((s) => ({ at: s.at, ms: s.ms, status: s.status, error: s.error })),
  nonOkDetail: nonOk.slice(0, 20).map((s) => ({ at: s.at, ms: s.ms, status: s.status, error: s.error })),
  buildTimeline: shaTimeline,
};

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date(started).toISOString().replace(/[:.]/g, "-");
writeFileSync(`${OUT_DIR}/${LABEL}-${stamp}.samples.json`, JSON.stringify(samples, null, 0));
writeFileSync(`${OUT_DIR}/${LABEL}-${stamp}.summary.json`, JSON.stringify(summary, null, 2));

console.log("\n===== deploy-watch summary =====");
console.log(JSON.stringify(summary, null, 2));
console.log(`\nraw samples: ${OUT_DIR}/${LABEL}-${stamp}.samples.json`);

// A non-zero exit makes this usable as a gate later: zero non-200s and a
// sub-second maximum is the pass condition the owner set.
const pass = nonOk.length === 0 && summary.maxMs < SLOW_MS;
console.log(pass ? "\nPASS: zero non-200s and a sub-second maximum." : "\nFAIL: see nonOk / maxMs above.");
process.exit(pass ? 0 : 1);
