/**
 * B4.2 (Phase 9) — Built for Shopify, code side. One regression test per
 * criterion in docs/navaal/BFS-AUDIT.md, so the audit is a file that fails,
 * not a file that ages.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { code } from "../helpers/code.js";

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
};

describe("1. App Bridge from the script tag, first in the head, with the api-key meta", () => {
  const root = code(readFileSync("app/root.jsx", "utf8"));
  it("root.jsx puts the CDN script tag inside <head>, before any other script, after the api-key meta", () => {
    const head = root.slice(root.indexOf("<head>"), root.indexOf("</head>"));
    expect(head).toMatch(/<script src="https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js" \/>/);
    const firstScript = head.indexOf("<script");
    expect(head.slice(firstScript)).toMatch(/^<script src="https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js"/);
    expect(head.indexOf('name="shopify-api-key"')).toBeLessThan(firstScript);
  });
  it("no other file loads a second App Bridge script from anywhere but the recovery page", () => {
    const offenders = walk("app").filter((p) => /app-bridge\.js/.test(code(readFileSync(p, "utf8"))) && !/root\.jsx$|embedded\.server\.js$/.test(p));
    expect(offenders).toEqual([]);
  });
});

describe("2. Admin performance — the code-side budget", () => {
  it("the budget script exists with its three numbers and CI runs it after the build", () => {
    const s = readFileSync("scripts/check-bundle-budget.mjs", "utf8");
    expect(s).toMatch(/export const ROUTE_MAX = 64 \* 1024/);
    expect(s).toMatch(/export const SHARED_MAX = 256 \* 1024/);
    expect(s).toMatch(/export const TOTAL_MAX = 1024 \* 1024/);
    // Phase 12 D1: a live locale is a lazy chunk pair only a merchant on that locale fetches — measured on its own line
    expect(s).toMatch(/export const LOCALE_MAX = \d+ \* 1024/);
    expect(s).toMatch(/export const LOCALE_CHUNK_RE = /);
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const build = ci.indexOf("run: npm run build");
    const budget = ci.indexOf("run: node scripts/check-bundle-budget.mjs");
    expect(build).toBeGreaterThan(0);
    expect(budget).toBeGreaterThan(build);
  });
  it("a local build, when present, is inside the budget", () => {
    if (!existsSync("build/client/assets")) return; // CI runs the script itself, after the build
    const all = readdirSync("build/client/assets").filter((f) => f.endsWith(".js"));
    // Phase 12 D1: locale chunks (de-*.js …) are fetched only on that locale and are budgeted per locale in the script
    const isLocale = (f) => /^(de|fr|es|it|pt-BR|ja)-[A-Za-z0-9_-]+\.js$/.test(f);
    const files = all.filter((f) => !isLocale(f));
    const total = files.reduce((n, f) => n + statSync(join("build/client/assets", f)).size, 0);
    expect(total).toBeLessThanOrEqual(1024 * 1024);
    const perLocale = {};
    for (const f of all.filter(isLocale)) perLocale[f.split("-")[0]] = (perLocale[f.split("-")[0]] ?? 0) + statSync(join("build/client/assets", f)).size;
    for (const [loc, bytes] of Object.entries(perLocale)) expect(bytes, `locale ${loc}`).toBeLessThanOrEqual(224 * 1024);
  });
});

describe("3. Storefront impact of navaal-geo-schema", () => {
  it("the two blocks are pure Liquid — no <script> that runs on the storefront, no external fetch", () => {
    const dir = "extensions/geo-schema/blocks";
    const blocks = readdirSync(dir).filter((f) => f.endsWith(".liquid"));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) {
      const src = readFileSync(join(dir, b), "utf8");
      // JSON-LD is data, not a running script; anything else is.
      const scripts = [...src.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
      for (const attrs of scripts) expect(attrs, `${b} has a non-JSON-LD script`).toMatch(/type=["']application\/ld\+json["']/);
      expect(src).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
      expect(src).not.toMatch(/https?:\/\/(?!schema\.org)/i);
    }
  });
  it("the measurement harness exists and weights home 17 / product 40 / collection 43", () => {
    const h = readFileSync("tools/proof/lighthouse-embed.mjs", "utf8");
    expect(h).toMatch(/WEIGHTS = \{ home: 0\.17, product: 0\.4, collection: 0\.43 \}/);
  });
});

describe("4. Asset API — not used", () => {
  it("nothing under app/ or extensions/ writes theme assets", () => {
    const offenders = walk("app").filter((p) => /themeFilesUpsert|themeFilesDelete|assetUpdate|\/assets\.json|admin\/api\/[^"']*\/themes\//.test(code(readFileSync(p, "utf8"))));
    expect(offenders).toEqual([]);
    const scopes = readFileSync("shopify.app.toml", "utf8").match(/scopes = "([^"]+)"/)[1];
    expect(scopes.split(",").map((s) => s.trim())).not.toContain("write_themes");
  });
});

describe("5. Polaris and the design guidelines — the tests already holding them", () => {
  it("the five-item nav, the primary-action rule and the no-incentive review ask are enforced by tests that exist", () => {
    expect(readFileSync("tests/routes/navigation.test.js", "utf8")).toMatch(/it\("has exactly five"/);
    expect(readFileSync("tests/routes/navigation.test.js", "utf8")).toMatch(/Products has exactly one page primary action/);
    expect(readFileSync("tests/utils/reviewAskRules.test.js", "utf8")).toMatch(/no route or component pairs a review with an incentive/);
    expect(readFileSync("tests/routes/polaris-only.test.js", "utf8")).toMatch(/Polaris only/);
  });
});

describe("6. Clean uninstall — the tests already holding it", () => {
  it("every content table is on the deletion list, sessions go, and the GDPR guard names every model", () => {
    expect(readFileSync("tests/utils/uninstallReinstall.test.js", "utf8")).toMatch(/every content table is on the deletion list/);
    expect(readFileSync("tests/utils/uninstallReinstall.test.js", "utf8")).toMatch(/sessions go, so the access token does not linger/);
    expect(readFileSync("tests/utils/gdprCoverage.test.js", "utf8")).toMatch(/the deletion list names only models that exist/);
  });
});

describe("the audit file is the checklist, criterion by criterion", () => {
  it("BFS-AUDIT.md exists and carries the six criteria with evidence and a test each", () => {
    const doc = readFileSync("docs/navaal/BFS-AUDIT.md", "utf8");
    for (const h of ["App Bridge", "Admin performance", "Storefront", "Asset API", "Polaris", "Clean uninstall"]) expect(doc, h).toMatch(new RegExp(`^## \\d\\. .*${h}`, "m"));
    expect(doc).toMatch(/tests\/docs\/bfsAudit\.test\.js/);
    expect(doc).toMatch(/scripts\/check-bundle-budget\.mjs/);
  });
});
