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
