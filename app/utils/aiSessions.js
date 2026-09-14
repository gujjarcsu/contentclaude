/**
 * P3.4 (Phase 8) — first-party AI sessions, the pure half.
 *
 * ShopifyQL exposes `agentic_referring_channel` on sessions (ChatGPT, Google
 * AI Mode / Gemini, Microsoft Copilot, Shop). Perplexity and Claude are not
 * first-class values there and must be INFERRED from the referrer domain,
 * and every screen labels them as inferred. AI-assisted visits that arrive
 * via Google count as organic in Shopify's data, so any number here is a
 * FLOOR and the screen says so.
 *
 * ── Why the query is not wired yet ─────────────────────────────────────────
 *
 * `shopifyqlQuery` needs `read_reports` and Shopify's Level 2 protected
 * customer data approval (10-MARKET.md §6; masterplan P0.10 — owner, not
 * started). Neither is a thing this app can grant itself. This module is the
 * part that does not wait: the channel map, the inference, the labels, the
 * floor sentence, all tested — so when the approval lands, the remaining
 * work is one query and one loader.
 *
 * PURE.
 */

/** Shopify's first-class values, as they appear in `agentic_referring_channel`. */
export const FIRST_CLASS = Object.freeze({
  chatgpt: "ChatGPT",
  google_ai: "Google AI Mode / Gemini",
  copilot: "Microsoft Copilot",
  shop: "Shop",
});

/** Referrer hosts that identify an engine Shopify does not name. Inferred. */
export const INFERRED_HOSTS = Object.freeze([
  { host: "perplexity.ai", label: "Perplexity" },
  { host: "claude.ai", label: "Claude" },
  { host: "anthropic.com", label: "Claude" },
  { host: "you.com", label: "You.com" },
  { host: "phind.com", label: "Phind" },
]);

/**
 * Classify one session by Shopify's channel first, then by referrer host.
 * @returns {{label: string, inferred: boolean}|null} null when not AI-referred
 */
export function classifySession({ agenticChannel = null, referrerHost = null } = {}) {
  const ch = String(agenticChannel ?? "").trim().toLowerCase();
  if (ch && FIRST_CLASS[ch]) return { label: FIRST_CLASS[ch], inferred: false };
  const host = String(referrerHost ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  for (const h of INFERRED_HOSTS) {
    if (host === h.host || host.endsWith(`.${h.host}`)) return { label: h.label, inferred: true };
  }
  return null;
}

/** Aggregate sessions into { label: { sessions, inferred } }, sorted by sessions desc. */
export function tallySessions(rows) {
  const t = {};
  for (const r of rows ?? []) {
    const c = classifySession(r);
    if (!c) continue;
    const n = Number(r.sessions ?? 1) || 0;
    t[c.label] = t[c.label] ?? { sessions: 0, inferred: c.inferred };
    t[c.label].sessions += n;
  }
  return Object.fromEntries(Object.entries(t).sort((a, b) => b[1].sessions - a[1].sessions));
}

/** The sentence every screen must carry beside the number. */
export const FLOOR_SENTENCE =
  "A floor, not a total: AI-assisted visits that arrive through Google count as organic in Shopify's data and are not in this number. Perplexity and Claude are inferred from the referrer and labelled so.";

/** "Perplexity (inferred)" */
export function displayLabel(label, inferred) {
  return inferred ? `${label} (inferred)` : label;
}
