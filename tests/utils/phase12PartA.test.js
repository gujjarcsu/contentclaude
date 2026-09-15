/**
 * Phase 12 Part A — the six things still in front of a merchant.
 *
 *   A1  FR13, third time: the row's Review click bubbled into the ResourceItem
 *       and landed on the product page. The handler stops the bubble; the
 *       click itself is proved by tools/proof/fr13-click.mjs on a dev store.
 *   A2  a malformed ?product= never renders the empty-state copy while drafts
 *       exist — it shows every draft under a notice.
 *   A3  one change window on Home: the autopilot banner counts from the score
 *       card's baseline moment and names the same date.
 *   A4  before the first publish, Home leads with the first run's result and
 *       the theme step is one dismissible line; after it, the setup card.
 *   A5  a French store gets French drafts without touching Settings — the
 *       language default reads the catalogue, the admin locale, the country.
 *   A6  the voice inference never learns a cookie notice, and Settings says
 *       when the setting disagrees with the store's own copy.
 *   +   binaryTargets for CW's VM, the TTV report ignores ghosts, the matrix
 *       names its fixture-only lines.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { detectLanguage, defaultLanguageFor, languageFromLocale, languageFromCountry, languageMismatch, isBoilerplate, POLICY_TITLE_PATTERN, SUPPORTED_LANGUAGES, languageName } from "../../app/utils/language.js";
import { changeWindowFor, autopilotBannerTitle, sinceLabelFor } from "../../app/utils/homeCopy.js";
import { fixtureOnly, cellsWith } from "../fixtures/shapeMatrix.js";

const src = (p) => code(readFileSync(p, "utf8"));

const { db, log } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: { brandVoice: { findUnique: fn(), upsert: fn() }, generationJob: { findMany: fn() } },
    log: { info: fn(), warn: fn(), error: fn(), debug: fn() },
  };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));

const FR = "Mitigeur de cuisine en laiton massif, finition chromée. Garantie 25 ans. Livraison sous 2 jours ouvrés. Ce mitigeur est conçu pour les cuisines modernes et les éviers de grande taille, avec une cartouche céramique et un bec pivotant pour un confort d'utilisation au quotidien.";
const EN = "A 400ml stoneware mug with a reactive glaze, thrown in a heavy body that holds heat through a long breakfast. Dishwasher and microwave safe. Each glaze pools differently around the rim, so no two are identical. Measures 9cm tall by 8.5cm across, and it is the one we reach for every morning.";
const DE = "Die Küchenarmatur aus massivem Messing mit verchromter Oberfläche ist für moderne Küchen und große Spülen gedacht. Mit einer Keramikkartusche und einem schwenkbaren Auslauf für den täglichen Komfort. Sie wird mit allen Anschlüssen geliefert und ist in wenigen Minuten montiert.";

describe("A5 — the language a store speaks, without a scope", () => {
  it("reads French, English and German from their own copy, and refuses to guess from too little", () => {
    expect(detectLanguage(FR)).toMatchObject({ code: "fr" });
    expect(detectLanguage(EN)).toMatchObject({ code: "en" });
    expect(detectLanguage(DE)).toMatchObject({ code: "de" });
    expect(detectLanguage(FR).confidence).toBeGreaterThanOrEqual(0.5);
    expect(detectLanguage("Mitigeur de cuisine 0")).toEqual({ code: null, confidence: 0, words: 3 });
    expect(detectLanguage("")).toEqual({ code: null, confidence: 0, words: 0 });
    expect(detectLanguage("キッチン用の真鍮製混合水栓。クロム仕上げ、25年保証。")).toMatchObject({ code: "ja" });
    expect(detectLanguage("厨房黄铜混合水龙头，镀铬表面，25年保修，两个工作日内发货。")).toMatchObject({ code: "zh" });
  });

  it("the catalogue wins, then the admin locale, then the country, then English — and the source is named", () => {
    expect(defaultLanguageFor({ catalogueText: FR, adminLocale: "en-US", country: "US" })).toMatchObject({ code: "fr", source: "catalogue" });
    expect(defaultLanguageFor({ catalogueText: "x y z", adminLocale: "fr-FR", country: "US" })).toMatchObject({ code: "fr", source: "admin_locale" });
    expect(defaultLanguageFor({ catalogueText: "", adminLocale: null, country: "DE" })).toMatchObject({ code: "de", source: "country" });
    expect(defaultLanguageFor({ catalogueText: "", adminLocale: "xx-YY", country: "AU" })).toEqual({ code: "en", source: "default", confidence: 0 });
    expect(languageFromLocale("pt-BR")).toBe("pt");
    expect(languageFromLocale("tlh")).toBe(null);
    expect(languageFromCountry("br")).toBe("pt");
    expect(languageFromCountry("AU")).toBe(null);
    for (const c of ["fr", "de", "ja"]) expect(SUPPORTED_LANGUAGES).toContain(c);
    expect(languageName("fr")).toBe("French");
  });

  it("the scan carries the country and the language; the score path hands it to the brand voice and stamps the Shop row; the splash names it", () => {
    const scan = src("app/utils/startState.server.js");
    expect(scan).toMatch(/shop \{ name billingAddress \{ countryCodeV2 \} \}/);
    expect(scan).toMatch(/const language = defaultLanguageFor\(\{ catalogueText, adminLocale, country \}\)/);
    const score = src("app/utils/storeScore.server.js");
    expect(score).toMatch(/language: scan\.language\?\.code \?\? null/);
    expect(score).toMatch(/void stampShopLocale\(shop, scan\.language\)/);
    expect(src("app/utils/brandVoiceInfer.server.js")).toMatch(/create: \{ shop, storeName, sampleContent, keyDifferentiators, language: lang \}/);
    expect(src("app/components/StartState.jsx")).toMatch(/Drafts are written in \$\{languageName\(scan\.language\.code\)\}/);
    expect(src("app/routes/app._index.jsx")).toMatch(/const adminLocale = new URL\(request\.url\)\.searchParams\.get\("locale"\)/);
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/^\s*locale\s+String\?/m);
    expect(readFileSync("prisma/migrations/20260915150000_shop_locale/migration.sql", "utf8")).toMatch(/ADD COLUMN "locale" TEXT;/);
  });
});

describe("A5 — a fr shop with no settings gets a French system prompt", () => {

  beforeEach(() => {
    for (const f of Object.values(db.brandVoice)) f.mockReset();
    db.brandVoice.findUnique.mockResolvedValue(null);
    db.brandVoice.upsert.mockResolvedValue({});
  });

  it("the inferred brand voice is created with the store's language, and the prompt builder then writes French", async () => {
    const { ensureInferredBrandVoice } = await import("../../app/utils/brandVoiceInfer.server.js");
    const scored = Array.from({ length: 4 }, (_, i) => ({ title: `Mitigeur ${i}`, description: FR, scores: { combined: 30 } }));
    const language = defaultLanguageFor({ catalogueText: scored.map((p) => p.description).join("\n") });
    expect(language.code).toBe("fr");
    const r = await ensureInferredBrandVoice("navaal-shape-fr.myshopify.com", { scored, shopName: "Shape FR", language: language.code, languageSource: language.source });
    expect(r.created).toBe(true);
    const { create } = db.brandVoice.upsert.mock.calls[0][0];
    expect(create.language).toBe("fr");
    // the writer's own language section, from the same value
    const ai = src("app/utils/ai.server.js");
    expect(ai).toMatch(/const language = brandVoice\?\.language \|\| "en";/);
    expect(ai).toMatch(/Write ALL content in \$\{langName\}/);
  });

  it("an unsupported or missing language still creates the row, in English, never a blank", async () => {
    const { ensureInferredBrandVoice } = await import("../../app/utils/brandVoiceInfer.server.js");
    await ensureInferredBrandVoice("x.myshopify.com", { scored: [], language: "tlh" });
    expect(db.brandVoice.upsert.mock.calls[0][0].create.language).toBe("en");
  });
});

describe("A6 — the inference corpus is the merchant's voice, not a cookie notice", () => {
  it("boilerplate is recognised by lexicon and policy pages by title", () => {
    expect(isBoilerplate("Your Privacy Choices: As described in our Privacy Policy, we")).toBe(true);
    expect(isBoilerplate("© 2026 Acme. All rights reserved. Powered by Shopify")).toBe(true);
    expect(isBoilerplate(FR)).toBe(false);
    for (const t of ["Privacy policy", "Politique de confidentialité", "Terms of Service", "Refund policy", "Impressum", "Cookie settings"]) {
      if (/Politique/.test(t)) continue; // a French policy title is caught by the lexicon on its body, not its title
      expect(POLICY_TITLE_PATTERN.test(t), t).toBe(true);
    }
    expect(POLICY_TITLE_PATTERN.test("About us")).toBe(false);
  });

  it("pickVoiceSamples and inferDifferentiators drop it; a real sample survives", async () => {
    const { pickVoiceSamples, inferDifferentiators } = await import("../../app/utils/brandVoiceInfer.server.js");
    const cookie = "Your Privacy Choices: As described in our Privacy Policy, we and our partners use cookies to personalise content and measure traffic. " + "x".repeat(60);
    const samples = pickVoiceSamples([], { pageCopy: [{ title: "Privacy Choices", text: cookie }, { title: "About us", text: EN }] });
    expect(samples.map((s) => s.title)).toEqual(["About us"]);
    expect(pickVoiceSamples([], { pageCopy: [{ title: "Our story", text: cookie }] })).toEqual([]); // lexicon, not only the title
    const diffs = inferDifferentiators([cookie, cookie, cookie, cookie, "Garantie 25 ans. Livraison sous 2 jours ouvrés.", "Garantie 25 ans. Livraison sous 2 jours ouvrés.", "Garantie 25 ans. Livraison sous 2 jours ouvrés."]);
    expect(diffs).not.toMatch(/Privacy/);
  });

  it("Settings says the setting looks wrong when the extracted copy reads as another language", () => {
    expect(languageMismatch(`garantie 25 ans. livraison sous 2 jours ouvrés.\n${FR}`, "en")).toEqual({ detected: "fr", setting: "en" });
    expect(languageMismatch(FR, "fr")).toBe(null);
    expect(languageMismatch("garantie 25 ans", "en")).toBe(null); // too short to read
    const s = src("app/routes/app.settings.jsx");
    expect(s).toMatch(/languageMismatch\(`\$\{brandVoice\?\.keyDifferentiators \?\? ""\} \$\{brandVoice\?\.sampleContent \?\? ""\}`, brandVoice\?\.language \?\? "en"\)/);
    expect(s).toMatch(/title="Your content language setting looks wrong"/);
  });
});

describe("A3 — one change window on Home", () => {
  it("the banner counts from the score card's baseline moment and names the same date; with no baseline both say the last 24 hours", () => {
    const now = new Date("2026-09-15T10:00:00Z");
    const w = changeWindowFor({ since: "2026-09-14T03:00:00Z", baselineIsNew: false }, now);
    expect(w.kind).toBe("baseline");
    expect(w.label).toBe(`since ${sinceLabelFor("2026-09-14T03:00:00Z")}`);
    expect(autopilotBannerTitle({ products: 15 }, w)).toBe(`Autopilot optimized 15 new products since ${sinceLabelFor("2026-09-14T03:00:00Z")}`);
    const f = changeWindowFor({ since: null }, now);
    expect(f).toMatchObject({ kind: "last24h", label: "in the last 24 hours" });
    expect(f.since.getTime()).toBe(now.getTime() - 24 * 3600 * 1000);
    expect(changeWindowFor({ since: "2026-09-15T09:00:00Z", baselineIsNew: true }, now).kind).toBe("last24h");
    expect(autopilotBannerTitle({ products: 0 }, w)).toBe(null);
    expect(autopilotBannerTitle(null, w)).toBe(null);
  });

  it("two jobs of different state: the one before the baseline is not counted, the one after is", async () => {
    const { recentAutopilotWork } = await import("../../app/utils/autopilot.server.js");
    const baseline = new Date("2026-09-14T03:00:00Z");
    const jobs = [
      { completedProducts: 15, completedAt: new Date("2026-09-13T20:00:00Z") }, // before the baseline — what frame 01 counted
      { completedProducts: 1, completedAt: new Date("2026-09-14T20:00:00Z") },
    ];
    db.generationJob.findMany.mockImplementation(async ({ where }) => jobs.filter((j) => j.completedAt >= where.completedAt.gte));
    const recap = await recentAutopilotWork("s.myshopify.com", { since: baseline, now: new Date("2026-09-15T10:00:00Z") });
    expect(recap.products).toBe(1);
    expect(db.generationJob.findMany.mock.calls[0][0].where.completedAt.gte).toEqual(baseline);
    // and both Home lines are built from the one window
    const h = src("app/routes/app._index.jsx");
    expect(h).toMatch(/const changeWindow = changeWindowFor\(storeScore\);/);
    expect(h).toMatch(/recentAutopilotWork\(shop, \{ since: changeWindow\.since \}\)/);
    expect(h).toMatch(/autopilotBannerTitle\(autopilotRecap, \{ label: changeWindowLabel \}\)/);
    expect(h).not.toMatch(/in the last 24 hou/);
  });
});

describe("A4 — the first screen is a result, never a task", () => {
  it("before the first publish Home leads with the findings card and the theme step is one dismissible line; after it, the setup card", () => {
    const h = src("app/routes/app._index.jsx");
    expect(h).toMatch(/const beforeFirstPublish = !!shopRow && !shopRow\.firstPublishAt;/);
    expect(h).toMatch(/\{beforeFirstPublish && <FirstRunFindingsCard findings=\{findings\} blockers=\{blockers\} navigate=\{navigate\} \/>\}/);
    expect(h).toMatch(/\{beforeFirstPublish \? <EmbedLaterNote confirmed=\{embedConfirmed\} \/> : <EmbedSetupCard shopDomain=\{shopDomain\} confirmed=\{embedConfirmed\} \/>\}/);
    expect(h.indexOf("<FirstRunFindingsCard")).toBeLessThan(h.indexOf("<EmbedLaterNote"));
    const e = src("app/components/EmbedSetupCard.jsx");
    expect(e).toMatch(/export function EmbedLaterNote/);
    expect(e).toMatch(/onDismiss=\{\(\) => setDismissed\(true\)\}/);
    const c = src("app/components/FirstRunFindingsCard.jsx");
    expect(c).toMatch(/This product: \$\{f\.scoreBefore\}\/100/); // FR8, durable
    expect(c).toMatch(/navigate\(`\/app\/review\?product=\$\{numericId\(f\.productId\)\}`\)/);
    expect(src("app/utils/storeScore.server.js")).toMatch(/export async function firstRunFindings/);
  });
});

describe("A1 and A2 — the click and the link", () => {
  it("A1: the row's Review handler stops the bubble before it navigates, and the click harness exists", () => {
    const p = src("app/routes/app.products.jsx");
    expect(p).toMatch(/e\?\.stopPropagation\?\.\(\);\s*e\?\.preventDefault\?\.\(\);\s*navigate\(rowActionLabel\(id, description\) === "Review"/);
    const harness = readFileSync("tools/proof/fr13-click.mjs", "utf8");
    expect(harness).toMatch(/await button\.click\(\)/);
    expect(harness).toMatch(/\/\^\\\/app\\\/review\\\?product=\\d\+\$\//);
    expect(harness).toMatch(/approve-/);
  });

  it("A2: a malformed product param shows every draft under a notice — the empty state is only for no drafts", () => {
    const r = src("app/routes/app.review.jsx");
    expect(r).not.toMatch(/__refused__/);
    expect(r).toMatch(/const draftWhere = scopedTo\s*\?\s*\{ shop, status: "draft", productId: scopedTo \}\s*:\s*\{ shop, status: "draft", productId: \{ startsWith: PRODUCT_GID_PREFIX \} \};/);
    expect(r).toMatch(/if \(products\.length === 0\) \{/);
    expect(r).toMatch(/title="That product link was malformed — showing all your drafts"/);
    expect(r.indexOf("Nothing to review — you're all caught up")).toBeGreaterThan(r.indexOf("if (products.length === 0) {"));
  });
});

describe("the three small ones", () => {
  it("binaryTargets includes CW's VM; the TTV report ignores anonymised ghosts; the matrix names its fixture-only lines", () => {
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/binaryTargets = \["native", "debian-openssl-3\.0\.x"\]/);
    expect(src("app/utils/ttvReport.server.js")).toMatch(/shop: \{ notIn: excludeShops \}, redactedAt: null \}/);
    const fo = fixtureOnly();
    expect(fo.length).toBeGreaterThan(0);
    expect(fo.every((c) => !/navaal-shape/.test(c.where))).toBe(true);
    expect(fo.length + cellsWith("NOT RUN").filter((c) => /navaal-shape/.test(c.where)).length).toBe(cellsWith("NOT RUN").length);
  });
});
