/**
 * P6.2 — render a legal document as standalone HTML.
 *
 * Deliberately NOT a React route component. These two pages must be readable
 * by someone who has not installed the app, arriving from the App Store
 * listing, with no Shopify session and no App Bridge — and by an App Store
 * reviewer who will open them cold. Anything that pulls in the embedded-app
 * shell would redirect them or fail to authenticate.
 *
 * So: one server-rendered page, inline CSS, no scripts, no fonts, no network
 * calls. It cannot break in a way that hides a legal document.
 *
 * Phase 12 Part D (D1) — the page renders in any live language from the same
 * constants: `?locale=` first, then the browser's Accept-Language, else
 * English. Section ids come from the ENGLISH headings, so an anchor never
 * changes with the language; a translation carries a line saying the English
 * is the binding text.
 */
import { PRIVACY_SECTIONS, TERMS_SECTIONS, DATA_INVENTORY, SUBPROCESSORS, SITE_SUBPROCESSORS, SITE_PRIVACY_SECTIONS, PRIVACY_INTRO, COMPANY, APP_NAME, LAST_UPDATED, LAST_UPDATED_ISO, LEGAL_VARS, legalText } from "./legal.js";
import { tFor, localeFromAcceptLanguage, LIVE_UI_LOCALES, UI_LOCALE_NAMES, DEFAULT_UI_LOCALE, T } from "../i18n/index.js";
import "../i18n/catalogues.server.js";

/** The language a public legal page renders in: the URL's `locale` if we ship it, else the browser's first language we ship, else English. */
export function legalLocaleFor(request) {
  try {
    const q = new URL(request.url).searchParams.get("locale");
    if (q) return tFor(q).locale;
    return localeFromAcceptLanguage(request.headers?.get?.("accept-language"));
  } catch {
    return DEFAULT_UI_LOCALE;
  }
}

/** Minimal escaping for values interpolated into HTML from the inventory. */
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inventoryTable(t) {
  const rows = DATA_INVENTORY.map(
    (d) =>
      `<tr><td><code>${esc(d.model)}</code></td><td>${esc(t(d.holds))}</td><td>${d.personal ? `<b>${esc(t("personal"))}</b>` : esc(t("shop only"))}</td></tr>`,
  ).join("");
  return `<table><thead><tr><th>${esc(t("Where"))}</th><th>${esc(t("What it holds"))}</th><th>${esc(t("Type"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function subprocessorTable(t, list = SUBPROCESSORS) {
  const rows = list.map(
    (s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(t(s.role))}</td><td>${esc(t(s.region))}</td></tr>`,
  ).join("");
  return `<table><thead><tr><th>${esc(t("Company"))}</th><th>${esc(t("What it does"))}</th><th>${esc(t("Where"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Anchor ids from the ENGLISH heading (the key), in every language. */
const slug = (h) =>
  String(h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function renderSections(sections, t, { level = 2, prefix = "" } = {}) {
  const tag = `h${level}`;
  return sections
    .map((s) => {
      const paras = (s.p ?? []).map((p) => `<p>${legalText(p, t)}</p>`).join("");
      const extra = s.table ? inventoryTable(t) : s.subprocessors ? subprocessorTable(t) : s.siteSubprocessors ? subprocessorTable(t, SITE_SUBPROCESSORS) : "";
      return `<section><${tag} id="${prefix}${slug(s.h)}">${esc(t(s.h))}</${tag}>${paras}${extra}</section>`;
    })
    .join("");
}

const PART_1 = T("Part 1 — The website and the free {SCAN_NAME} scan");
const PART_2 = T("Part 2 — The {APP_NAME} app");

/** Phase 12 Part B — the table of contents for the two-part policy. */
function contents(part1, part2, t) {
  const li = (prefix, list) => list.map((s) => `<li><a href="#${prefix}${slug(s.h)}">${esc(t(s.h))}</a></li>`).join("");
  return `<nav class="toc" aria-label="${esc(t("Contents"))}"><p><b>${esc(t("Contents"))}</b></p><ol><li><a href="#part-1">${esc(t(PART_1, LEGAL_VARS))}</a><ol>${li("p1-", part1)}</ol></li><li><a href="#part-2">${esc(t(PART_2, LEGAL_VARS))}</a><ol>${li("p2-", part2)}</ol></li></ol></nav>`;
}

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #fbfbfb; color: #1a1a1a;
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .35rem; }
h2 { font-size: 1.15rem; margin: 2.4rem 0 .6rem; }
h2.part { font-size: 1.4rem; margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid rgba(0,0,0,.1); }
h3 { font-size: 1.05rem; margin: 2rem 0 .5rem; }
.toc { margin: 1.25rem 0 0; font-size: .92rem; }
.toc ol { padding-left: 1.25rem; margin: .25rem 0; }
.lede { margin: .75rem 0 0; }
p { margin: 0 0 .9rem; }
code { background: rgba(0,0,0,.06); padding: .1em .35em; border-radius: 3px; font-size: .9em; }
a { color: #0b57d0; }
.meta { color: #5c5c5c; font-size: .9rem; margin: 0 0 2rem; }
.lang { font-size: .9rem; margin: 0 0 1rem; }
.lang a[aria-current] { font-weight: 600; text-decoration: none; }
.binding { font-size: .9rem; color: #5c5c5c; margin: 0 0 1.25rem; }
.back { display: inline-block; margin-bottom: 2rem; font-size: .9rem; }
table { border-collapse: collapse; width: 100%; margin: .5rem 0 1.25rem; font-size: .92rem; display: block; overflow-x: auto; }
th, td { text-align: left; vertical-align: top; padding: .55rem .6rem; border-bottom: 1px solid rgba(0,0,0,.1); }
th { font-weight: 600; white-space: nowrap; }
footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid rgba(0,0,0,.1); font-size: .9rem; color: #5c5c5c; }
@media (prefers-color-scheme: dark) {
  body { background: #121212; color: #e8e8e8; }
  code { background: rgba(255,255,255,.1); }
  a { color: #8ab4f8; }
  .meta, .binding, footer { color: #a0a0a0; }
  th, td, footer { border-color: rgba(255,255,255,.14); }
}
`;

/**
 * @param {"privacy"|"terms"} which
 * @param {{locale?: string}} [opts] the language to render in (D1); English by default
 * @returns {Response} a complete HTML page
 */
export function legalPage(which, { locale = DEFAULT_UI_LOCALE } = {}) {
  const t = tFor(locale);
  const isPrivacy = which === "privacy";
  const title = isPrivacy ? t("Privacy Policy") : t("Terms of Service");
  const other = isPrivacy ? ["/terms", t("Terms of Service")] : ["/privacy", t("Privacy Policy")];
  // Phase 12 Part B — /privacy is ONE policy in two parts: the website and
  // the free scan (Part 1, the owner's text from navaal.ai), then the app
  // (Part 2). The terms page is the app's alone.
  const body = isPrivacy
    ? `<p class="meta">${legalText(T("How {SITE_NAME}, the free {SCAN_NAME} store scan, and the {APP_NAME} app handle data — in plain English."), t)}</p>` +
      PRIVACY_INTRO.map((p) => `<p class="lede">${legalText(p, t)}</p>`).join("") +
      contents(SITE_PRIVACY_SECTIONS, PRIVACY_SECTIONS, t) +
      `<h2 class="part" id="part-1">${esc(t(PART_1, LEGAL_VARS))}</h2>` +
      renderSections(SITE_PRIVACY_SECTIONS, t, { level: 3, prefix: "p1-" }) +
      `<h2 class="part" id="part-2">${esc(t(PART_2, LEGAL_VARS))}</h2>` +
      renderSections(PRIVACY_SECTIONS, t, { level: 3, prefix: "p2-" })
    : renderSections(TERMS_SECTIONS, t);

  // The English date as written; a translation formats the same day in its own language.
  const updated = t.locale === DEFAULT_UI_LOCALE ? LAST_UPDATED : t.date(LAST_UPDATED_ISO, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  // One link per live language, the current one marked; nothing when English is the only one.
  const languages =
    LIVE_UI_LOCALES.length > 1
      ? `<p class="lang">${LIVE_UI_LOCALES.map((l) => (l === t.locale ? `<a href="/${which}?locale=${l}" aria-current="page" lang="${l}">${esc(UI_LOCALE_NAMES[l])}</a>` : `<a href="/${which}?locale=${l}" lang="${l}">${esc(UI_LOCALE_NAMES[l])}</a>`)).join(" · ")}</p>`
      : "";
  const binding = t.locale === DEFAULT_UI_LOCALE ? "" : `<p class="binding">${esc(t("This translation is provided for convenience. The English version is the binding one."))}</p>`;

  const html = `<!doctype html>
<html lang="${t.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(APP_NAME)}</title>
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://app.navaal.ai/${which}">
<style>${CSS}</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p class="meta">${esc(APP_NAME)} · ${esc(COMPANY)} · ${esc(t("Last updated {date}", { date: updated }))}</p>
  ${languages}${binding}
  ${body}
  <footer>
    <a href="${other[0]}${t.locale === DEFAULT_UI_LOCALE ? "" : `?locale=${t.locale}`}">${esc(other[1])}</a> ·
    <a href="https://apps.shopify.com/navaal-ai-seo-geo-content">${esc(t("App Store listing"))}</a>
  </footer>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Public, cacheable, and revalidated often enough that a correction to a
      // legal document is not stuck behind a CDN for a day. Varies by language.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      Vary: "Accept-Language",
      "Content-Language": t.locale,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
