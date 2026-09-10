/**
 * Install channels — Phase 5 item 6.
 *
 * `/go?ref=<handle>` has existed and worked since Phase 0. What was missing was
 * anything pointing at it: the redirector, the cookie, the sanitiser and the
 * attribution were all built and nothing linked to them, so every install
 * arrived as `unknown` or as an App Store surface. This file is the list of
 * handles that fixes that.
 *
 * ONE HANDLE PER SURFACE, and the surface is a place, not a campaign. "The
 * Bilby report page" is a surface; "the September push" is not. A handle
 * answers "where was the merchant standing when they clicked", which stays
 * meaningful for years — a campaign handle stops meaning anything the moment
 * the campaign ends, and then nobody can read last year's numbers.
 *
 * NEVER per-recipient. A handle is a CHANNEL, so it survives `shop/redact` as
 * aggregate data. A per-recipient token in a ref would make the install record
 * personal data and would have to be deleted with the shop, which would destroy
 * the only attribution we have.
 *
 * This module is client-safe (no server imports) so the digest, the docs test
 * and any future admin surface all read the same list. docs/INSTALL-CHANNELS.md
 * is the human-facing version and a test keeps the two in step.
 */

/** Where a ref link may live. Kept small on purpose — see the note above. */
export const CHANNEL_OWNERS = Object.freeze({
  NAVAAL: "navaal.ai",
  BILBY: "Bilby",
  OUTREACH: "outreach",
});

/**
 * The canonical channel list.
 *
 * `handle` goes in the URL. `where` is precise enough that somebody can find
 * the spot without asking. `owner` says which codebase owns the page — and two
 * of the three are NOT this repo, which is why the snippets are delivered
 * rather than committed.
 */
export const INSTALL_CHANNELS = Object.freeze([
  {
    handle: "navaal-home",
    owner: CHANNEL_OWNERS.NAVAAL,
    where: "navaal.ai homepage — primary hero call to action",
    copy: "Get it on the Shopify App Store",
  },
  {
    handle: "navaal-tools",
    owner: CHANNEL_OWNERS.NAVAAL,
    where: "navaal.ai /tools index — the card for the Shopify app",
    copy: "Install the Shopify app",
  },
  {
    handle: "navaal-nav",
    owner: CHANNEL_OWNERS.NAVAAL,
    where: "navaal.ai site header, the one persistent nav button",
    copy: "Shopify app",
  },
  {
    handle: "navaal-footer",
    owner: CHANNEL_OWNERS.NAVAAL,
    where: "navaal.ai global footer, under Products",
    copy: "Shopify app: AI SEO, AEO & GEO",
  },
  {
    handle: "blog-post",
    owner: CHANNEL_OWNERS.NAVAAL,
    where: "navaal.ai blog — the end-of-post call to action block",
    copy: "Do this automatically for every product",
  },
  {
    handle: "bilby-report",
    owner: CHANNEL_OWNERS.BILBY,
    where: "Bilby scan report — beside the product-content findings",
    copy: "Fix these with the Shopify app",
  },
  {
    handle: "bilby-footer",
    owner: CHANNEL_OWNERS.BILBY,
    where: "Bilby global footer — the Products column, first item",
    copy: "Shopify app: AI SEO, AEO & GEO",
  },
  {
    handle: "outreach-email",
    owner: CHANNEL_OWNERS.OUTREACH,
    where: "outreach emails — the single link in the body",
    copy: "See it on the Shopify App Store",
  },
]);

/** Just the handles, for a quick membership test. */
export const CHANNEL_HANDLES = Object.freeze(INSTALL_CHANNELS.map((c) => c.handle));

/** The prefix installTracking writes for a ref install: `ref:<handle>`. */
export const REF_SOURCE_PREFIX = "ref:";

/** The full install URL for a channel. Pure. */
export const installUrlFor = (handle) => `https://app.navaal.ai/go?ref=${handle}`;

/**
 * The `installSource` value a ref install is recorded as. Pure.
 * @returns {string} e.g. "ref:navaal-home"
 */
export const sourceForChannel = (handle) => `${REF_SOURCE_PREFIX}${handle}`;

/**
 * Turn an `installSource` into something a human reads in the digest. Pure.
 *
 * Unknown refs are shown as themselves rather than folded into "other": a
 * handle we do not recognise is either a link somebody added without telling
 * us — worth knowing about — or a typo in a link that is losing installs.
 * Hiding it would hide both.
 */
export function describeSource(source) {
  const s = String(source || "").trim();
  if (!s) return "unknown";
  if (s.startsWith(REF_SOURCE_PREFIX)) {
    const handle = s.slice(REF_SOURCE_PREFIX.length);
    const known = INSTALL_CHANNELS.find((c) => c.handle === handle);
    return known ? `${handle} (${known.owner})` : `${handle} (unregistered ref)`;
  }
  if (s.startsWith("app_store:")) return `App Store — ${s.slice("app_store:".length)}`;
  if (s.startsWith("utm:")) return `utm ${s.slice("utm:".length)}`;
  if (s === "pre_tracking") return "installed before tracking shipped";
  return s;
}

/**
 * The anchor to paste on a surface we own. Pure, so the docs and the
 * HUMAN-NEEDED list are generated from the same place as the handles and
 * cannot drift from them.
 *
 * `rel="noopener"` because it opens the App Store; no `target="_blank"` —
 * whether a link opens a new tab is the host page's decision, not ours.
 */
export function snippetFor(handle) {
  const c = INSTALL_CHANNELS.find((x) => x.handle === handle);
  if (!c) return null;
  return `<a href="${installUrlFor(handle)}" rel="noopener">${c.copy}</a>`;
}
