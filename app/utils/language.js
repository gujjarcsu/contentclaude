/**
 * Phase 12 Part A (A5, A6) — which language a store speaks, without a scope.
 *
 * navaal-shape-fr: every product French, the first run extracted
 * "garantie 25 ans. livraison sous 2 jours ouvrés." into the app's own
 * keyDifferentiators, and set Content Language to English anyway. The writer
 * then offered an English title over a French one, at "quality 90/100".
 *
 * Shopify's `shopLocales` query would answer the question directly, but it
 * requires `read_locales` — a scope this app deliberately does not hold
 * (adding one re-prompts every installed merchant). Three scope-free signals
 * answer it well enough, in this order:
 *
 *   1. the catalogue's own copy — the language the merchant already writes in
 *   2. the admin locale Shopify passes to the embedded app (`?locale=fr-FR`)
 *   3. the shop's country (billingAddress.countryCodeV2), read with shop { name }
 *
 * A merchant's Settings choice always wins over all three. PURE.
 */

/** The twelve languages the writer can be asked for, as Settings offers them. */
export const SUPPORTED_LANGUAGES = Object.freeze(["en", "es", "fr", "de", "it", "pt", "ja", "zh", "ko", "ar", "hi", "nl"]);

export const LANGUAGE_NAMES = Object.freeze({
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  nl: "Dutch",
});

export const languageName = (code) => LANGUAGE_NAMES[code] ?? "English";

/** Function words that are common in one language and rare in the others. */
const STOPWORDS = {
  en: ["the", "and", "with", "for", "your", "this", "that", "from", "are", "is", "of", "to", "in", "our", "you", "it", "on", "by", "we", "all"],
  es: ["el", "la", "los", "las", "de", "del", "con", "para", "por", "una", "un", "que", "es", "en", "y", "su", "sus", "más", "este", "esta"],
  fr: ["le", "la", "les", "des", "du", "de", "et", "pour", "avec", "une", "un", "est", "en", "sur", "vous", "votre", "ce", "cette", "sous", "ans"],
  de: ["der", "die", "das", "und", "mit", "für", "von", "ein", "eine", "ist", "sie", "nicht", "auf", "im", "zu", "den", "dem", "des", "wir", "ihre"],
  it: ["il", "lo", "la", "gli", "le", "di", "del", "della", "con", "per", "una", "un", "che", "è", "in", "e", "non", "sono", "questo", "questa"],
  pt: ["o", "a", "os", "as", "de", "do", "da", "dos", "das", "com", "para", "por", "uma", "um", "que", "é", "em", "e", "não", "seu"],
  nl: ["de", "het", "een", "en", "van", "met", "voor", "op", "is", "zijn", "niet", "je", "uw", "dit", "deze", "bij", "ook", "aan", "door", "wordt"],
};

/** Scripts settle the four non-Latin languages before any word is counted. */
const SCRIPTS = [
  { code: "ja", re: /[぀-ヿ]/g }, // hiragana + katakana — kana means Japanese, not Chinese
  { code: "ko", re: /[가-힯]/g },
  { code: "ar", re: /[؀-ۿ]/g },
  { code: "hi", re: /[ऀ-ॿ]/g },
  { code: "zh", re: /[一-鿿]/g },
];

export const MIN_WORDS_TO_DETECT = 20;

/**
 * The language of a piece of text, with a confidence in [0, 1].
 * Unknown (null code) when there is too little text or no signal — never a
 * guess dressed as a reading.
 *
 * @returns {{code: string|null, confidence: number, words: number}}
 */
export function detectLanguage(text) {
  const s = String(text ?? "");
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return { code: null, confidence: 0, words: 0 };
  for (const { code, re } of SCRIPTS) {
    const n = (s.match(re) ?? []).length;
    if (n / letters >= 0.3) return { code, confidence: Math.min(1, n / letters), words: n };
  }
  const words = s.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < MIN_WORDS_TO_DETECT) return { code: null, confidence: 0, words: words.length };
  const scores = {};
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    let hits = 0;
    for (const w of words) if (set.has(w)) hits += 1;
    scores[code] = hits / words.length;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] < 0.06) return { code: null, confidence: 0, words: words.length };
  const margin = best[1] - (second?.[1] ?? 0);
  const confidence = Math.min(1, Math.max(0, margin / best[1]));
  return { code: best[0], confidence, words: words.length };
}

/** "fr-FR" → "fr"; "pt-BR" → "pt"; anything unsupported → null. */
export function languageFromLocale(locale) {
  const code = String(locale ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(code) ? code : null;
}

const COUNTRY_LANGUAGE = Object.freeze({
  FR: "fr", BE: "fr", CH: "de", LU: "fr", MC: "fr",
  DE: "de", AT: "de",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", UY: "es", GT: "es", CR: "es", PA: "es", DO: "es", BO: "es", PY: "es", SV: "es", HN: "es", NI: "es",
  IT: "it",
  PT: "pt", BR: "pt",
  JP: "ja", CN: "zh", TW: "zh", HK: "zh", KR: "ko", IN: "hi", NL: "nl",
  SA: "ar", AE: "ar", EG: "ar", MA: "ar", QA: "ar", KW: "ar", JO: "ar", BH: "ar", OM: "ar", DZ: "ar", TN: "ar", IQ: "ar", LB: "ar",
});

/** A country's most likely store language, or null when it would be a guess. */
export function languageFromCountry(countryCode) {
  return COUNTRY_LANGUAGE[String(countryCode ?? "").trim().toUpperCase()] ?? null;
}

/**
 * The language to write in when the merchant has not chosen one.
 *
 * @param {{catalogueText?: string, adminLocale?: string|null, country?: string|null}} signals
 * @returns {{code: string, source: "catalogue"|"admin_locale"|"country"|"default", confidence: number}}
 */
export function defaultLanguageFor({ catalogueText = "", adminLocale = null, country = null } = {}) {
  const d = detectLanguage(catalogueText);
  if (d.code && SUPPORTED_LANGUAGES.includes(d.code) && d.confidence >= 0.5) return { code: d.code, source: "catalogue", confidence: d.confidence };
  const fromLocale = languageFromLocale(adminLocale);
  if (fromLocale) return { code: fromLocale, source: "admin_locale", confidence: 0.7 };
  const fromCountry = languageFromCountry(country);
  if (fromCountry) return { code: fromCountry, source: "country", confidence: 0.5 };
  return { code: "en", source: "default", confidence: 0 };
}

/** How the splash and Settings say where a default came from. */
export function languageSourceLabel(source) {
  return (
    {
      catalogue: "from the language your products are written in",
      admin_locale: "from your Shopify admin language",
      country: "from your store's country",
      default: "the default",
      setting: "your setting",
    }[source] ?? "the default"
  );
}

// ── A6 — the inference corpus must not learn a cookie notice ────────────────

/** Page titles that are policy, not prose. */
export const POLICY_TITLE_PATTERN = /privacy|cookie|terms|conditions|refund|return policy|shipping policy|legal|imprint|impressum|gdpr|contact information|accessibility statement|do not sell/i;

/** Sentences that only ever appear in boilerplate. */
export const BOILERPLATE_LEXICON = Object.freeze([
  "privacy choices",
  "privacy policy",
  "cookie",
  "terms of service",
  "terms and conditions",
  "all rights reserved",
  "powered by shopify",
  "gdpr",
  "opt out",
  "opt-out",
  "do not sell",
  "personal information",
  "as described in our",
  "by using this site",
  "unsubscribe",
  "©",
]);

/** True when a text is legal / cookie / footer boilerplate rather than the merchant's voice. */
export function isBoilerplate(text) {
  const t = String(text ?? "").toLowerCase();
  if (!t.trim()) return false;
  return BOILERPLATE_LEXICON.some((phrase) => t.includes(phrase));
}

/**
 * A6 — does the language of what the app extracted disagree with the setting?
 * Null when the text is too short to read; never a verdict from nothing.
 *
 * @returns {{detected: string, setting: string}|null}
 */
export function languageMismatch(extractedText, settingCode) {
  const d = detectLanguage(extractedText);
  if (!d.code || d.confidence < 0.5) return null;
  const setting = SUPPORTED_LANGUAGES.includes(settingCode) ? settingCode : "en";
  return d.code === setting ? null : { detected: d.code, setting };
}
