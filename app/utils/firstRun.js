/**
 * P2.7 — the 60-second first run, rebuilt around what the daily walk found.
 *
 * The old first run showed a score and three drafts. That is still here —
 * the drafts are the "fix the first in one click". What it lacked was the
 * SPECIFIC things holding this store back, named from this store's own
 * catalogue, each with the one action that fixes it. The first Home load
 * already walks the catalogue once (P2.3) and grades every product (P2.2);
 * this turns those stored findings into at most three lines, blocking
 * before degrading, biggest count first, each pointing at the Fix page or
 * at Shopify admin when the fix is not ours to make.
 *
 * Then: "we'll watch it from here" — the sentence that names the
 * subscription, on the screen a merchant sees once.
 *
 * PURE.
 */

import { T, enT } from "../i18n/index.js";

/**
 * Finding groups, in severity order. `key` matches the tally key
 * `${surface}·${field}·${grade}` the production script also prints.
 * D1 — each line is one catalogue key with ICU plurals, built by the
 * translator the caller passes (English by default, so the sentences are
 * what they were); the fix label is a key the screen translates.
 */
export const BLOCKER_GROUPS = Object.freeze([
  {
    key: "openai·description·blocking",
    grade: "blocking",
    line: (n, t = enT) => t("{n, plural, one {# product has} other {# products have}} no description — the OpenAI product feed cannot list {n, plural, one {it} other {them}}. The first three are being written below.", { n }),
    fix: { label: T("Write the rest in bulk"), to: "/app/fix", needsBulk: true },
  },
  {
    key: "openai·image_link·blocking",
    grade: "blocking",
    line: (n, t = enT) => t("{n, plural, one {# product has} other {# products have}} no image — the feed requires one, and only you can add it.", { n }),
    fix: { label: T("Add images in Shopify"), to: "shopify://admin/products", external: true },
  },
  {
    key: "openai·brand·blocking",
    grade: "blocking",
    line: (n, t = enT) => t("{n, plural, one {# product has} other {# products have}} no brand — Shopify's vendor field is empty, and the feed requires it.", { n }),
    fix: { label: T("Set the brand in one click"), to: "/app/fix", needsBulk: true },
  },
  {
    key: "openai·title·blocking",
    grade: "blocking",
    line: (n, t = enT) => t("{n, plural, one {# product has} other {# products have}} no title.", { n }),
    fix: { label: T("Open products in Shopify"), to: "shopify://admin/products", external: true },
  },
  {
    key: "openai·link·blocking",
    grade: "blocking",
    line: (n, t = enT) => t("{n, plural, one {# product is} other {# products are}} not on your Online Store channel, so {n, plural, one {it has} other {they have}} no public page.", { n }),
    fix: { label: T("Open products in Shopify"), to: "shopify://admin/products", external: true },
  },
  {
    key: "openai·description·degrading",
    grade: "degrading",
    line: (n, t = enT) => t("{n, plural, one {# description is} other {# descriptions are}} too short for an answer to quote. The first three are being written below.", { n }),
    fix: { label: T("Write the rest in bulk"), to: "/app/fix", needsBulk: true },
  },
  {
    key: "openai·image alt·degrading",
    grade: "degrading",
    line: (n, t = enT) => t("{n, plural, one {# image has} other {# images have}} no alt text — free to write, reviewed before it is published.", { n }),
    fix: { label: T("Write alt text"), to: "/app/fix", needsBulk: true },
  },
  {
    key: "openai·variant options·degrading",
    grade: "degrading",
    line: (n, t = enT) => t("{n, plural, one {# product's option is} other {# products' options are}} still called “Title”.", { n }),
    fix: { label: T("Name the options"), to: "/app/fix", needsBulk: true },
  },
  {
    key: "openai·gtin·degrading",
    grade: "degrading",
    line: (n, t = enT) => t("{n, plural, one {# product has} other {# products have}} no barcode. Own brand or handmade? Say so once and it stops.", { n }),
    // NOT `needsBulk`. This one writes a PREFERENCE to our own database
    // ("own brand or handmade — stop asking"), touches no catalogue and costs
    // nothing. Charging a merchant to stop being nagged would be the wrong
    // direction, so it is the fix a free store can always press.
    fix: { label: T("Tell us"), to: "/app/fix" },
  },
]);

export const PASSWORD_BLOCKER = Object.freeze({
  key: "storefront·password",
  grade: "blocking",
  count: null,
  line: T("Your storefront is password-protected, so nothing can be listed anywhere yet. Expected before launch; we re-check the night it opens."),
  fix: null,
});

/** `${surface}·${field}·${grade}` → count, over non-draft rows. */
export function tallyFindings(rows, parseFindings) {
  const tally = {};
  for (const r of rows ?? []) {
    if (String(r?.statusShop ?? "").toUpperCase() === "DRAFT") continue;
    for (const f of parseFindings(r?.grade)) {
      const key = `${f.surface ?? "shopify"}·${f.field}·${f.grade}`;
      tally[key] = (tally[key] ?? 0) + 1;
    }
  }
  return tally;
}

/**
 * At most `max` lines: blocking before degrading, larger counts first.
 * A password-locked storefront is added last, if there is room, because it
 * is expected and the merchant already knows.
 */
export function blockerLines(tally, { passwordProtected = false, max = 3, t = enT } = {}) {
  const rank = { blocking: 0, degrading: 1 };
  const out = BLOCKER_GROUPS.map((g) => ({ g, count: Number(tally?.[g.key] ?? 0) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => rank[a.g.grade] - rank[b.g.grade] || b.count - a.count)
    .slice(0, max)
    .map(({ g, count }) => ({ key: g.key, grade: g.grade, count, line: g.line(count, t), fix: g.fix }));
  if (passwordProtected && out.length < max) out.push({ ...PASSWORD_BLOCKER, line: t(PASSWORD_BLOCKER.line) });
  return out;
}

/**
 * D1 — the line for one blocker in a language, at render time. The loader's
 * copy is English (and the start payload is cached), so a screen translates
 * here from the blocker's key and count rather than trusting a stored line.
 */
export function blockerLine(b, t = enT) {
  if (!b) return "";
  if (b.key === PASSWORD_BLOCKER.key) return t(PASSWORD_BLOCKER.line);
  const g = BLOCKER_GROUPS.find((x) => x.key === b.key);
  return g ? g.line(Number(b.count) || 0, t) : (b.line ?? "");
}

/** The sentence that names the subscription. One place, so every screen agrees. */
export const WATCH_FROM_HERE = Object.freeze({
  title: T("We'll watch it from here."),
  body: T(
    "Every day we read your whole catalogue again: descriptions that collapse, alt text that disappears, URLs that change, new products with nothing written, what each AI surface asks for, whether six search and AI crawlers can reach your storefront, and whether your pages can be indexed. When something changes, Home tells you the same day — and only then.",
  ),
});

/**
 * Phase 15 — CAN THIS PLAN ACTUALLY PRESS THIS BUTTON?
 *
 * CW's third confusion count found the darkest control on a brand-new Free
 * store's first screen was "Write the rest in bulk", and every bulk run on
 * `/app/fix` is a Starter feature (14-PRICING.md §4: Free is "one at a time").
 * The screen offered it as the primary action with no marker at all, so the
 * first thing a merchant is invited to do was the one thing their plan could
 * not do.
 *
 * Two rules follow, and they are here rather than in a component so they can be
 * proved without rendering:
 *   - a fix the plan cannot run is never the primary control;
 *   - and it carries a marker naming the plan that can.
 *
 * PURE.
 */
export function canRunFix(fix, entitlements) {
  if (!fix) return false;
  if (!fix.needsBulk) return true;
  return !!entitlements?.bulkJobs;
}

/**
 * Index of the blocker whose fix should be the primary (dark) control, or -1
 * when this plan can run none of them — in which case nothing is primary,
 * because a dark button that refuses is worse than no dark button.
 */
export function primaryFixIndex(blockers, entitlements) {
  const list = Array.isArray(blockers) ? blockers : [];
  return list.findIndex((b) => b?.fix && canRunFix(b.fix, entitlements));
}
