/**
 * Phase 12 Part E, line A6 — the clocks are in the code.
 *
 * Every platform date this app depends on, in one table, with a test that
 * goes red 90 days before each one (tests/utils/clocks.test.js). A date
 * nobody has announced gets a re-verification clock instead — the row says
 * when it was last checked and the test goes red when that check is 90 days
 * old — so "no date" is never mistaken for "no risk".
 *
 *   kind "sunset"    the thing stops working on `date`; red from date − 90 d
 *   kind "reverify"  no end date is announced; red when `verifiedAt` + 90 d
 *                    has passed — somebody re-reads the source and updates
 *                    verifiedAt (or converts the row to a sunset)
 *
 * PURE. Sources are URLs a human can read; the test does not fetch them.
 */

export const WARN_DAYS = 90;

export const CLOCKS = Object.freeze([
  {
    key: "admin-api-2026-04",
    what: "Shopify Admin GraphQL API version 2026-04 (the version this app pins: ApiVersion.April26 in app/shopify.server.js). Each version is supported for twelve months from release.",
    kind: "sunset",
    date: "2027-04-01",
    action: "Bump ApiVersion in app/shopify.server.js and API_VERSION in catalogueWatch.server.js / installState.server.js to a supported version; run the suite; release an app version.",
    source: "https://shopify.dev/docs/api/usage/versioning",
  },
  {
    key: "script-tag-injection",
    what: "Shopify ends ScriptTag injection on Online Store themes on 1 March 2027. This app injects nothing through ScriptTag — its storefront presence is the theme app extension — so the clock is a guard that it stays that way.",
    kind: "sunset",
    date: "2027-03-01",
    action: "Nothing, as long as the ScriptTag guard in the test stays at zero. If a script tag is ever added, it must move to the theme app extension before this date.",
    source: "https://shopify.dev/docs/apps/build/online-store/theme-app-extensions",
  },
  {
    key: "product-featuredimage",
    what: "Product.featuredImage is deprecated in the Admin GraphQL API in favour of featuredMedia. No removal version is announced. The walk already reads featuredMedia (F5, Phase 9); six files still read featuredImage as a fallback or in the merchant screens.",
    kind: "reverify",
    verifiedAt: "2026-09-15",
    action: "Re-read the Product object reference for a removal version. When one is announced, convert this row to a sunset and move the remaining readers (grep featuredImage in app/) to featuredMedia before it.",
    source: "https://shopify.dev/docs/api/admin-graphql/2026-04/objects/Product",
  },
  {
    key: "model-claude-sonnet-4-6",
    what: "Anthropic model claude-sonnet-4-6 (modelPricing.js). No deprecation is announced.",
    kind: "reverify",
    verifiedAt: "2026-09-15",
    action: "Re-read Anthropic's model deprecations page. When a retirement date is announced, convert this row to a sunset and repoint modelPricing.js before it.",
    source: "https://docs.anthropic.com/en/docs/about-claude/model-deprecations",
  },
  {
    key: "model-claude-sonnet-5",
    what: "Anthropic model claude-sonnet-5 (modelPricing.js). No deprecation is announced.",
    kind: "reverify",
    verifiedAt: "2026-09-15",
    action: "As above.",
    source: "https://docs.anthropic.com/en/docs/about-claude/model-deprecations",
  },
  {
    key: "model-claude-haiku-4-5",
    what: "Anthropic model claude-haiku-4-5-20251001 (modelPricing.js). No deprecation is announced.",
    kind: "reverify",
    verifiedAt: "2026-09-15",
    action: "As above.",
    source: "https://docs.anthropic.com/en/docs/about-claude/model-deprecations",
  },
  {
    key: "polaris-react-13",
    what: "@shopify/polaris ^13 (React components). Shopify's direction is Polaris web components; no end-of-support date for v13 is announced.",
    kind: "reverify",
    verifiedAt: "2026-09-15",
    action: "Re-read the Polaris changelog. When an end date is announced, convert to a sunset; the i18n layer (Phase 12 Part D) keeps merchant strings out of components so a migration touches markup only.",
    source: "https://github.com/Shopify/polaris/blob/main/polaris-react/CHANGELOG.md",
  },
  {
    key: "shopify-app-react-router-1",
    what: "@shopify/shopify-app-react-router ^1 — the app framework (auth, webhooks, billing). No major with a migration deadline is announced.",
    kind: "reverify",
    verifiedAt: "2026-09-15",
    action: "Re-read the package changelog. A major bump is a phase, not a patch: the token-exchange, webhook and billing paths each have tests that must stay green.",
    source: "https://github.com/Shopify/shopify-app-js/blob/main/packages/apps/shopify-app-react-router/CHANGELOG.md",
  },
]);

const DAY = 86_400_000;

/**
 * The state of one clock at `now`.
 * @returns {{key: string, daysLeft: number, red: boolean, reason: string}}
 */
export function clockState(row, now = new Date()) {
  const t = now.getTime();
  if (row.kind === "sunset") {
    const end = new Date(row.date).getTime();
    const daysLeft = Math.floor((end - t) / DAY);
    return { key: row.key, daysLeft, red: daysLeft <= WARN_DAYS, reason: daysLeft <= WARN_DAYS ? `${row.key}: ${daysLeft} days to ${row.date} — ${row.action}` : "" };
  }
  const due = new Date(row.verifiedAt).getTime() + WARN_DAYS * DAY;
  const daysLeft = Math.floor((due - t) / DAY);
  return { key: row.key, daysLeft, red: daysLeft < 0, reason: daysLeft < 0 ? `${row.key}: last verified ${row.verifiedAt}, ${-daysLeft} days overdue — ${row.action}` : "" };
}

export function redClocks(now = new Date()) {
  return CLOCKS.map((r) => clockState(r, now)).filter((s) => s.red);
}
