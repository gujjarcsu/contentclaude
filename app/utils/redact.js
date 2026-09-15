/**
 * Phase 12 Part E, line A9 — nothing that is a secret survives into a log
 * line, an error message or a client payload.
 *
 * Found by tests/utils/secretsNeverAppear.test.js: the AI caller put the
 * provider's error body verbatim into the thrown error and the log line, so
 * an upstream that echoed the key (a hostile proxy, a careless error page)
 * would have written it to Sentry and the LogEvent table. The key travels in
 * exactly one place — the request — and this makes sure it comes back in
 * none.
 *
 * PURE. Redacts the specific secrets it is handed AND the shapes secrets
 * take, so a secret nobody thought to pass is still caught.
 */

const SHAPES = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic keys
  /\bsk-[A-Za-z0-9_-]{16,}/g, // generic sk- keys
  /([?&]apikey=)[^&\s"'<>]*/gi, // Bing query keys
  /(x-api-key["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
  /(authorization["']?\s*[:=]\s*["']?bearer\s+)[^\s"',}]+/gi,
  /(refresh_token["']?\s*[:=]\s*["']?)[^\s"',}&]+/gi,
  /(access_token["']?\s*[:=]\s*["']?)[^\s"',}&]+/gi,
];

/**
 * @param {unknown} text anything; non-strings are stringified
 * @param {...(string|null|undefined)} secrets the actual values in use, if known
 */
export function redactSecrets(text, ...secrets) {
  let s = String(text ?? "");
  for (const secret of secrets) {
    const v = String(secret ?? "");
    if (v.length >= 8) s = s.split(v).join("[redacted]");
  }
  for (const re of SHAPES) s = s.replace(re, (m, prefix) => (prefix ? `${prefix}[redacted]` : "[redacted]"));
  return s;
}
