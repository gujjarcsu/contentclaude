import { createContext, useContext, useMemo } from "react";
import { createT, DEFAULT_UI_LOCALE } from "./index.js";

/**
 * Phase 12 Part D (D0) — `useT()` in any component under the provider.
 * Without a provider it is English, so a component rendered alone in a test
 * behaves exactly as before.
 */
export const I18nContext = createContext(createT(DEFAULT_UI_LOCALE));

export function I18nProvider({ locale, children }) {
  const t = useMemo(() => createT(locale), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}
