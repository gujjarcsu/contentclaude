/**
 * Phase 12 Part D (D1) — one lazy chunk per live locale, for the browser.
 *
 * Each entry is a dynamic import, so Vite emits the locale's catalogue and
 * its Polaris strings as chunks of their own, fetched only by a merchant on
 * that locale (entry.client.jsx awaits it before hydrating; I18nProvider
 * awaits it after a language switch inside the app). The shared bundle
 * never carries a catalogue.
 */
import { isLocaleLoaded, registerCatalogue, registerPolaris } from "./index.js";

export const UI_LOCALE_CHUNKS = Object.freeze({
  de: () => Promise.all([import("./locales/de.json"), import("@shopify/polaris/locales/de.json")]),
  fr: () => Promise.all([import("./locales/fr.json"), import("@shopify/polaris/locales/fr.json")]),
  es: () => Promise.all([import("./locales/es.json"), import("@shopify/polaris/locales/es.json")]),
  it: () => Promise.all([import("./locales/it.json"), import("@shopify/polaris/locales/it.json")]),
});

/**
 * Load and register a locale. Resolves true when the locale is usable
 * (English always is), false when it is not one we ship.
 */
export async function loadUiLocale(locale) {
  if (isLocaleLoaded(locale)) return true;
  const load = UI_LOCALE_CHUNKS[locale];
  if (!load) return false;
  const [catalogue, polaris] = await load();
  registerCatalogue(locale, catalogue.default ?? catalogue);
  registerPolaris(locale, polaris.default ?? polaris);
  return true;
}
