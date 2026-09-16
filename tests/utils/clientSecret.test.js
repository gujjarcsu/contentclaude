/**
 * Phase 14 item 7 — the app boots with EXACTLY ONE client secret.
 *
 * The app's client secret from 4 June has never been revoked, so two are live
 * in the Partner Dashboard three months apart. Which one Fly holds cannot be
 * decided from inside the app without printing a secret, and that is never
 * done. What CAN be held here is the other half of "exactly one":
 *
 *   - one name is read as the client secret, everywhere, with no second name
 *     and no fallback list;
 *   - and ZERO is refused. `apiSecretKey: process.env.SHOPIFY_API_SECRET || ""`
 *     booted the app with an empty HMAC key — which is not "unconfigured", it
 *     is a key an attacker also knows, so every webhook signature and signed
 *     URL would verify against a value anyone can compute.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
  );
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

describe("exactly one name is the client secret", () => {
  it("nothing reads a second or alternate secret name", () => {
    const files = [...walk("app"), ...walk("scripts")].filter((f) => /\.(js|jsx|mjs)$/.test(f));
    const offenders = [];
    for (const f of files) {
      const src = strip(readFileSync(f, "utf8"));
      // A rotated-secret shape — SHOPIFY_API_SECRET_OLD, _PREVIOUS, _2, a list —
      // is how two live secrets become permanent.
      for (const m of src.matchAll(/process\.env\.(SHOPIFY_API_SECRET\w+)/g)) offenders.push(`${f}: ${m[1]}`);
      if (/SHOPIFY_API_SECRETS\b/.test(src)) offenders.push(`${f}: SHOPIFY_API_SECRETS`);
    }
    expect(offenders, "one secret, one name").toEqual([]);
  });

  it("the value reaches the Shopify library from that one name and nowhere else", () => {
    const src = strip(readFileSync("app/shopify.server.js", "utf8"));
    expect(src).toMatch(/const API_SECRET = process\.env\.SHOPIFY_API_SECRET \|\| "";/);
    expect(src).toMatch(/apiSecretKey: API_SECRET,/);
    // the old form, which is what allowed a boot with none
    expect(src).not.toMatch(/apiSecretKey: process\.env\.SHOPIFY_API_SECRET \|\| ""/);
  });
});

describe("ZERO secrets is refused, in production", () => {
  it("shopify.server.js throws at boot rather than serving with an empty HMAC key", () => {
    const src = strip(readFileSync("app/shopify.server.js", "utf8"));
    expect(src).toMatch(/if \(process\.env\.NODE_ENV === "production" && API_SECRET\.trim\(\) === ""\)/);
    expect(src).toMatch(/FATAL: SHOPIFY_API_SECRET is not set/);
  });

  it("the startup check agrees — it was a warning where a missing Redis was fatal", () => {
    const src = strip(readFileSync("app/utils/startup.server.js", "utf8"));
    const block = src.match(/if \(!process\.env\.SHOPIFY_API_KEY \|\| !process\.env\.SHOPIFY_API_SECRET\) \{[\s\S]*?\n {2}\}/)[0];
    expect(block).toMatch(/NODE_ENV === "production"/);
    expect(block).toMatch(/throw new Error/);
  });

  it("outside production it stays a warning, so a dev machine still runs", () => {
    const src = strip(readFileSync("app/shopify.server.js", "utf8"));
    // the throw is guarded on production only
    const guard = src.match(/if \(process\.env\.NODE_ENV === "production" && API_SECRET[\s\S]*?\n\}/)[0];
    expect(guard).toMatch(/NODE_ENV === "production"/);
    const startup = strip(readFileSync("app/utils/startup.server.js", "utf8"));
    expect(startup).toMatch(/warnings\.push\(msg\)/);
  });
});

describe("the secret is never printed, by anything that reads it", () => {
  it("no file logs or returns the secret's value, prefix or length", () => {
    const files = [...walk("app"), ...walk("scripts")].filter((f) => /\.(js|jsx|mjs)$/.test(f));
    const offenders = [];
    for (const f of files) {
      const src = strip(readFileSync(f, "utf8"));
      if (!src.includes("SHOPIFY_API_SECRET")) continue;
      // slice / substring / length on the secret is the shape that leaks it
      if (/SHOPIFY_API_SECRET[^\n;]*\.(slice|substring|substr|length)\b/.test(src)) offenders.push(`${f}: derives from the secret`);
      // and it must never be handed to a logger or to console
      if (/(logger\.\w+|console\.\w+)\([^)]*SHOPIFY_API_SECRET(?!\s+is not set)/.test(src)) offenders.push(`${f}: logs the secret`);
    }
    expect(offenders).toEqual([]);
  });
});
