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
 */
import { PRIVACY_SECTIONS, TERMS_SECTIONS, DATA_INVENTORY, SUBPROCESSORS, COMPANY, APP_NAME, LAST_UPDATED } from "./legal.js";

/** Minimal escaping for values interpolated into HTML from the inventory. */
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inventoryTable() {
  const rows = DATA_INVENTORY.map(
    (d) =>
      `<tr><td><code>${esc(d.model)}</code></td><td>${esc(d.holds)}</td><td>${d.personal ? "<b>personal</b>" : "shop only"}</td></tr>`,
  ).join("");
  return `<table><thead><tr><th>Where</th><th>What it holds</th><th>Type</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function subprocessorTable() {
  const rows = SUBPROCESSORS.map(
    (s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.role)}</td><td>${esc(s.region)}</td></tr>`,
  ).join("");
  return `<table><thead><tr><th>Company</th><th>What it does</th><th>Where</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSections(sections) {
  return sections
    .map((s) => {
      const paras = (s.p ?? []).map((t) => `<p>${t}</p>`).join("");
      const extra = s.table ? inventoryTable() : s.subprocessors ? subprocessorTable() : "";
      return `<section><h2>${esc(s.h)}</h2>${paras}${extra}</section>`;
    })
    .join("");
}

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #fbfbfb; color: #1a1a1a;
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .35rem; }
h2 { font-size: 1.15rem; margin: 2.4rem 0 .6rem; }
p { margin: 0 0 .9rem; }
code { background: rgba(0,0,0,.06); padding: .1em .35em; border-radius: 3px; font-size: .9em; }
a { color: #0b57d0; }
.meta { color: #5c5c5c; font-size: .9rem; margin: 0 0 2rem; }
.back { display: inline-block; margin-bottom: 2rem; font-size: .9rem; }
table { border-collapse: collapse; width: 100%; margin: .5rem 0 1.25rem; font-size: .92rem; display: block; overflow-x: auto; }
th, td { text-align: left; vertical-align: top; padding: .55rem .6rem; border-bottom: 1px solid rgba(0,0,0,.1); }
th { font-weight: 600; white-space: nowrap; }
footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid rgba(0,0,0,.1); font-size: .9rem; color: #5c5c5c; }
@media (prefers-color-scheme: dark) {
  body { background: #121212; color: #e8e8e8; }
  code { background: rgba(255,255,255,.1); }
  a { color: #8ab4f8; }
  .meta, footer { color: #a0a0a0; }
  th, td, footer { border-color: rgba(255,255,255,.14); }
}
`;

/**
 * @param {"privacy"|"terms"} which
 * @returns {Response} a complete HTML page
 */
export function legalPage(which) {
  const isPrivacy = which === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms of Service";
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const other = isPrivacy ? ["/terms", "Terms of Service"] : ["/privacy", "Privacy Policy"];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(APP_NAME)}</title>
<meta name="robots" content="index, follow">
<style>${CSS}</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p class="meta">${esc(APP_NAME)} · ${esc(COMPANY)} · Last updated ${esc(LAST_UPDATED)}</p>
  ${renderSections(sections)}
  <footer>
    <a href="${other[0]}">${esc(other[1])}</a> ·
    <a href="https://apps.shopify.com/navaal-ai-seo-geo-content">App Store listing</a>
  </footer>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Public, cacheable, and revalidated often enough that a correction to a
      // legal document is not stuck behind a CDN for a day.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
