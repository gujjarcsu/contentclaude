/**
 * Phase 12 Part D — every live locale beyond English, held to the same
 * register rules the German catalogue was held to (tests/utils/i18nGerman.test.js
 * holds German's own sentences; this file holds the rules for all of them):
 *
 *   - a formal address where the language has one (the listing's register)
 *   - the credit unit, the plan names and the app name kept
 *   - not English left in place
 *   - the public legal pages render in it, same anchors, English binding
 *   - the weekly report reads in it
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createT, LIVE_UI_LOCALES, UI_LOCALE_NAMES } from "../../app/i18n/index.js";
import "../../app/i18n/catalogues.server.js";
import { legalPage } from "../../app/utils/legalPage.server.js";
import { composeWeeklyReport } from "../../app/utils/weeklyReport.server.js";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "../../app/utils/legal.js";

/**
 * The register is the listing's (LISTING-TRANSLATIONS.md): German and French
 * address the merchant formally (Sie / vous), Spanish and Italian informally
 * (tú / tu), Brazilian Portuguese with the neutral você, Japanese politely.
 * What is forbidden in a catalogue is the OTHER register. Boundaries are
 * Unicode-aware: JavaScript's \b is ASCII, so "prêtes" would end in a "tes"
 * it thinks is a word.
 */
const word = (forms, flags = "iu") => new RegExp(`(?<![\\p{L}'’])(${forms})(?![\\p{L}])`, flags);
const FORBIDDEN = {
  de: word("du|dich|dir|dein|deine|deinem|deinen|deiner|deines|deins"),
  fr: word("tu|toi|ta|tes"), // "ton" is the noun in "ton de marque"
  es: word("usted|ustedes"),
  it: word("Lei|Suo|Sua|Suoi|Sue", "u"), // the capitalised formal forms only
  "pt-BR": word("tu|teu|tua|teus|tuas|senhor|senhora"),
  ja: null,
};
/** What the credit unit reads as, by language (the listing's word). */
const CREDIT = { de: /\bCredits?\b/, fr: /\bcrédits?\b/i, es: /\bcréditos?\b/i, it: /\bcredit[io]\b/i, "pt-BR": /\bcréditos?\b/i, ja: /クレジット/ };
/** Keys allowed to equal their English (brand line, placeholder-only strings, loanwords). */
const SAME_ALLOWED = new Set(["AI SEO, AEO & GEO", "FAQ (Navaal)", "Sydney, Australia", "{total} collections", "{surface} · {field}", "SEO {before} → {after}", "+{delta} {sincePhrase}", " · {elapsedTime}", "Keywords (optional)", "Instagram", "Facebook", "TikTok", "FAQ", "Blog", "Meta", "Meta Desc:", "Meta Title:"]);
const SAME_SHORT = /^([A-Z][A-Za-z]*|[^A-Za-z]*|.{0,12})$/;

const reported = { status: "reported", reportedAt: "2026-09-14T00:00:00Z", seed: 7, summary: { enough: true, favourable: true, diffHours: 31, lo: 9, hi: 52, submit: { n: 6, crawled: 6, medianHours: 4, censored: 0 }, hold: { n: 6, crawled: 6, medianHours: 35, censored: 0 } } };

for (const loc of LIVE_UI_LOCALES.filter((l) => l !== "en")) {
  describe(`${loc} — ${UI_LOCALE_NAMES[loc]}`, () => {
    const t = createT(loc);
    const table = JSON.parse(readFileSync(`app/i18n/locales/${loc}.json`, "utf8"));

    it("is live and translates", () => {
      expect(t.locale).toBe(loc);
      expect(t("Settings")).not.toBe("Settings");
      expect(t("Review drafts")).toBe(table["Review drafts"]);
    });

    it("addresses the merchant in the listing's register", () => {
      const forbidden = FORBIDDEN[loc];
      if (!forbidden) return;
      const offenders = Object.entries(table).filter(([, v]) => forbidden.test(String(v)));
      expect(offenders.map(([k]) => k.slice(0, 60)), `wrong register in ${loc}.json`).toEqual([]);
    });

    it("keeps the credit unit, the plan names and the app name", () => {
      const toneLabels = new Set(["Professional & Trustworthy"]);
      for (const [k, v] of Object.entries(table)) {
        if (/\bNavaal\b/.test(k)) expect(v, `app name dropped: ${k.slice(0, 60)}`).toMatch(/Navaal/);
        if (/\bcredits?\b/i.test(k)) expect(v, `credit unit translated away: ${k.slice(0, 60)}`).toMatch(CREDIT[loc]);
        if (toneLabels.has(k)) continue;
        for (const plan of ["Starter", "Growth", "Professional"]) if (new RegExp(`\\b${plan}\\b`).test(k)) expect(v, `${plan} renamed in: ${k.slice(0, 60)}`).toContain(plan);
      }
    });

    it("is not English left in place", () => {
      const same = Object.entries(table).filter(([k, v]) => k === v);
      const suspicious = same.filter(([k]) => !SAME_ALLOWED.has(k) && !SAME_SHORT.test(k) && /\s/.test(k) && k.length > 14);
      expect(suspicious.map(([k]) => k), `English left untranslated in ${loc}`).toEqual([]);
    });

    it("the legal pages render in it from the same constants, same anchors, English binding", async () => {
      const html = await legalPage("privacy", { locale: loc }).text();
      expect(html).toMatch(new RegExp(`<html lang="${loc}">`));
      expect(html).toContain('id="p2-the-short-version"');
      expect(html).toContain(`>${t("The short version")}</h3>`);
      expect(html).toContain(t("This translation is provided for convenience. The English version is the binding one."));
      expect(html).toContain('<link rel="canonical" href="https://app.navaal.ai/privacy">');
      const terms = await legalPage("terms", { locale: loc }).text();
      expect(terms).toContain(`>${t("What we do not promise")}</h2>`);
      for (const s of [...PRIVACY_SECTIONS, ...TERMS_SECTIONS]) expect(table[s.h], `heading not translated: ${s.h}`).toBeTruthy();
    });

    it("the weekly report reads in it", () => {
      const r = composeWeeklyReport({ storeHandle: "s", experiments: [reported], sinceAt: null, attentionCount: 2, locale: loc });
      expect(r.subject).toBe(t("Your crawl-time result is in"));
      expect(r.subject).not.toBe("Your crawl-time result is in");
      expect(r.text).toContain("/app/proof");
    });
  });
}
