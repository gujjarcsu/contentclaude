/**
 * Group 1 — the candidate primitive.
 *
 * One line was the origin of five wrong numbers:
 *
 *     const totalStoreProducts = productCountData.data?.productsCount?.count ?? products.length;
 *
 * An unfiltered `productsCount` became the Products header, the "Need Content"
 * stat card, the "Optimize store (N)" label on Home AND Products, the bulk
 * confirmation modal, and the SEO Audit population. On a real catalogue of
 * 3,148 products — 1,350 active, 280 draft, 1,518 archived — every one of those
 * said 3,148. That is not five bugs; it is one line with five symptoms.
 *
 * So this module is not a filter bolted onto those call sites. It is the single
 * answer to one question:
 *
 *     Which products may this action touch, for this shop, right now?
 *
 * ── Why it is PURE ─────────────────────────────────────────────────────────
 *
 * A shared rule living inside a Prisma-importing `.server.js` file is not
 * shareable, and that root cause has produced four separate defects in this
 * project (the Products triple-classifier, the quota `Infinity`, the three-toned
 * score bands, the state precedence). Everything here is a pure function of its
 * arguments so a Polaris component can import it. `candidates.server.js` does
 * the querying and re-exports these.
 *
 * ── The two axes, which are genuinely independent ──────────────────────────
 *
 * **Status** — a DRAFT product has no public page yet and an ARCHIVED one is not
 * for sale. Writing SEO copy for either spends a generation on a page nobody can
 * reach, which on a 1,000/month plan can be most of the month. Default: active
 * only. But it is a DEFAULT, not a law — some merchants draft in bulk and
 * publish in batches, and legitimately want drafts included. Hence `includeDrafts`.
 *
 * **Online Store publication** — a product can be ACTIVE and still not published
 * to the Online Store channel: POS-only, marketplace-only, wholesale, a B2B
 * catalogue. It then has no public page at any status and is not an SEO
 * candidate at all. We ignored this axis entirely. Multi-channel merchants have
 * many such products.
 *
 * ── The third thing this fixes: "missing" is not "not ours" ────────────────
 *
 * `needsContentFrom()` computed `totalProducts - withContent`, labelled it
 * "Need Content", and put it on the app's primary button. On a store where every
 * sampled product already had a description, an SEO title and an SEO
 * description, that number was ~500x too high. "Has no content at all" and "not
 * yet optimized by us" are different states and must never share a number, a
 * label, a badge or a colour. `CONTENT_ACTION` is that split.
 */

/** Shopify product statuses, as the Admin API spells them. */
export const PRODUCT_STATUS = {
  ACTIVE: "ACTIVE",
  DRAFT: "DRAFT",
  ARCHIVED: "ARCHIVED",
};

/**
 * The default scope: what an action may touch unless the merchant says otherwise.
 *
 * `includeArchived` exists for symmetry and completeness, and is never true by
 * default. An archived product is not for sale and has no storefront page;
 * generating for one is a generation spent on nothing.
 */
export const DEFAULT_SCOPE = Object.freeze({
  includeDrafts: false,
  includeArchived: false,
  /** Require publication to the Online Store channel. Off = no public page. */
  requireOnlineStore: true,
});

/** Normalise a partial/absent scope to a complete one. Pure. */
export function normaliseScope(scope) {
  return {
    includeDrafts: !!scope?.includeDrafts,
    includeArchived: !!scope?.includeArchived,
    requireOnlineStore: scope?.requireOnlineStore === undefined ? true : !!scope.requireOnlineStore,
  };
}

/**
 * The Shopify search query that selects exactly the candidates for a scope.
 *
 * Verified against the Admin GraphQL docs rather than assumed:
 *   - `status:` takes active / draft / archived
 *   - `published_status:published` means "published to the online store"
 *     (`visible` is its backwards-compatible alias; `unpublished` is the inverse)
 *
 * Returns "" when the scope excludes nothing, because passing an empty query is
 * not the same as passing no query on some Shopify endpoints — callers omit the
 * argument entirely when this is "".
 *
 * @param {object} [scope]
 * @returns {string}
 */
export function scopeQueryFor(scope) {
  const s = normaliseScope(scope);
  const statuses = [PRODUCT_STATUS.ACTIVE];
  if (s.includeDrafts) statuses.push(PRODUCT_STATUS.DRAFT);
  if (s.includeArchived) statuses.push(PRODUCT_STATUS.ARCHIVED);

  const parts = [];
  // All three statuses selected is every product, so the clause is noise.
  if (statuses.length < 3) {
    parts.push(statuses.length === 1 ? `status:${statuses[0].toLowerCase()}` : `(${statuses.map((x) => `status:${x.toLowerCase()}`).join(" OR ")})`);
  }
  if (s.requireOnlineStore) parts.push("published_status:published");
  return parts.join(" AND ");
}

/**
 * What a number computed under this scope actually refers to, in words a
 * merchant can check. Every surface that shows a candidate count shows this.
 *
 * Group 2.1's rule — no silent caps, ever — applies to scopes too: a number
 * whose population is not stated is a number the merchant cannot verify.
 */
export function scopeLabelFor(scope) {
  const s = normaliseScope(scope);
  const statuses = ["active"];
  if (s.includeDrafts) statuses.push("draft");
  if (s.includeArchived) statuses.push("archived");
  const statusPart =
    statuses.length === 1 ? "active products" : `${statuses.slice(0, -1).join(", ")} and ${statuses.at(-1)} products`;
  return s.requireOnlineStore ? `${statusPart} published to your online store` : statusPart;
}

/** The collection equivalent. Collections have no `status`, only publication. */
export function collectionScopeQueryFor(scope) {
  return normaliseScope(scope).requireOnlineStore ? "published_status:published" : "";
}

export function collectionScopeLabelFor(scope) {
  return normaliseScope(scope).requireOnlineStore
    ? "collections published to your online store"
    : "collections";
}

/**
 * Does this product fall inside the scope? For classifying rows we already hold,
 * without a second round trip.
 *
 * `publishedOnOnlineStore` must be a real boolean from the API. When it is
 * `undefined` — the caller did not ask for it — this does NOT quietly treat the
 * product as published: an unknown is excluded when the scope requires
 * publication, because counting an unknown as a candidate is how the original
 * defect happened.
 *
 * @param {{status?: string, publishedOnOnlineStore?: boolean}} product
 * @param {object} [scope]
 */
export function isCandidate(product, scope) {
  const s = normaliseScope(scope);
  const status = String(product?.status || "").toUpperCase();

  if (status === PRODUCT_STATUS.DRAFT && !s.includeDrafts) return false;
  if (status === PRODUCT_STATUS.ARCHIVED && !s.includeArchived) return false;
  if (status !== PRODUCT_STATUS.ACTIVE && status !== PRODUCT_STATUS.DRAFT && status !== PRODUCT_STATUS.ARCHIVED) {
    return false; // an unrecognised status is not silently a candidate
  }
  if (s.requireOnlineStore && product?.publishedOnOnlineStore !== true) return false;
  return true;
}

/**
 * The three states a candidate can be in with respect to content, and the action
 * each one deserves.
 *
 * GENERATE and ENHANCE are different products of work with different risk:
 * GENERATE fills a blank; ENHANCE rewrites something a human wrote and can make
 * it worse. Offering "Generate" on a product whose description the merchant
 * wrote themselves is how an app deletes a merchant's copy.
 */
export const CONTENT_ACTION = Object.freeze({
  /** Genuinely empty — no copy from anyone. */
  GENERATE: "generate",
  /** The merchant has their own copy; we have not touched it. */
  ENHANCE: "enhance",
  /** We have content for it already (draft, published or awaiting review). */
  OPTIMIZED: "optimized",
});

export const CONTENT_ACTION_LABEL = Object.freeze({
  [CONTENT_ACTION.GENERATE]: "No description",
  [CONTENT_ACTION.ENHANCE]: "Not yet optimized",
  [CONTENT_ACTION.OPTIMIZED]: "Optimized",
});

/**
 * Tone for each action. Deliberately NOT "critical" for ENHANCE.
 *
 * The Products list previously showed a red "Needs content" badge on every row
 * of a store where every product had a description. Red says "you have a
 * problem"; the merchant did not have a problem, and being told they did about
 * their own writing is how an app loses trust in the first thirty seconds.
 */
export const CONTENT_ACTION_TONE = Object.freeze({
  [CONTENT_ACTION.GENERATE]: "critical",
  [CONTENT_ACTION.ENHANCE]: "info",
  [CONTENT_ACTION.OPTIMIZED]: "success",
});

/**
 * Classify one product. Pure.
 *
 * @param {{hasOwnContent?: boolean, hasOurContent?: boolean}} input
 *   hasOwnContent — the merchant's own description is non-empty
 *   hasOurContent — we hold a GeneratedContent row for it
 */
export function actionFor({ hasOwnContent = false, hasOurContent = false } = {}) {
  if (hasOurContent) return CONTENT_ACTION.OPTIMIZED;
  return hasOwnContent ? CONTENT_ACTION.ENHANCE : CONTENT_ACTION.GENERATE;
}

/** Is a description string actually content? Whitespace and empty tags are not. */
export function hasRealContent(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim().length > 0;
}

/**
 * Read Shopify's `Count` object honestly.
 *
 * `productsCount` and `collectionsCount` return `{ count, precision }`, and
 * `precision` is `AT_LEAST` when "a limit was imposed and reached". We never
 * read it. So above Shopify's internal ceiling the API returns a CAPPED number
 * and the app was presenting it as an exact total — a 50,000-product merchant
 * would have been told they had far fewer, on the header of the screen they use
 * to check exactly that.
 *
 * Returns `exact: false` in that case so the surface can say "10,000+" rather
 * than a number that is simply wrong. A missing payload returns `null`, never 0:
 * zero is a claim, and "we could not read it" is not the same claim.
 *
 * @param {{count?: number, precision?: string}|null|undefined} payload
 * @returns {{count: number, exact: boolean}|null}
 */
export function readCount(payload) {
  const n = payload?.count;
  if (!Number.isFinite(n)) return null;
  return { count: n, exact: payload?.precision !== "AT_LEAST" };
}

/**
 * How many CANDIDATES this app has not written content for yet.
 *
 * This replaces `needsContentFrom(metrics, totalProducts)`, which subtracted
 * from the whole catalogue and was then labelled "Need Content". Two things were
 * wrong with it and only one of them was the denominator:
 *
 *   1. it counted archived and unpublished products as work to do
 *   2. it called the result "need content" when it means "we have not written
 *      for these" — false about every product whose description the merchant
 *      wrote themselves, which on a real store was all of them
 *
 * It lives here, once, because a screen that does this arithmetic inline is how
 * five surfaces came to disagree. Returns null when the candidate count is
 * unknown — never 0, which would read as "there is nothing to do".
 *
 * @param {number|null} candidateCount
 * @param {number} withContent  products we hold any GeneratedContent row for
 */
export function notOptimizedFrom(candidateCount, withContent) {
  if (!Number.isFinite(candidateCount) || candidateCount < 0) return null;
  return Math.max(0, candidateCount - (Number.isFinite(withContent) ? withContent : 0));
}

/**
 * Of those, how many will actually run right now, and how many must wait.
 *
 * Group 3.3 — the confirmation modal said "a background job for all 3,148
 * products ... ~184 minutes" while `sliceToQuota` was about to cut the run to
 * whatever quota remained. The app knew before the click and promised the whole
 * catalogue anyway. A confirmation that spends a merchant's money states what
 * will happen.
 */
export function splitByQuota(notOptimized, remaining) {
  if (!Number.isFinite(notOptimized)) return { now: null, waiting: null };
  const now = Math.min(notOptimized, Math.max(0, Number.isFinite(remaining) ? remaining : 0));
  return { now, waiting: Math.max(0, notOptimized - now) };
}

/** Render a count for a merchant, keeping the "+" when it is not exact. */
export function formatCount(c) {
  if (!c) return "—";
  return c.exact ? String(c.count) : `${c.count}+`;
}
