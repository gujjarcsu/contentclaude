/**
 * Phase 12 Part D — the i18n layer.
 *
 *   - no hard-coded merchant-visible string outside the catalogue: the
 *     extractor's --check pass finds nothing left to wrap
 *   - locales/en.json is exactly the set of keys the source uses — routes,
 *     components AND the pure utils that build merchant sentences — no stale
 *     key, no missing key (the catalogue translators work from is the truth)
 *   - a shipped locale is complete: every English key has a value, none
 *     empty, every placeholder and plural block preserved
 *   - English is unchanged by construction: t(key) === key for every key
 *   - the four places a live locale must appear agree (D1): LIVE_UI_LOCALES,
 *     locales/<loc>.json, the lazy chunk, the server import
 *   - the browser loads the document's locale before hydrating (D1)
 *   - interpolation, plurals by locale, numbers and dates by locale
 *   - the locale comes from Shopify's param, normalised, overridable
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createT, interpolate, normaliseUiLocale, localeFromAcceptLanguage, SUPPORTED_UI_LOCALES, LIVE_UI_LOCALES, catalogueFor, polarisFor, localeFromRequest, T, enT } from "../../app/i18n/index.js";
import { SERVER_CATALOGUES, SERVER_POLARIS } from "../../app/i18n/catalogues.server.js";
import { UI_LOCALE_CHUNKS } from "../../app/i18n/chunks.js";

const en = JSON.parse(readFileSync("app/i18n/locales/en.json", "utf8"));

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(name)) out.push(p);
  }
  return out;
};

/** every key the source passes to t("…") / T("…") — double- or single-quoted */
export function keysInSource() {
  const keys = new Set();
  for (const f of [...walk("app/routes"), ...walk("app/components"), ...walk("app/utils"), ...walk("app/queues")]) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/\b[tT]\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) {
      keys.add(m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2].replace(/\\(['"\\])/g, "$1"));
    }
  }
  return keys;
}

/** top-level `{name}` and `{name, plural, …}` blocks of a catalogue string, by brace matching */
export function placeholders(s) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const inner = s.slice(start + 1, i);
        const name = inner.split(/[,}]/)[0].trim();
        if (/^\w+$/.test(name)) out.push(inner.includes("plural") ? `${name}:plural` : name);
        start = -1;
      }
    }
  }
  return out.sort();
}

describe("no hard-coded merchant-visible string outside the catalogue", () => {
  it("the extractor's --check pass finds nothing left to wrap", () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync(process.execPath, ["scripts/i18n-extract.mjs", "--check"], { encoding: "utf8" });
    } catch (e) {
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      code = e.status ?? 1;
    }
    expect(code, out).toBe(0);
    expect(out).toMatch(/ok: every merchant-visible literal is wrapped/);
  }, 60_000);

  it("en.json is exactly the keys the source uses — routes, components and the pure utils", () => {
    const inSource = keysInSource();
    const inCatalogue = new Set(Object.keys(en));
    const missing = [...inSource].filter((k) => !inCatalogue.has(k));
    const stale = [...inCatalogue].filter((k) => !inSource.has(k));
    expect(missing, "keys in source but not in en.json — run node scripts/i18n-extract.mjs --apply").toEqual([]);
    expect(stale, "keys in en.json no longer in the source — run node scripts/i18n-extract.mjs --apply").toEqual([]);
    expect(inSource.size).toBeGreaterThan(900);
  });

  it("English is unchanged by construction: every value equals its key", () => {
    for (const [k, v] of Object.entries(en)) expect(v, k).toBe(k);
    const t = createT("en");
    expect(t("Review drafts")).toBe("Review drafts");
    expect(t("A key nobody catalogued")).toBe("A key nobody catalogued");
    expect(enT("{n, plural, one {# draft} other {# drafts}}", { n: 2 })).toBe("2 drafts");
  });

  it("the extractor catalogues every pure module that carries keys — a util that starts using T() cannot be forgotten", () => {
    const script = readFileSync("scripts/i18n-extract.mjs", "utf8");
    for (const f of [...walk("app/utils"), ...walk("app/queues")]) {
      const s = readFileSync(f, "utf8");
      if (!/\b[tT]\((?:"|')/.test(s)) continue;
      expect(script, `${f} carries keys but is not in CATALOGUE_ONLY`).toContain(`"${f.replace(/\\/g, "/")}"`);
    }
  });
});

describe("every shipped locale is complete", () => {
  for (const loc of LIVE_UI_LOCALES.filter((l) => l !== "en")) {
    it(`${loc}: every English key has a non-empty value, no key is extra, every placeholder and plural survives`, () => {
      const file = `app/i18n/locales/${loc}.json`;
      expect(existsSync(file), file).toBe(true);
      const table = JSON.parse(readFileSync(file, "utf8"));
      expect(SERVER_CATALOGUES[loc]).toEqual(table); // what the server ships is what is on disk
      expect(catalogueFor(loc)).toEqual(table); // and it is registered at import
      const missing = Object.keys(en).filter((k) => !(k in table) || !String(table[k]).trim());
      const extra = Object.keys(table).filter((k) => !(k in en));
      expect(missing, `${loc} is missing ${missing.length} key(s): ${missing.slice(0, 5).join(" | ")}`).toEqual([]);
      expect(extra, `${loc} has keys English does not: ${extra.slice(0, 5).join(" | ")}`).toEqual([]);
      for (const [k, v] of Object.entries(table)) {
        expect(placeholders(v), `${loc}: placeholders differ for ${k.slice(0, 60)}`).toEqual(placeholders(k));
        // a plural block needs both forms in every language we ship (all have one/other)
        for (const m of String(v).matchAll(/\{\w+,\s*plural,([^}]*\{[^}]*\})+\s*\}/g)) {
          expect(m[0], `${loc}: plural block without one/other in ${k.slice(0, 60)}`).toMatch(/\bone\s*\{/);
          expect(m[0]).toMatch(/\bother\s*\{/);
        }
      }
    });
  }

  it("the four places a live locale must appear agree: LIVE_UI_LOCALES, the server import, the lazy chunk, Polaris", () => {
    expect(LIVE_UI_LOCALES).toEqual(["en", ...Object.keys(SERVER_CATALOGUES)]);
    expect(Object.keys(UI_LOCALE_CHUNKS).sort()).toEqual(LIVE_UI_LOCALES.filter((l) => l !== "en").sort());
    const chunks = readFileSync("app/i18n/chunks.js", "utf8");
    for (const l of LIVE_UI_LOCALES) {
      expect(SUPPORTED_UI_LOCALES).toContain(l);
      if (l === "en") continue;
      expect(SERVER_POLARIS[l], `Polaris strings for ${l} on the server`).toBeTruthy();
      expect(polarisFor(l), `Polaris strings for ${l} registered`).toBeTruthy();
      expect(chunks).toContain(`import("./locales/${l}.json")`);
      expect(chunks).toContain(`import("@shopify/polaris/locales/${l}.json")`);
    }
    // nothing static for English, and no catalogue in the shared client code
    expect(chunks).not.toMatch(/import\("\.\/locales\/en\.json"\)/);
    expect(readFileSync("app/i18n/index.js", "utf8")).not.toMatch(/^import .*locales\//m);
  });

  it("no screen formats a date in a fixed English locale, and the quota month travels as an instant (D3)", () => {
    // Found on the French read-back: the usage card said "September" because
    // planFit.js formatted it with "en-GB" in the loader. A loader ships data;
    // the screen formats it with t.date in ITS locale.
    const fixed = /toLocale(?:Date|Time)?String\(\s*["'](?:en(?:-[A-Z]{2})?|default)["']/;
    const offenders = [...walk("app/routes"), ...walk("app/components"), ...walk("app/utils")]
      .filter((f) => fixed.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    for (const f of ["app/utils/quotaSurfaces.server.js", "app/utils/upgradePrompts.server.js"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/monthAt: new Date\(now\)\.toISOString\(\)/);
      expect(src, f).toMatch(/resetAt: quotaResetDate\(now\)\.toISOString\(\)/);
      expect(src, f).not.toMatch(/fmtDay|fmtMonth|monthName:|resetDate:/);
    }
    const prompt = readFileSync("app/components/UpgradePrompt.jsx", "utf8");
    expect(prompt).toMatch(/t\.date\(iso, QUOTA_MONTH_FORMAT\)/);
    expect(prompt).toMatch(/t\.date\(iso, QUOTA_RESET_FORMAT\)/);
  });

  it("the browser loads the document's locale before hydrating, and the document carries the locale", () => {
    const entry = readFileSync("app/entry.client.jsx", "utf8");
    expect(entry).toMatch(/documentElement\.getAttribute\("lang"\)/);
    expect(entry.indexOf("loadUiLocale(locale)")).toBeGreaterThan(-1);
    expect(entry.indexOf("loadUiLocale(locale)")).toBeLessThan(entry.indexOf("hydrateRoot("));
    const root = readFileSync("app/root.jsx", "utf8");
    expect(root).toMatch(/<html lang=\{uiLocale\}>/);
    expect(root).toMatch(/useMatches\(\)/);
    expect(readFileSync("app/entry.server.jsx", "utf8")).toMatch(/import "\.\/i18n\/catalogues\.server\.js";/);
    // Polaris follows the same registry; the App-level t is re-created when the chunk lands
    const app = readFileSync("app/routes/app.jsx", "utf8");
    expect(app).toMatch(/i18n=\{polarisFor\(uiLocale\) \?\? enTranslations\}/);
    expect(app).toMatch(/useLocaleLoaded\(uiLocale\)/);
  });
});

describe("the runtime", () => {
  it("interpolates placeholders and ICU plurals by locale, and leaves unknown placeholders visible", () => {
    expect(interpolate("Review {n} draft{s}", { n: 3, s: "s" })).toBe("Review 3 drafts");
    expect(interpolate("{n, plural, one {# Entwurf} other {# Entwürfe}}", { n: 1 }, "de")).toBe("1 Entwurf");
    expect(interpolate("{n, plural, one {# Entwurf} other {# Entwürfe}}", { n: 4 }, "de")).toBe("4 Entwürfe");
    expect(interpolate("{n, plural, =0 {none} one {one} other {many}}", { n: 0 }, "en")).toBe("none");
    expect(interpolate("{n, plural, one {# product has} other {# products have}} no title, {n, plural, one {it} other {they}} …", { n: 2 })).toBe("2 products have no title, they …");
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
  });

  it("numbers, dates and currency follow the locale", () => {
    const de = createT("de");
    const en = createT("en");
    expect(en.number(1234.5)).toBe("1,234.5");
    expect(de.locale).toBe("de");
    expect(de.number(1234.5)).toBe("1.234,5");
    expect(en.date("2026-09-14T00:00:00Z")).toMatch(/September 1[34]/);
    expect(de.date("2026-09-14T12:00:00Z")).toMatch(/14\. September/);
    expect(en.currency(9.99)).toBe("$9.99");
  });

  it("Shopify's locale param is normalised to one of ours, and anything else is English", () => {
    expect(normaliseUiLocale("fr-FR")).toBe("fr");
    expect(normaliseUiLocale("de")).toBe("de");
    expect(normaliseUiLocale("pt-BR")).toBe("pt-BR");
    expect(normaliseUiLocale("pt")).toBe("pt-BR");
    expect(normaliseUiLocale("ja-JP")).toBe("ja");
    expect(normaliseUiLocale("tlh")).toBe("en");
    expect(normaliseUiLocale(null)).toBe("en");
    expect(localeFromRequest(new Request("https://app.navaal.ai/app?shop=x&locale=es-MX"))).toBe("es");
    expect(T("Marked at module level")).toBe("Marked at module level");
  });

  it("Accept-Language picks the first language we ship; English anywhere first wins; an unshipped language is English", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(localeFromAcceptLanguage("en-US,de;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("ja-JP,ja;q=0.9")).toBe("en"); // ja is not live yet
    expect(localeFromAcceptLanguage("")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("a locale without a catalogue falls back to English rather than to blanks", () => {
    const t = createT("ja");
    expect(t("Review drafts")).toBe("Review drafts");
  });
});
