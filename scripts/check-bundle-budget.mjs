#!/usr/bin/env node
/**
 * B4.2 (Phase 9) — the client bundle budget. Runs in CI after `npm run build`.
 *
 * The Built for Shopify performance gate is measured by Shopify from real
 * sessions (p75 LCP / CLS / INP over ≥100 calls). The dashboard reports the
 * state; this is the code-side reason it stays under: what the heaviest route
 * ships, held to a number. Budgets are set at the 2026-09-14 build plus
 * headroom, so a route that grows past them turns the build red before a
 * merchant's session does.
 *
 *   route chunk   ≤ ROUTE_MAX     the largest per-route file
 *   shared chunk  ≤ SHARED_MAX    the largest shared file (React, Polaris runtime, error boundary)
 *   total JS      ≤ TOTAL_MAX     everything under build/client/assets/*.js
 *
 * Raw bytes, not gzip: the number the browser has to parse.
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export const ROUTE_MAX = 64 * 1024; // 2026-09-14: app.products 50.2 KB
export const SHARED_MAX = 256 * 1024; // 2026-09-14: RouteError 196.6 KB
export const TOTAL_MAX = 1024 * 1024; // 2026-09-14: 850.7 KB

const dir = "build/client/assets";
if (!existsSync(dir)) {
  console.error(`no ${dir} — run \`npm run build\` first`);
  process.exit(2);
}
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
const sized = files.map((f) => ({ file: f, bytes: statSync(join(dir, f)).size })).sort((a, b) => b.bytes - a.bytes);
const isRoute = (f) => /^(app[._]|api\.|auth\.|billing\.|webhooks\.|proxy\.|go-|privacy-|terms-)/.test(f);
const routes = sized.filter((s) => isRoute(s.file));
const shared = sized.filter((s) => !isRoute(s.file));
const total = sized.reduce((n, s) => n + s.bytes, 0);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

const failures = [];
if (routes[0] && routes[0].bytes > ROUTE_MAX) failures.push(`heaviest route ${routes[0].file} is ${kb(routes[0].bytes)} > ${kb(ROUTE_MAX)}`);
if (shared[0] && shared[0].bytes > SHARED_MAX) failures.push(`heaviest shared chunk ${shared[0].file} is ${kb(shared[0].bytes)} > ${kb(SHARED_MAX)}`);
if (total > TOTAL_MAX) failures.push(`total client JS ${kb(total)} > ${kb(TOTAL_MAX)}`);

console.log(`client JS: ${files.length} files, ${kb(total)} total`);
console.log(`heaviest route:  ${routes[0]?.file ?? "-"} ${routes[0] ? kb(routes[0].bytes) : ""} (budget ${kb(ROUTE_MAX)})`);
console.log(`heaviest shared: ${shared[0]?.file ?? "-"} ${shared[0] ? kb(shared[0].bytes) : ""} (budget ${kb(SHARED_MAX)})`);
for (const f of failures) console.error(`BUDGET EXCEEDED: ${f}`);
process.exit(failures.length ? 1 : 0);
