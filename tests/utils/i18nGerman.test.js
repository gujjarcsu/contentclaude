/**
 * Phase 12 Part D (D1) — the app speaks German.
 *
 *   - the German catalogue is live: createT("de") returns German, plurals
 *     take the German forms, and a stored English sentence is translated
 *     back by the key that produced it
 *   - the register is the listing's (LISTING-TRANSLATIONS.md): formal
 *     address only, the credit unit, the plan names and the app name left
 *     as they are
 *   - the public legal pages render in German from the same constants,
 *     with the same anchors, and say the English is binding
 *   - the weekly report reads in the merchant's language
 *   - the pure utils produce the same English they always did (their tests
 *     hold) and German when given a German t
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createT, enT, LIVE_UI_LOCALES } from "../../app/i18n/index.js";
import "../../app/i18n/catalogues.server.js";
import { compileStoredKeys, storedTranslator } from "../../app/i18n/stored.js";
import { STORED_KEYS, storedTFor } from "../../app/i18n/storedKeys.js";
import { GRADE_NOTES, gradeProduct, homeAttentionLines, attentionSentence } from "../../app/utils/catalogueWatch.js";
import { blockerLines, WATCH_FROM_HERE } from "../../app/utils/firstRun.js";
import { costSentence } from "../../app/utils/startCopy.js";
import { plainSentence, verdictSentence } from "../../app/utils/crawlHoldout.js";
import { autopilotBannerTitle, changeWindowFor } from "../../app/utils/homeCopy.js";
import { verifyProductUpdate, VERIFY_NOTES } from "../../app/utils/publishVerify.js";
import { JOB_MESSAGES, QUICK_START_MESSAGES } from "../../app/utils/jobMessages.js";
import { validateSupportRequest } from "../../app/utils/support.js";
import { composeWeeklyReport } from "../../app/utils/weeklyReport.server.js";
import { legalPage, legalLocaleFor } from "../../app/utils/legalPage.server.js";
import { LAST_UPDATED, LAST_UPDATED_ISO, PRIVACY_SECTIONS, TERMS_SECTIONS } from "../../app/utils/legal.js";

const de = createT("de");
const en = createT("en");
const table = JSON.parse(readFileSync("app/i18n/locales/de.json", "utf8"));

describe("German is live", () => {
  it("is in the live list and translates", () => {
    expect(LIVE_UI_LOCALES).toContain("de");
    expect(de.locale).toBe("de");
    expect(de("Review drafts")).not.toBe("Review drafts");
    expect(de("Review drafts")).toBe(table["Review drafts"]);
    expect(de("Settings")).toBe("Einstellungen");
  });

  it("plurals take the German forms", () => {
    const one = de("{n, plural, one {# draft} other {# drafts}} ready to review", { n: 1 });
    const many = de("{n, plural, one {# draft} other {# drafts}} ready to review", { n: 3 });
    expect(one).not.toBe(many);
    expect(one).toMatch(/^1 /);
    expect(many).toMatch(/^3 /);
    expect(one).not.toMatch(/draft/);
  });
});

describe("the register", () => {
  it("addresses the merchant formally — never du/dein — as the listing does", () => {
    const informal = /\b(du|dich|dir|dein|deine|deinem|deinen|deiner|deines|deins)\b/i;
    const offenders = Object.entries(table).filter(([, v]) => informal.test(String(v)));
    expect(offenders.map(([k]) => k.slice(0, 60)), "informal address in de.json").toEqual([]);
  });

  it("keeps the credit unit, the plan names and the app name", () => {
    const toneLabels = new Set(["Professional & Trustworthy"]); // a tone name, not the plan
    for (const [k, v] of Object.entries(table)) {
      if (/\bNavaal\b/.test(k)) expect(v, `app name dropped: ${k.slice(0, 60)}`).toMatch(/Navaal/);
      if (/\bcredits?\b/i.test(k)) expect(v, `credit unit translated away: ${k.slice(0, 60)}`).toMatch(/\bCredits?\b/);
      if (toneLabels.has(k)) continue;
      for (const plan of ["Starter", "Growth", "Professional"]) if (new RegExp(`\\b${plan}\\b`).test(k)) expect(v, `${plan} renamed in: ${k.slice(0, 60)}`).toContain(plan);
    }
  });

  it("is German, not English left in place: no value equals its key beyond the untranslatable ones", () => {
    const same = Object.entries(table).filter(([k, v]) => k === v);
    // Names, codes, single symbols and product-type words that are the same in German may stay,
    // and so may the brand line under the logo and a handful of placeholder-only strings.
    const allowedExact = new Set(["AI SEO, AEO & GEO", "FAQ (Navaal)", "{surface} · {field}", "SEO {before} → {after}", "+{delta} {sincePhrase}", " · {elapsedTime}", "Keywords (optional)"]);
    const allowed = /^([A-Z][A-Za-z]*|FAQ|TikTok|Instagram|Facebook|Bing|Google|Navaal|Nav|Meta|Meta Desc:|Meta Title:|Anthropic|Shopify|SEO|GEO|Blog|Home|Desc|Q&A pairs|[^A-Za-z]*|.{0,12})$/;
    const suspicious = same.filter(([k]) => !allowedExact.has(k) && !allowed.test(k) && /\s/.test(k) && k.length > 14);
    expect(suspicious.map(([k]) => k), "English left untranslated").toEqual([]);
  });
});

describe("stored English sentences are translated back by their key", () => {
  it("compiles keys into matchers and recovers the placeholders", () => {
    const compiled = compileStoredKeys(["Under {n} characters — a label.", "Plain sentence."]);
    const fake = Object.assign((k, v) => `DE[${k}]${JSON.stringify(v ?? {})}`, { locale: "de" });
    const st = storedTranslator(fake, compiled);
    expect(st("Under 120 characters — a label.")).toBe('DE[Under {n} characters — a label.]{"n":"120"}');
    expect(st("Plain sentence.")).toBe("DE[Plain sentence.]{}");
    expect(st("Something no key produced")).toBe("Something no key produced");
    expect(st(null)).toBe(null);
    expect(storedTranslator(en, compiled)("Plain sentence.")).toBe("Plain sentence.");
    expect(() => compileStoredKeys(["{n, plural, one {a} other {b}}"])).toThrow(/plural/);
  });

  it("a grade note stored last night reads in German today", () => {
    const st = storedTFor(de);
    const { findings } = gradeProduct({ id: "gid://shopify/Product/1", title: "T", description: "short", vendor: "", status: "ACTIVE", onlineStoreUrl: "https://s/products/t", variants: { nodes: [{ barcode: "" }] }, options: [] });
    const thin = findings.find((f) => f.field === "description");
    expect(thin.note).toBe(enT(GRADE_NOTES.thin, { n: 120 })); // stored in English
    expect(st(thin.note)).toBe(de(GRADE_NOTES.thin, { n: "120" })); // read back in German
    expect(st(thin.note)).not.toBe(thin.note);
    expect(STORED_KEYS.length).toBeGreaterThan(40);
  });

  it("a job's error, a draft's failure, a verification note, a support error", () => {
    const st = storedTFor(de);
    expect(st(JOB_MESSAGES.productNotFound)).toBe(de(JOB_MESSAGES.productNotFound));
    expect(st(QUICK_START_MESSAGES.rateLimited(30))).toBe(de("Too many at once — try again in {seconds}s.", { seconds: "30" }));
    const v = verifyProductUpdate({ seo: { title: "A long title" } }, { seo: { title: "A long" } });
    expect(v.note).toBe(VERIFY_NOTES.titleShorter);
    expect(st(v.note)).toBe(de(VERIFY_NOTES.titleShorter));
    expect(validateSupportRequest({ replyTo: "nope", subject: "s", message: "m" }, de).error).toBe(de("We need an email address we can reply to. Please check it and try again."));
  });
});

describe("the pure utils: the same English by default, German when asked", () => {
  it("attention lines", () => {
    const s = { crawler: { blocked: ["Googlebot"] }, blocking: 2, needAttention: 3, sinceYesterday: 1 };
    expect(homeAttentionLines(s)).toEqual(["Googlebot is blocked from your storefront.", "2 products are missing something an AI shopping surface requires.", "3 products need attention, 1 since yesterday."]);
    expect(attentionSentence({ needAttention: 1, sinceYesterday: 0 })).toBe("1 product needs attention.");
    const lines = homeAttentionLines(s, de);
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l).not.toMatch(/blocked from|missing something|need attention/);
    expect(lines[0]).toContain("Googlebot");
  });

  it("first-run blockers and the sentence that names the subscription", () => {
    const tally = { "openai·description·blocking": 2, "openai·link·blocking": 1 };
    expect(blockerLines(tally).map((b) => b.line)).toEqual([
      "2 products have no description — the OpenAI product feed cannot list them. The first three are being written below.",
      "1 product is not on your Online Store channel, so it has no public page.",
    ]);
    const german = blockerLines(tally, { t: de });
    expect(german[0].line).not.toMatch(/products have/);
    expect(german[0].line).toMatch(/^2 /);
    expect(german[1].line).toMatch(/^1 /);
    expect(de(WATCH_FROM_HERE.title)).not.toBe(WATCH_FROM_HERE.title);
  });

  it("the cost sentence, the holdout sentences, the autopilot banner", () => {
    const p = { targets: 3, fresh: 3, canStart: 3, remaining: 100, monthlyCredits: 100, planName: "free" };
    expect(costSentence(p)).toBe("Writing 3 drafts now — 3 credits; 97 of 100 left after this on the Free plan. Nothing is published until you approve it.");
    expect(costSentence({ ...p, t: de })).toMatch(/3 .* 97 .*100/);
    expect(costSentence({ ...p, t: de })).toMatch(/Credits/);
    const summary = { enough: true, favourable: true, diffHours: 31, lo: 9, hi: 52, submit: { n: 6, crawled: 6, medianHours: 4, censored: 0 }, hold: { n: 6, crawled: 6, medianHours: 35, censored: 0 } };
    expect(plainSentence(summary)).toBe("Pages we submitted were crawled a median 31 hours sooner than pages we didn't — with this few pages the honest range is 9 to 52 hours.");
    expect(plainSentence(summary, de)).not.toMatch(/Pages we submitted/);
    expect(plainSentence(summary, de)).toMatch(/31/);
    expect(verdictSentence(summary, de)).toMatch(/95/);
    expect(autopilotBannerTitle({ products: 2 }, changeWindowFor(null, new Date()))).toBe("Autopilot optimized 2 new products in the last 24 hours");
    expect(autopilotBannerTitle({ products: 2 }, changeWindowFor(null, new Date(), de), de)).not.toMatch(/new products/);
    expect(changeWindowFor({ since: "2026-09-14T00:00:00Z" }, new Date(), de).label).toMatch(/14\. September/);
  });
});

describe("the legal pages and the weekly report", () => {
  it("/privacy renders in German from the same constants, same anchors, and says the English is binding", async () => {
    const html = await legalPage("privacy", { locale: "de" }).text();
    expect(html).toMatch(/<html lang="de">/);
    expect(html).toContain('id="p2-the-short-version"'); // the anchor is the English key's slug
    expect(html).toContain(`>${de("The short version")}</h3>`);
    expect(html).not.toContain(">The short version</h3>");
    expect(html).toContain(de("This translation is provided for convenience. The English version is the binding one."));
    expect(html).toContain('href="/privacy?locale=en"');
    expect(html).toContain('<link rel="canonical" href="https://app.navaal.ai/privacy">');
    expect(html).toContain("15. September 2026");
    // the English page is what it was
    const english = await legalPage("privacy").text();
    expect(english).toMatch(/<html lang="en">/);
    expect(english).toContain(">The short version</h3>");
    expect(english).not.toContain("binding one");
    expect(english).toContain(`Last updated ${LAST_UPDATED}`);
  });

  it("/terms in German too, and every section key of both documents is in the catalogue", async () => {
    const html = await legalPage("terms", { locale: "de" }).text();
    expect(html).toMatch(/<html lang="de">/);
    expect(html).toContain(`>${de("What we do not promise")}</h2>`);
    for (const s of [...PRIVACY_SECTIONS, ...TERMS_SECTIONS]) expect(table[s.h], `heading not translated: ${s.h}`).toBeTruthy();
  });

  it("the locale of a public page: ?locale= first, then Accept-Language, else English; an unshipped language is English", () => {
    const req = (url, al) => new Request(url, al ? { headers: { "accept-language": al } } : undefined);
    expect(legalLocaleFor(req("https://app.navaal.ai/privacy?locale=de"))).toBe("de");
    expect(legalLocaleFor(req("https://app.navaal.ai/privacy?locale=ja"))).toBe("en"); // ja is not live yet
    expect(legalLocaleFor(req("https://app.navaal.ai/privacy", "de-AT,de;q=0.9"))).toBe("de");
    expect(legalLocaleFor(req("https://app.navaal.ai/privacy", "en-GB,de;q=0.9"))).toBe("en");
    expect(legalLocaleFor(req("https://app.navaal.ai/privacy"))).toBe("en");
    expect(new Date(LAST_UPDATED_ISO).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })).toBe(LAST_UPDATED);
  });

  it("the weekly report reads in the merchant's language", () => {
    const reported = { status: "reported", reportedAt: "2026-09-14T00:00:00Z", seed: 7, summary: { enough: true, favourable: true, diffHours: 31, lo: 9, hi: 52, submit: { n: 6, crawled: 6, medianHours: 4, censored: 0 }, hold: { n: 6, crawled: 6, medianHours: 35, censored: 0 } } };
    const base = { storeHandle: "s", experiments: [reported], sinceAt: null, attentionCount: 2 };
    const english = composeWeeklyReport(base);
    expect(english.subject).toBe("Your crawl-time result is in");
    const german = composeWeeklyReport({ ...base, locale: "de" });
    expect(german.subject).toBe(de("Your crawl-time result is in"));
    expect(german.subject).not.toBe(english.subject);
    expect(german.text).toContain("/app/proof");
    expect(german.text).not.toMatch(/products currently need attention/);
    expect(german.text).toMatch(/^2 /m);
  });
});
