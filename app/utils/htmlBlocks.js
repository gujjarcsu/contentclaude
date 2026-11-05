/**
 * htmlBlocks — a product description's HTML as readable blocks, for display.
 *
 * Redesign (Nov 2026). The editor showed the draft as raw HTML in a text box
 * ("<p>A basin mixer that…</p>") and the store's own copy as a slice of HTML
 * cut at 500 characters, which can end inside a tag. This turns either into
 * paragraphs, headings and list items of plain text, so the merchant reads
 * words. It is display only: what is published is still the HTML, untouched.
 *
 * No markup survives (toPlainText strips every tag), so nothing here is ever
 * rendered as HTML. PURE — safe on the client.
 */
import { toPlainText } from "./text.js";

/**
 * @param {string} html
 * @returns {Array<{kind: "heading"|"paragraph"|"item", text: string}>}
 */
// A private-use character marks where a heading or list item began; it cannot
// occur in a merchant's description, so it never collides with real text.
const HEADING = "h";
const ITEM = "i";

export function htmlBlocks(html) {
  if (typeof html !== "string" || !html.trim()) return [];
  const marked = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*h[1-6][^>]*>/gi, `\n${HEADING}`)
    .replace(/<\s*li[^>]*>/gi, `\n${ITEM}`)
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|ul|ol|blockquote|tr)\s*>/gi, "\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*(p|div|ul|ol|blockquote|table|tr)[^>]*>/gi, "\n");
  const out = [];
  for (const raw of marked.split("\n")) {
    let kind = "paragraph";
    let line = raw;
    if (line.startsWith(HEADING)) {
      kind = "heading";
      line = line.slice(HEADING.length);
    } else if (line.startsWith(ITEM)) {
      kind = "item";
      line = line.slice(ITEM.length);
    }
    const text = toPlainText(line.split(HEADING).join("").split(ITEM).join(""));
    if (text) out.push({ kind, text });
  }
  return out;
}

/**
 * The FAQ draft ("Q: …\nA: …" pairs, as the generator writes it) as pairs.
 * Lines that do not follow the pattern are kept as answers so nothing written
 * is hidden.
 * @param {string} text
 * @returns {Array<{q: string, a: string}>}
 */
export function faqPairs(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const pairs = [];
  let cur = null;
  // The generator's output passes through toPlainText, which folds newlines
  // into spaces, so the markers are what separates the pairs.
  for (const raw of text.replace(/\s+(?=[QA]\s*:\s)/g, "\n").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const q = /^Q\s*[:.)-]\s*(.*)$/i.exec(line);
    const a = /^A\s*[:.)-]\s*(.*)$/i.exec(line);
    if (q) {
      cur = { q: q[1], a: "" };
      pairs.push(cur);
    } else if (a && cur) {
      cur.a = cur.a ? `${cur.a} ${a[1]}` : a[1];
    } else if (cur) {
      cur.a = cur.a ? `${cur.a} ${line}` : line;
    } else {
      pairs.push((cur = { q: "", a: line }));
    }
  }
  return pairs;
}
