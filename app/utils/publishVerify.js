/**
 * Phase 4 item 4.2 — did the content we sent actually land?
 *
 * The difference between "we think it is live" and "it is live". Until now a
 * publish was called successful when Shopify's mutation returned no errors,
 * which proves the request was accepted — not that the field now holds what we
 * sent. Those are different claims, and the app was making the stronger one.
 *
 * ── Why this costs no extra Shopify requests ───────────────────────────────
 *
 * `productUpdate` returns the updated product in its own response. It was
 * asking for `product { id }` and throwing the rest away. It now asks for the
 * fields it just wrote, and compares against what it sent — same request, same
 * round trip, a slightly larger response body. A bulk run over 5,000 products
 * that issued a second read per publish would double its API calls and turn a
 * trust feature into a rate-limit incident.
 *
 * Metafields are the exception: `metafieldsSet` returns the metafield it wrote,
 * so the same trick works there. Nothing here needs a re-read.
 *
 * ── Why the comparison is not `===` ────────────────────────────────────────
 *
 * Shopify normalises what it stores. HTML gets re-serialised, attributes get
 * dropped, whitespace changes. A strict string comparison would report a
 * mismatch on almost every publish, the merchant would learn to ignore the
 * warning, and the feature would be worse than not having it.
 *
 * So each field is compared on what actually matters:
 *
 *   descriptionHtml   the TEXT survives — tags stripped, whitespace collapsed.
 *                     Markup Shopify rewrote is not a problem; words that went
 *                     missing are.
 *   seo.title         exact after trimming. These are plain strings that
 *   seo.description   Shopify stores verbatim, so a difference is real — most
 *                     often truncation, which the merchant needs to know about.
 *
 * The failure direction is chosen deliberately: when something cannot be
 * compared (Shopify returned no value for a field), that is **unverified**, not
 * verified. A verifier that passes when it cannot see anything is the third
 * false-green in this project, and it would look exactly as convincing as the
 * other two.
 */

/** Strip tags and collapse whitespace, so markup changes do not read as loss. */
export function textOf(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compare two plain strings the way Shopify stores them. */
const sameString = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

/**
 * The fields this app writes through productUpdate, and how each is checked.
 * `path` reads the value out of the mutation's returned product.
 */
const FIELDS = [
  {
    key: "descriptionHtml",
    label: "description",
    read: (p) => p?.descriptionHtml,
    same: (sent, got) => textOf(sent) === textOf(got),
    // A description Shopify shortened is the common real mismatch.
    why: (sent, got) =>
      textOf(got).length === 0
        ? "the description came back empty"
        : textOf(got).length < textOf(sent).length
          ? "Shopify stored a shorter description than we sent"
          : "the description Shopify stored does not match what we sent",
  },
  {
    key: "seoTitle",
    label: "page title",
    read: (p) => p?.seo?.title,
    same: sameString,
    why: (sent, got) =>
      String(got ?? "").trim().length < String(sent ?? "").trim().length
        ? "Shopify shortened the page title"
        : "the page title Shopify stored does not match what we sent",
  },
  {
    key: "seoDescription",
    label: "search description",
    read: (p) => p?.seo?.description,
    same: sameString,
    why: (sent, got) =>
      String(got ?? "").trim().length < String(sent ?? "").trim().length
        ? "Shopify shortened the search description"
        : "the search description Shopify stored does not match what we sent",
  },
];

/**
 * Compare what we sent with what `productUpdate` returned. Pure.
 *
 * Only fields that were actually SENT are checked — publishing just a meta
 * title must not report the description as unverified.
 *
 * @param {{descriptionHtml?: string, seo?: {title?: string, description?: string}}} sent
 *   the `product` input given to the mutation
 * @param {object|null|undefined} returned  `data.productUpdate.product`
 * @returns {{verified: boolean, checked: string[], mismatches: Array<{field: string, label: string, why: string}>, note: string|null}}
 */
export function verifyProductUpdate(sent, returned) {
  const sentValues = {
    descriptionHtml: sent?.descriptionHtml,
    seoTitle: sent?.seo?.title,
    seoDescription: sent?.seo?.description,
  };

  // Nothing was sent that we know how to check — say so rather than claiming a
  // verification that did not happen.
  const applicable = FIELDS.filter((f) => sentValues[f.key] != null && String(sentValues[f.key]) !== "");
  if (applicable.length === 0) {
    return { verified: false, checked: [], mismatches: [], note: "there was nothing to verify" };
  }

  // Shopify returned nothing to compare against. NOT verified.
  if (!returned) {
    return {
      verified: false,
      checked: [],
      mismatches: [],
      note: "Shopify did not return the updated product, so this could not be confirmed",
    };
  }

  const mismatches = [];
  const checked = [];
  for (const f of applicable) {
    const got = f.read(returned);
    if (got == null) {
      mismatches.push({
        field: f.key,
        label: f.label,
        why: `Shopify returned no ${f.label}, so it could not be confirmed`,
      });
      continue;
    }
    checked.push(f.key);
    if (!f.same(sentValues[f.key], got)) {
      mismatches.push({ field: f.key, label: f.label, why: f.why(sentValues[f.key], got) });
    }
  }

  return {
    verified: mismatches.length === 0,
    checked,
    mismatches,
    note: mismatches.length === 0 ? null : describeMismatches(mismatches),
  };
}

/**
 * One sentence a merchant can act on. Pure.
 * No field names, no codes — "Shopify shortened the page title", not
 * "seoTitle mismatch".
 */
export function describeMismatches(mismatches) {
  if (!mismatches || mismatches.length === 0) return null;
  if (mismatches.length === 1) return capitalise(mismatches[0].why);
  const labels = mismatches.map((m) => m.label);
  const last = labels.pop();
  return `Shopify stored something different for the ${labels.join(", ")} and ${last}. Open the product to compare.`;
}

const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Compare a metafield write with what `metafieldsSet` returned. Pure.
 * Same rule and same failure direction as above.
 */
export function verifyMetafield(sentValue, returned) {
  if (sentValue == null || String(sentValue) === "") {
    return { verified: false, note: "there was nothing to verify" };
  }
  const got = returned?.value;
  if (got == null) {
    return {
      verified: false,
      note: "Shopify did not return the saved value, so this could not be confirmed",
    };
  }
  // Metafield values are stored verbatim; JSON is compared as text after trim.
  return String(got).trim() === String(sentValue).trim()
    ? { verified: true, note: null }
    : { verified: false, note: "Shopify stored a different value for the FAQ schema" };
}
