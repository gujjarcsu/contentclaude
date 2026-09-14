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

const one = (n, s, p) => (n === 1 ? s : p);

/**
 * Finding groups, in severity order. `key` matches the tally key
 * `${surface}·${field}·${grade}` the production script also prints.
 */
export const BLOCKER_GROUPS = Object.freeze([
  {
    key: "openai·description·blocking",
    grade: "blocking",
    line: (n) => `${n} ${one(n, "product has", "products have")} no description — the OpenAI product feed cannot list ${one(n, "it", "them")}. The first three are being written below.`,
    fix: { label: "Write the rest in bulk", to: "/app/fix" },
  },
  {
    key: "openai·image_link·blocking",
    grade: "blocking",
    line: (n) => `${n} ${one(n, "product has", "products have")} no image — the feed requires one, and only you can add it.`,
    fix: { label: "Add images in Shopify", to: "shopify://admin/products", external: true },
  },
  {
    key: "openai·brand·blocking",
    grade: "blocking",
    line: (n) => `${n} ${one(n, "product has", "products have")} no brand — Shopify's vendor field is empty, and the feed requires it.`,
    fix: { label: "Set the brand in one click", to: "/app/fix" },
  },
  {
    key: "openai·title·blocking",
    grade: "blocking",
    line: (n) => `${n} ${one(n, "product has", "products have")} no title.`,
    fix: { label: "Open products in Shopify", to: "shopify://admin/products", external: true },
  },
  {
    key: "openai·link·blocking",
    grade: "blocking",
    line: (n) => `${n} ${one(n, "product is", "products are")} not on your Online Store channel, so ${one(n, "it has", "they have")} no public page.`,
    fix: { label: "Open products in Shopify", to: "shopify://admin/products", external: true },
  },
  {
    key: "openai·description·degrading",
    grade: "degrading",
    line: (n) => `${n} ${one(n, "description is", "descriptions are")} too short for an answer to quote. The first three are being written below.`,
    fix: { label: "Write the rest in bulk", to: "/app/fix" },
  },
  {
    key: "openai·image alt·degrading",
    grade: "degrading",
    line: (n) => `${n} ${one(n, "image has", "images have")} no alt text — free to write, reviewed before it is published.`,
    fix: { label: "Write alt text", to: "/app/fix" },
  },
  {
    key: "openai·variant options·degrading",
    grade: "degrading",
    line: (n) => `${n} ${one(n, "product's option is", "products' options are")} still called “Title”.`,
    fix: { label: "Name the options", to: "/app/fix" },
  },
  {
    key: "openai·gtin·degrading",
    grade: "degrading",
    line: (n) => `${n} ${one(n, "product has", "products have")} no barcode. Own brand or handmade? Say so once and it stops.`,
    fix: { label: "Tell us", to: "/app/fix" },
  },
]);

export const PASSWORD_BLOCKER = Object.freeze({
  key: "storefront·password",
  grade: "blocking",
  count: null,
  line: "Your storefront is password-protected, so nothing can be listed anywhere yet. Expected before launch; we re-check the night it opens.",
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
export function blockerLines(tally, { passwordProtected = false, max = 3 } = {}) {
  const rank = { blocking: 0, degrading: 1 };
  const out = BLOCKER_GROUPS.map((g) => ({ g, count: Number(tally?.[g.key] ?? 0) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => rank[a.g.grade] - rank[b.g.grade] || b.count - a.count)
    .slice(0, max)
    .map(({ g, count }) => ({ key: g.key, grade: g.grade, count, line: g.line(count), fix: g.fix }));
  if (passwordProtected && out.length < max) out.push({ ...PASSWORD_BLOCKER });
  return out;
}

/** The sentence that names the subscription. One place, so every screen agrees. */
export const WATCH_FROM_HERE = Object.freeze({
  title: "We'll watch it from here.",
  body:
    "Every day we read your whole catalogue again: descriptions that collapse, alt text that disappears, URLs that change, new products with nothing written, what each AI surface asks for, whether six search and AI crawlers can reach your storefront, and whether your pages can be indexed. When something changes, Home tells you the same day — and only then.",
});
