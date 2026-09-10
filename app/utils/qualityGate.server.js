/**
 * Phase 4 item 4.1 — the gate, wired to the database.
 *
 * The rules are pure and live in `contentQuality.js`. This is the thin server
 * half: fetch the comparison window, run the rules, retry once, and say what
 * happened. Nothing is saved before it runs.
 *
 * ── Why the window is bounded ──────────────────────────────────────────────
 *
 * A 5,000-product run comparing each new description against every previous one
 * is 12.5 million comparisons. The window is the shop's most recent
 * `DUPLICATE_WINDOW` description fingerprints — 200 rows of 16 bytes, one
 * indexed query per generation. That catches the failure that actually happens
 * (a run emitting the same paragraphs over and over, which shows up within a
 * few products) without pretending to be a catalogue-wide plagiarism check.
 *
 * ── Retry once, then keep it as a draft ────────────────────────────────────
 *
 * A failing draft is not thrown away. The merchant paid a generation for it,
 * and deleting it would leave them with nothing and no explanation. It is saved
 * with a note saying what is wrong, and — crucially — **autopilot will not
 * publish it**. The merchant decides.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { assessContent, describeAssessment, simhash, DUPLICATE_WINDOW } from "./contentQuality.js";

export { QUALITY_THRESHOLD, DUPLICATE_WINDOW } from "./contentQuality.js";
import { familyKeyOf } from "./variantFamily.js";

/**
 * The shop's most recent description fingerprints, for duplicate comparison.
 *
 * Rows with no fingerprint are EXCLUDED rather than treated as unique. Treating
 * unknown as unique is how a duplicate check silently stops working: every
 * pre-gate row would look like a non-match and drag the window's usefulness
 * down without anything failing.
 *
 * Never throws — an unavailable window means the duplicate rule cannot run, and
 * the rest of the gate still should.
 */
export async function recentFingerprints(shop, { excludeProductId = null, take = DUPLICATE_WINDOW } = {}) {
  try {
    const rows = await prisma.generatedContent.findMany({
      where: {
        shop,
        contentType: "description",
        simhash: { not: null },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { productId: true, simhash: true, productTitle: true },
      orderBy: { updatedAt: "desc" },
      take,
    });
    // Group 5.3 — the family key travels with each fingerprint so the duplicate
    // check can skip siblings. Computed from the stored title, which is all the
    // window has: `familyKeyOf` is built to work from a title alone for exactly
    // this reason. A row with no title yields "", which never matches anything,
    // so an old row is compared normally rather than silently skipped.
    return rows.map((r) => ({ ...r, familyKey: familyKeyOf({ title: r.productTitle }) }));
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "duplicate window unavailable (non-fatal)");
    return [];
  }
}

/**
 * Assess generated content, regenerating ONCE if it fails.
 *
 * @param {object} o
 * @param {string} o.shop
 * @param {string} o.productId
 * @param {object} o.generated        { description, metaTitle, metaDescription, faq }
 * @param {object} o.product          { title, vendor, productType }
 * @param {string} o.shopDomain
 * @param {string} [o.locale]
 * @param {(content: object) => number|null} o.scoreOf   the content scorer
 * @param {() => Promise<object|null>} [o.regenerate]    called at most once
 * @returns {Promise<{content: object, assessment: object, regenerated: boolean, note: string|null}>}
 */
export async function gateContent({
  shop,
  productId,
  generated,
  product = {},
  shopDomain = "",
  locale = "en",
  scoreOf,
  regenerate = null,
  existingDescription = "",
}) {
  const recent = await recentFingerprints(shop, { excludeProductId: productId });

  const assess = (content) =>
    assessContent({
      description: content?.description ?? "",
      metaTitle: content?.metaTitle ?? "",
      metaDescription: content?.metaDescription ?? "",
      faq: content?.faq ?? "",
      product,
      shopDomain,
      locale,
      recent,
      score: typeof scoreOf === "function" ? scoreOf(content) : null,
      // Group 4.5 — the merchant's own copy, so the gate can see what a
      // rewrite took away rather than only what it added.
      existingDescription,
    });

  let content = generated;
  let assessment = assess(content);
  let regenerated = false;

  if (!assessment.pass && typeof regenerate === "function") {
    logger.info(
      { shop, productId, reasons: assessment.reasons, event: "quality_gate_retry" },
      "Generated content failed the quality gate - regenerating once",
    );
    try {
      const second = await regenerate();
      if (second?.description) {
        regenerated = true;
        const secondAssessment = assess(second);
        // Keep the better of the two. A retry that is worse than the original
        // is not an improvement, and the merchant already paid for the first.
        if (secondAssessment.pass || !assessment.pass) {
          content = second;
          assessment = secondAssessment;
        }
      }
    } catch (err) {
      logger.warn({ shop, productId, err: err?.message }, "quality-gate regeneration failed (non-fatal)");
    }
  }

  // A note now exists for a passing draft that carries a WARN or a
  // differentiation finding, which is what makes the band visible to the
  // merchant AND what stops autopilot publishing it.
  const note = describeAssessment(assessment);

  // Group 5.4, stated rather than implied by a truthy string. Autopilot is the
  // only path where nobody is reading, and the only one where near-duplicate
  // content reaches a live storefront unseen.
  const withholdFromAutopilot =
    !assessment.pass ||
    !!assessment.warnOnly ||
    assessment.differentiationOk === false ||
    (assessment.droppedClaims?.length ?? 0) > 0;

  if (note) {
    logger.info(
      {
        shop,
        productId,
        note,
        regenerated,
        duplicateOf: assessment.duplicateOf,
        duplicateDistance: assessment.duplicateDistance,
        verdict: assessment.duplicateVerdict,
        familySiblingsSkipped: assessment.familySiblingsSkipped,
        withholdFromAutopilot,
        event: "quality_gate_flagged",
      },
      "Saved as a draft that needs a look",
    );
  }

  return { content, assessment, regenerated, note, withholdFromAutopilot };
}

/** The fingerprint to store alongside a saved description. Pure passthrough. */
export const fingerprintFor = (description, product) => simhash(description, product);
