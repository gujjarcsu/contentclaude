import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createT, DEFAULT_UI_LOCALE, isLocaleLoaded } from "./index.js";
import { loadUiLocale } from "./chunks.js";
import { STORED_KEYS } from "./storedKeys.js";
import { storedTranslator } from "./stored.js";

/**
 * Phase 12 Part D (D0) — `useT()` in any component under the provider.
 * Without a provider it is English, so a component rendered alone in a test
 * behaves exactly as before.
 */
export const I18nContext = createContext(createT(DEFAULT_UI_LOCALE));

/**
 * D1 — true once the locale's catalogue is registered. On the server, and on
 * the client's first render, it already is (catalogues.server.js /
 * entry.client.jsx); after a language switch inside the app the chunk is
 * fetched here and the tree re-renders when it lands.
 */
export function useLocaleLoaded(locale) {
  const [loaded, setLoaded] = useState(() => isLocaleLoaded(locale));
  useEffect(() => {
    if (isLocaleLoaded(locale)) {
      setLoaded(true);
      return undefined;
    }
    let alive = true;
    setLoaded(false);
    loadUiLocale(locale)
      .then(() => {
        if (alive) setLoaded(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [locale]);
  return loaded;
}

export function I18nProvider({ locale, children }) {
  const loaded = useLocaleLoaded(locale);
  // `loaded` is a dependency on purpose: the same locale yields a new `t`
  // once its table is registered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => createT(locale), [locale, loaded]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}

/**
 * D1 — for sentences the app STORED in English (a finding's note, a job's
 * error, a publish verification): the translator that recognises them by
 * the key they were produced from. See stored.js.
 */
export function useStoredT() {
  const t = useT();
  return useMemo(() => storedTranslator(t, STORED_KEYS), [t]);
}
