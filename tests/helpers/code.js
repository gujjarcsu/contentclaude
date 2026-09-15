/**
 * Strip comments before any "the source must (not) say X" assertion.
 *
 * THIS EXISTS BECAUSE I WROTE IT INLINE FIVE TIMES IN ONE DAY, and the fifth
 * one still fired on its own documentation — a comment in `privacy.jsx` reading
 * "No authenticate.admin, deliberately" failed a guard asserting that the file
 * does not authenticate. By then the trap was already written up in
 * `07-VERIFICATION.md` with the fix in it. Knowing the rule was not enough;
 * having to retype the helper was the actual failure mode, so now it is a
 * helper.
 *
 * The four before it, all the same day:
 *
 *   - the "no SHOPIFY_API_SECRET" rule, on the docstring saying *not* that
 *   - the "no partial-key column" rule, on the comment naming `aiKeyLast4` as
 *     the thing not to add
 *   - the "no 'Live on your storefront'" rule, on the JSX comment explaining
 *     why the label changed
 *   - the "nothing types the cache key" rule, on the docstring for `cacheKey()`
 *
 * Both directions of this trap are real and they pull opposite ways. A PRESENCE
 * check can pass on a docstring that merely quotes the copy — in Phase 4,
 * deleting merchant-visible text failed nothing for exactly that reason. An
 * ABSENCE check can fail on the comment that explains the absence. Stripping
 * comments fixes both.
 *
 * The tempting response when a guard fires on its own rationale is to delete
 * the rationale — which leaves the rule enforced and its reason gone, so the
 * next person removes the rule. Use this instead.
 *
 * Block comments are stripped as well as line comments, and that is not
 * optional: three of the five above were block or JSX-block comments, which a
 * line-prefix filter misses entirely.
 *
 * (Writing this file taught the lesson once more: the first draft quoted the
 * comment delimiters literally in this very docstring and broke the parser.)
 *
 * Phase 12 Part D — merchant-visible strings are now the keys of t("…") calls
 * (gettext style: the English IS the key). A guard written as
 * `title="Showing one product"` or `>Review drafts<` must keep meaning what
 * it meant, so this helper also sees THROUGH the wrapper: `{t("X")}` reads as
 * `X`, `title={t("X")}` reads as `title="X"`, `t("X")` reads as `"X"`, and
 * the same for the module-level marker `T("X")`. Placeholder keys keep their
 * braces (`{n}`), which is what the catalogue holds.
 */

/**
 * @param {string} src raw file contents
 * @returns {string} the same source with comments removed and t() unwrapped
 */
export function code(src) {
  return unwrapT(stripComments(src));
}

export function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
}

/** `{t("X")}` → `X` (JSX child) · `={t("X")}` → `="X"` (prop) · `t("X")` → `"X"` (expression). */
export function unwrapT(src) {
  const STR = '"((?:[^"\\\\]|\\\\.)*)"';
  const CALL = `\\b[tT]\\(${STR}(?:,\\s*\\{[^{}]*\\})?\\)`;
  return String(src ?? "")
    .replace(new RegExp(`=\\{${CALL}\\}`, "g"), (m, s) => `="${s}"`)
    .replace(new RegExp(`\\{${CALL}\\}`, "g"), (m, s) => s.replace(/\\"/g, '"'))
    .replace(new RegExp(CALL, "g"), (m, s) => `"${s}"`);
}
