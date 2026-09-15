/**
 * Phase 12 Part D — the i18n layer.
 *
 *   - no hard-coded merchant-visible string outside the catalogue: the
 *     extractor's --check pass finds nothing left to wrap
 *   - locales/en.json is exactly the set of keys the source uses — no stale
 *     key, no missing key (the catalogue translators work from is the truth)
 *   - a shipped locale is complete: every English key has a value, none empty
 *   - English is unchanged by construction: t(key) === key for every key
 *   - interpolation, plurals by locale, numbers and dates by locale
 *   - the locale comes from Shopify's param, normalised, overridable
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createT, interpolate, normaliseUiLocale, SUPPORTED_UI_LOCALES, LIVE_UI_LOCALES, CATALOGUES, localeFromRequest, T } from "../../app/i18n/index.js";

const en = JSON.parse(readFileSync("app/i18n/locales/en.json", "utf8"));

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx$/.test(name)) out.push(p);
  }
  return out;
};

/** every key the source passes to t("…") / T("…") */
function keysInSource() {
  const keys = new Set();
  for (const f of [...walk("app/routes"), ...walk("app/components")]) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/\b[tT]\("((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  }
  return keys;
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

  it("en.json is exactly the keys the source uses", () => {
    const inSource = keysInSource();
    const inCatalogue = new Set(Object.keys(en));
    const missing = [...inSource].filter((k) => !inCatalogue.has(k));
    const stale = [...inCatalogue].filter((k) => !inSource.has(k));
    expect(missing, "keys in source but not in en.json — run node scripts/i18n-extract.mjs --apply").toEqual([]);
    expect(stale, "keys in en.json no longer in the source — run node scripts/i18n-extract.mjs --apply").toEqual([]);
    expect(inSource.size).toBeGreaterThan(800);
  });

  it("English is unchanged by construction: every value equals its key", () => {
    for (const [k, v] of Object.entries(en)) expect(v, k).toBe(k);
    const t = createT("en");
    expect(t("Review drafts")).toBe("Review drafts");
    expect(t("A key nobody catalogued")).toBe("A key nobody catalogued");
  });
});

describe("every shipped locale is complete", () => {
  for (const loc of LIVE_UI_LOCALES.filter((l) => l !== "en")) {
    it(`${loc}: every English key has a non-empty value, and no key is extra`, () => {
      const table = JSON.parse(readFileSync(`app/i18n/locales/${loc}.json`, "utf8"));
      expect(CATALOGUES[loc]).toEqual(table); // what ships is what is on disk
      const missing = Object.keys(en).filter((k) => !(k in table) || !String(table[k]).trim());
      const extra = Object.keys(table).filter((k) => !(k in en));
      expect(missing, `${loc} is missing ${missing.length} key(s)`).toEqual([]);
      expect(extra, `${loc} has keys English does not`).toEqual([]);
      // placeholders survive translation
      for (const [k, v] of Object.entries(table)) {
        const ph = (s) => [...String(s).matchAll(/\{(\w+)(?:,\s*plural[^}]*\{[^}]*\}[^}]*)?\}/g)].map((m) => m[1]).sort();
        expect(ph(v), `${loc}: placeholders differ for ${k.slice(0, 50)}`).toEqual(ph(k));
      }
    });
  }
  it("the live locales are English plus the catalogues that ship; Polaris has a locale file for each; every one is supported", () => {
    expect(LIVE_UI_LOCALES).toEqual(["en", ...Object.keys(CATALOGUES)]);
    for (const l of LIVE_UI_LOCALES) expect(SUPPORTED_UI_LOCALES).toContain(l);
    const app = readFileSync("app/routes/app.jsx", "utf8");
    const polaris = [...app.matchAll(/^const POLARIS_I18N = \{([^}]*)\};/gm)][0]?.[1] ?? "";
    for (const l of LIVE_UI_LOCALES) expect(polaris, `Polaris strings for ${l}`).toMatch(new RegExp(`(^|[\\s{,])"?${l.replace("-", "\\-")}"?:`));
  });
});

describe("the runtime", () => {
  it("interpolates placeholders and ICU plurals by locale, and leaves unknown placeholders visible", () => {
    expect(interpolate("Review {n} draft{s}", { n: 3, s: "s" })).toBe("Review 3 drafts");
    expect(interpolate("{n, plural, one {# Entwurf} other {# Entwürfe}}", { n: 1 }, "de")).toBe("1 Entwurf");
    expect(interpolate("{n, plural, one {# Entwurf} other {# Entwürfe}}", { n: 4 }, "de")).toBe("4 Entwürfe");
    expect(interpolate("{n, plural, =0 {none} one {one} other {many}}", { n: 0 }, "en")).toBe("none");
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
  });

  it("numbers, dates and currency follow the locale", () => {
    const de = createT("de");
    const en = createT("en");
    expect(en.number(1234.5)).toBe("1,234.5");
    expect(de.locale).toBe(LIVE_UI_LOCALES.includes("de") ? "de" : "en");
    expect(en.date("2026-09-14T00:00:00Z")).toMatch(/September 1[34]/);
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

  it("a locale without a catalogue falls back to English rather than to blanks", () => {
    const t = createT("ja");
    expect(t("Review drafts")).toBe("Review drafts");
  });
});
