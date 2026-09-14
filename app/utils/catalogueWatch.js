/**
 * P2.3 — catalogue decay, as a diff. The pure half.
 *
 * W1 killed the eligibility pillar (36.2% below the 40% bar once content checks
 * are stripped; crawler blocking on 0.5% of stores) and re-aimed the
 * subscription at what actually recurs in every active store: products decay.
 * A bulk import wipes descriptions. A theme change drops alt text. A handle
 * edit breaks every inbound link. And new products arrive with nothing written
 * for them — guaranteed, in every store that is still trading.
 *
 * The one-time audit is the lead magnet. Being told, the day it happens, that
 * something changed and needs you is what bills forever. This module decides
 * WHAT needs the merchant; the server module decides when to look.
 *
 * ── The five kinds, and why exactly these ──────────────────────────────────
 *
 * The Phase 7 brief names them and nothing else: description length collapse,
 * missing product_type, alt text lost, canonical drift, new products arriving
 * unoptimised. Three are REGRESSIONS (a previous snapshot is needed), one is a
 * STANDING gap, one is an ARRIVAL. A standing thin description is deliberately
 * not here — that is already the "not yet optimized" number on Products, and
 * the same product must not be counted twice under two names.
 *
 * Every kind is graded by what it DOES to the merchant, never called a
 * disqualification: product_type is Shopify's own taxonomy field, not on any
 * surface's required list (09-DOCTRINE.md §1). L6: graded, never binary.
 *
 * PURE. No I/O.
 */
// The one definition. catalogGaps.server.js re-exports it; it lives here
// because this module must stay free of server imports for the routes.
export const THIN_DESCRIPTION_CHARS = 50;

/** Enough to know thin (<50) and to see a collapse; not 64 KB per product. */
export const WATCH_DESC_CAP = 600;

/** A handle change is a one-time event; it is shown for this long. */
export const HANDLE_NOTICE_MS = 7 * 24 * 3600 * 1000;

export const KIND = Object.freeze({
  DESCRIPTION_COLLAPSED: "description_collapsed",
  PRODUCT_TYPE_MISSING: "product_type_missing",
  ALT_TEXT_LOST: "alt_text_lost",
  HANDLE_CHANGED: "handle_changed",
  NEW_UNOPTIMISED: "new_unoptimised",
});

/** What a merchant reads, and what it costs them — graded, never "broken". */
export const KIND_LABEL = Object.freeze({
  [KIND.DESCRIPTION_COLLAPSED]: {
    title: "Description collapsed",
    detail: "This product's description dropped below 50 characters since we last looked — usually a bulk import or an edit that cleared it.",
    grade: "degrading",
  },
  [KIND.PRODUCT_TYPE_MISSING]: {
    title: "No product type",
    detail: "Shopify's product type is empty. It is not required by any AI surface, but it feeds Shopify's own categorisation and your filters.",
    grade: "cosmetic",
  },
  [KIND.ALT_TEXT_LOST]: {
    title: "Alt text lost",
    detail: "The featured image had alt text and now has none — a theme change or a re-upload. Alt text is free to regenerate.",
    grade: "degrading",
  },
  [KIND.HANDLE_CHANGED]: {
    title: "URL changed",
    detail: "The product's handle changed, so its address changed with it. Anything linking to the old address now lands on a redirect at best.",
    grade: "degrading",
  },
  [KIND.NEW_UNOPTIMISED]: {
    title: "New, nothing written yet",
    detail: "This product arrived after we started watching and has no content from us.",
    grade: "cosmetic",
  },
});

/**
 * A snapshot from one Shopify product node. Only the fields the diff needs.
 * @param {object} node
 * @returns {{productId: string, title: string, handle: string, descLen: number,
 *   hasType: boolean, hasAlt: boolean, createdAtShop: Date|null}}
 */
export function snapshotFromNode(node) {
  const desc = String(node?.description ?? "").trim();
  return {
    productId: String(node?.id ?? ""),
    title: String(node?.title ?? ""),
    handle: String(node?.handle ?? ""),
    descLen: Math.min(desc.length, WATCH_DESC_CAP),
    hasType: String(node?.productType ?? "").trim().length > 0,
    hasAlt: String(node?.featuredImage?.altText ?? "").trim().length > 0,
    createdAtShop: node?.createdAt ? new Date(node.createdAt) : null,
  };
}

/** Parse a stored attention JSON safely. Bad JSON is "nothing", never a crash. */
export function parseAttention(json) {
  try {
    const v = JSON.parse(json || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Decide what needs the merchant for one product, given what we saw last time.
 *
 * @param {object|null} prev previous ProductWatch row (or null: first sighting)
 * @param {object} next fresh snapshot from snapshotFromNode
 * @param {{hasContent: boolean, watchStartedAt: Date, now?: Date}} ctx
 * @returns {{[kind: string]: string}} attention as { kind: ISO since }
 */
export function diffProduct(prev, next, { hasContent, watchStartedAt, now = new Date() }) {
  const iso = now.toISOString();
  const att = prev ? { ...parseAttention(prev.attention) } : {};
  const thin = THIN_DESCRIPTION_CHARS;

  // REGRESSIONS — need a previous snapshot; a first sighting cannot regress.
  if (prev) {
    if (prev.descLen >= thin && next.descLen < thin) att[KIND.DESCRIPTION_COLLAPSED] ??= iso;
    if (prev.hasAlt && !next.hasAlt) att[KIND.ALT_TEXT_LOST] ??= iso;
    // A handle change is re-stamped each time it happens: two changes in a
    // week are two events, and the merchant should see the latest date.
    if (prev.handle && next.handle && prev.handle !== next.handle) att[KIND.HANDLE_CHANGED] = iso;
  }

  // STANDING — true regardless of history.
  if (!next.hasType) att[KIND.PRODUCT_TYPE_MISSING] ??= iso;

  // ARRIVAL — created after the watch began, first time we see it, nothing
  // written. "After the watch began" is what stops the very first run flagging
  // every product in the store as new.
  if (
    !prev &&
    !hasContent &&
    next.createdAtShop instanceof Date &&
    watchStartedAt instanceof Date &&
    next.createdAtShop.getTime() > watchStartedAt.getTime()
  ) {
    att[KIND.NEW_UNOPTIMISED] = iso;
  }

  // RESOLUTIONS — a kind clears when its condition is no longer true. A
  // merchant who fixes something must see it disappear, or the number is noise.
  if (next.descLen >= thin) delete att[KIND.DESCRIPTION_COLLAPSED];
  if (next.hasAlt) delete att[KIND.ALT_TEXT_LOST];
  if (next.hasType) delete att[KIND.PRODUCT_TYPE_MISSING];
  if (hasContent) delete att[KIND.NEW_UNOPTIMISED];
  if (att[KIND.HANDLE_CHANGED] && now.getTime() - new Date(att[KIND.HANDLE_CHANGED]).getTime() > HANDLE_NOTICE_MS) {
    delete att[KIND.HANDLE_CHANGED];
  }

  return att;
}

/**
 * The one merchant-facing number, and its "since yesterday" companion.
 *
 * @param {Array<{attention: string|object}>} rows
 * @param {Date} [now]
 * @returns {{needAttention: number, sinceYesterday: number, byKind: Record<string, number>}}
 */
export function summarise(rows, now = new Date()) {
  const dayAgo = now.getTime() - 24 * 3600 * 1000;
  let needAttention = 0;
  let sinceYesterday = 0;
  const byKind = {};
  for (const r of rows ?? []) {
    const att = typeof r?.attention === "string" ? parseAttention(r.attention) : r?.attention ?? {};
    const kinds = Object.keys(att);
    if (kinds.length === 0) continue;
    needAttention++;
    for (const k of kinds) byKind[k] = (byKind[k] ?? 0) + 1;
    const earliest = Math.min(...kinds.map((k) => new Date(att[k]).getTime()).filter(Number.isFinite));
    if (Number.isFinite(earliest) && earliest > dayAgo) sinceYesterday++;
  }
  return { needAttention, sinceYesterday, byKind };
}

/** "3 products need attention, 1 since yesterday." — one sentence, or null. */
export function attentionSentence({ needAttention, sinceYesterday }) {
  if (!needAttention) return null;
  const p = needAttention === 1 ? "product needs" : "products need";
  const since = sinceYesterday > 0 ? `, ${sinceYesterday} since yesterday` : "";
  return `${needAttention} ${p} attention${since}.`;
}
