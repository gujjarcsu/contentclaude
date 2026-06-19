// ROI / provable-outcomes engine — server-only, pure.
//
// Turns the signals the app ALREADY measures into an honest before→after story:
// SEO score delta, GEO score delta, coverage, schema/AEO breadth, content pieces,
// and an explicitly-labelled time-saved ESTIMATE with a transparent formula.
//
// Hard rule: never fabricate traffic, revenue, rankings, or citations. The only
// forward-looking number here is "time saved", which is a clearly-labelled
// estimate derived from a stated formula — not a claim about money or traffic.

// Transparent basis for the time-saved estimate: researching + writing one
// publish-ready content piece (description / meta set / FAQ) by hand. Conservative.
const MINUTES_PER_PIECE_MANUAL = 12;

function delta(before, after) {
  const b = Number(before) || 0;
  const a = Number(after) || 0;
  return { before: b, after: a, change: a - b };
}

/**
 * @param {object} input
 *   seoBefore, seoAfter   – store-average SEO scores (0–100)
 *   geoBefore, geoAfter   – store-average GEO scores (0–100)
 *   totalProducts         – catalog size
 *   optimizedProducts     – distinct products with published AI content
 *   contentPieces         – total published content pieces generated
 *   schemaTypes           – array of distinct JSON-LD types now emitted (e.g. ["Product","FAQPage"])
 * @returns {object} structured, honest results summary
 */
export function computeRoiSummary(input = {}) {
  const seo = delta(input.seoBefore, input.seoAfter);
  const geo = delta(input.geoBefore, input.geoAfter);

  const totalProducts = Math.max(0, Number(input.totalProducts) || 0);
  const optimizedProducts = Math.max(0, Number(input.optimizedProducts) || 0);
  const contentPieces = Math.max(0, Number(input.contentPieces) || 0);
  const schemaTypes = Array.isArray(input.schemaTypes) ? [...new Set(input.schemaTypes)] : [];

  const coveragePct = totalProducts > 0
    ? Math.min(100, Math.round((optimizedProducts / totalProducts) * 100))
    : 0;

  const timeSavedMinutes = contentPieces * MINUTES_PER_PIECE_MANUAL;

  return {
    // ── Measured (not estimates) ──────────────────────────────────────────────
    seoScore: seo,
    geoScore: geo,
    coveragePct,
    optimizedProducts,
    totalProducts,
    contentPieces,
    schemaTypesAdded: schemaTypes,
    aeoReady: schemaTypes.length > 0 && contentPieces > 0,

    // ── Estimate (labelled, with its basis) ───────────────────────────────────
    timeSaved: {
      minutes: timeSavedMinutes,
      hours: Math.round((timeSavedMinutes / 60) * 10) / 10,
      label: humanizeMinutes(timeSavedMinutes),
      isEstimate: true,
      basis: `${contentPieces} published pieces × ${MINUTES_PER_PIECE_MANUAL} min to research & write each by hand`,
    },

    // Headline deltas for a results card
    headline: {
      geoDelta: geo.change,
      seoDelta: seo.change,
      improved: geo.change > 0 || seo.change > 0,
    },
  };
}

function humanizeMinutes(mins) {
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${mins} min`;
  const hours = mins / 60;
  if (hours < 10) return `${Math.round(hours * 10) / 10} hrs`;
  return `${Math.round(hours)} hrs`;
}

export { MINUTES_PER_PIECE_MANUAL };
