/**
 * Phase 12 Part D (D1) — sentences the app STORED in English.
 *
 * Some merchant sentences are written to the database at the moment they
 * are true — a finding's note on the nightly walk, a bulk job's per-product
 * error, the reason a publish could not be verified — and read back later
 * on a screen. They are stored in English, from a key, through `enT`
 * (index.js), so the stored text is exactly `interpolate(key, vars)`.
 *
 * This module runs that backwards: given the key list a producer exports,
 * a stored sentence is matched against each key (its `{placeholders}`
 * become captures) and translated with the captured values. A sentence no
 * key produced — an upstream error message, a row from before the key
 * existed — is returned as it is. English is the identity and costs
 * nothing.
 *
 * Keys used this way carry plain `{name}` placeholders only: an ICU plural
 * block cannot be matched backwards, and none of these sentences needs one.
 *
 * PURE.
 */
import { DEFAULT_UI_LOCALE } from "./index.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @param {string[]} keys English keys with `{name}` placeholders */
export function compileStoredKeys(keys) {
  const out = [];
  const seen = new Set();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (/\{\w+,\s*plural/.test(key)) throw new Error(`stored-sentence key cannot carry a plural block: ${key.slice(0, 60)}`);
    const pattern = escapeRe(key).replace(/\\\{(\w+)\\\}/g, "(?<$1>[\\s\\S]+?)");
    out.push({ key, re: new RegExp(`^${pattern}$`) });
  }
  return out;
}

/**
 * @param {(key: string, vars?: object) => string} t  a createT() result
 * @param {ReturnType<typeof compileStoredKeys>} compiled
 * @returns {(sentence: string|null|undefined) => string|null|undefined}
 */
export function storedTranslator(t, compiled) {
  return (sentence) => {
    if (sentence == null || sentence === "") return sentence;
    if (!t || t.locale === DEFAULT_UI_LOCALE) return sentence;
    const s = String(sentence);
    for (const { key, re } of compiled) {
      const m = re.exec(s);
      if (m) return t(key, m.groups ?? {});
    }
    return s;
  };
}
