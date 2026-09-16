/**
 * verify-client-secret.mjs — answers ONE question without printing anything secret:
 *
 *   "Is the client secret in <file> the one Shopify is currently signing with?"
 *
 * Shopify signs the embedded-app `id_token` (a JWT) with the app's client
 * secret, HMAC-SHA256. If the secret we hold is not the one Shopify signs
 * with, `authenticate.admin` rejects every session token, bounces to
 * /auth/session-token, is rejected again and answers 401 — and webhook HMACs
 * fail the same way. That is exactly the shape of the 2026-09-16 outage.
 *
 * So: take a real id_token off the production log, recompute its signature
 * with the candidate secret, and compare. No network, no deploy, no guessing.
 *
 * Usage (from the repo root):
 *   node scripts/verify-client-secret.mjs <secret-file> [log-file]
 *
 *   <secret-file>  a text file whose ONLY content is the client secret, or a
 *                  KEY=value line (either shape is accepted, quotes stripped).
 *   [log-file]     defaults to ./applog.txt — any file containing at least one
 *                  `id_token=...` from a real request.
 *
 * It prints MATCH or NO MATCH and nothing else that could leak a value:
 * never the secret, never the token, only lengths and the last 4 characters
 * of the *expected* signature, which are useless on their own.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const secretFile = process.argv[2];
const logFile = process.argv[3] || "applog.txt";

if (!secretFile) {
  console.error("usage: node scripts/verify-client-secret.mjs <secret-file> [log-file]");
  process.exit(2);
}

function readSecret(file) {
  if (!fs.existsSync(file)) {
    console.error(`No file at ${file}. Create it with the candidate secret as its only content.`);
    process.exit(3);
  }
  let raw = fs.readFileSync(file, "utf8");
  raw = raw.replace(/^﻿/, "");              // BOM from Notepad
  raw = raw.split(/\r?\n/).find((l) => l.trim()) || "";
  raw = raw.trim();
  raw = raw.replace(/^[A-Za-z0-9_]+\s*=\s*/, ""); // KEY=value shape
  raw = raw.replace(/^['"]/, "").replace(/['"]$/, "").trim();
  return raw;
}

function newestIdToken(file) {
  if (!fs.existsSync(file)) {
    console.error(`No file at ${file}. Produce one with:`);
    console.error(`  fly logs -a contentclaude --no-tail > applog.txt`);
    console.error(`after clicking the app in a dev store, so a real id_token is in it.`);
    process.exit(4);
  }
  const text = fs.readFileSync(file, "utf8");
  const hits = [...text.matchAll(/id_token=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  if (!hits.length) {
    console.error(`No id_token found in ${file}.`);
    console.error(`Click the app in a dev store first, then re-run the fly logs command — the`);
    console.error(`token only appears on the request Shopify makes when the app frame loads.`);
    process.exit(5);
  }
  return hits[hits.length - 1];
}

const secret = readSecret(secretFile);
if (!secret) {
  console.error(`${secretFile} is empty after trimming. Put the secret on the first line.`);
  process.exit(3);
}

const token = newestIdToken(logFile);
const [h, p, sig] = token.split(".");
const expected = crypto
  .createHmac("sha256", secret)
  .update(`${h}.${p}`)
  .digest("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

let claims = {};
try {
  claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
} catch {}

const shop = String(claims.dest || "").replace(/^https?:\/\//, "");
const aud = String(claims.aud || "");

console.log(`token   : from ${logFile}, issued for ${shop || "(unknown shop)"}`);
console.log(`aud     : ${aud}   <- must equal client_id in shopify.app.toml`);
console.log(`secret  : ${secret.length} characters, read from ${secretFile}`);
console.log("");

if (sig === expected) {
  console.log("MATCH");
  console.log("");
  console.log("This secret IS the one Shopify signed that token with.");
  console.log("If production is still answering 401, then Fly is not holding THIS value —");
  console.log("import it (see the steps) and the 401 goes away.");
  process.exit(0);
} else {
  console.log("NO MATCH");
  console.log("");
  console.log(`expected signature ends ...${expected.slice(-4)}, the token's ends ...${sig.slice(-4)}`);
  console.log("");
  console.log("This secret is NOT the one Shopify is signing with. Do not import it.");
  console.log("Go to Partners -> Apps -> Navaal -> Configuration -> Client credentials,");
  console.log("copy the secret that is shown as active, paste it into the file, run this again.");
  process.exit(1);
}
