/**
 * Phase 12 Part D (D1) — the server's copy of every live catalogue.
 *
 * Imported once by entry.server.jsx (the web process) and by the modules
 * that write merchant email from the worker, so every `createT(locale)` on
 * the server finds its table registered before the first request. The
 * browser never loads this file: it takes one locale at a time from
 * chunks.js.
 *
 * Adding a locale: import its two files here, add its chunk in chunks.js,
 * add it to LIVE_UI_LOCALES — the test holds the three together and the
 * guard below refuses to boot a locale that is live with no table.
 */
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import polarisDe from "@shopify/polaris/locales/de.json";
import polarisFr from "@shopify/polaris/locales/fr.json";
import polarisEs from "@shopify/polaris/locales/es.json";
import { registerCatalogue, registerPolaris, LIVE_UI_LOCALES, DEFAULT_UI_LOCALE } from "./index.js";

export const SERVER_CATALOGUES = Object.freeze({ de, fr, es });
export const SERVER_POLARIS = Object.freeze({ de: polarisDe, fr: polarisFr, es: polarisEs });

for (const [loc, table] of Object.entries(SERVER_CATALOGUES)) registerCatalogue(loc, table);
for (const [loc, table] of Object.entries(SERVER_POLARIS)) registerPolaris(loc, table);

for (const loc of LIVE_UI_LOCALES) {
  if (loc !== DEFAULT_UI_LOCALE && !SERVER_CATALOGUES[loc]) throw new Error(`i18n: ${loc} is in LIVE_UI_LOCALES but has no catalogue in catalogues.server.js`);
  if (loc !== DEFAULT_UI_LOCALE && !SERVER_POLARIS[loc]) throw new Error(`i18n: ${loc} is in LIVE_UI_LOCALES but has no Polaris table in catalogues.server.js`);
}
