// Client-safe text helpers (no server-only imports).

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decode HTML entities in PLAIN-TEXT strings (meta titles, meta descriptions,
 * FAQ text, previews). The AI frequently echoes product data as HTML-escaped
 * text ("Premium Skateboards &amp; Gear"); rendered via React's text escaping
 * that shows the raw entity to the merchant — and published to Shopify's SEO
 * fields it double-escapes on the storefront.
 *
 * Do NOT run this on HTML fields (descriptions) — there, entities are correct.
 * Decodes repeatedly so double-escapes (&amp;amp;) fully resolve, capped to
 * avoid pathological input.
 */
export function decodeHtmlEntities(input) {
  if (typeof input !== "string" || input.indexOf("&") === -1) return input;
  let out = input;
  for (let pass = 0; pass < 3 && out.indexOf("&") !== -1; pass++) {
    const before = out;
    out = out.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body.toLowerCase())
        ? NAMED_ENTITIES[body.toLowerCase()]
        : match;
    });
    if (out === before) break;
  }
  return out;
}

/** Shopify's own limits, and what the prompts already ask the model for. */
export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MAX = 155;

/**
 * Phase 0 item 18 — the plain-text fields are PLAIN TEXT. Make them so.
 *
 * The pipeline was extractTag -> sanitizeHtml -> decodeHtmlEntities. The
 * sanitiser leaves "&lt;script&gt;" alone, correctly, because it is text and
 * not a tag — and then the decode turns it back into "<script>". That string is
 * stored, written to Shopify, and rendered on the merchant's storefront by the
 * FAQ theme block: stored XSS on THEIR domain, against THEIR customers.
 *
 * So: decode first (a meta title should read "Kids & Teens", not
 * "Kids &amp; Teens"), then strip anything that looks like markup, then collapse
 * the whitespace that leaves behind. The order matters — stripping before
 * decoding would let exactly one round of escaping survive.
 *
 * @param {string} input
 * @param {number} [maxLength] hard cap applied last. Shopify truncates anyway;
 *   doing it here means the merchant reviews what will actually be published.
 */
export function toPlainText(input, maxLength = 0) {
  if (typeof input !== "string") return "";
  let out = decodeHtmlEntities(input);
  // Repeat until stable: "<<b>script>" leaves "<script>" after a single pass.
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    out = out.replace(/<[^>]*>/g, "");
    if (out === before) break;
  }
  // A surviving angle bracket cannot be markup by now, but it can still confuse
  // a consumer that concatenates into HTML — leave nothing to interpret.
  out = out.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  if (maxLength > 0 && out.length > maxLength) out = out.slice(0, maxLength).trimEnd();
  return out;
}
