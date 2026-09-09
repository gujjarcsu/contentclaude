/**
 * Phase 2 item 2.6 — "Publish without review", read from ONE place.
 *
 * Auto-publish used to be a per-run form field, exposed as a checkbox in five
 * different places: the product page, the Products bulk panel, the Generate All
 * modal, and twice on Optimize. The bulk panel submitted with no confirmation
 * at all, and a bug on the product page skipped the confirm on five of its
 * seven generate paths — so the small grey "Regenerate" link beside a
 * description could overwrite the live storefront with no dialog.
 *
 * The App Store listing tells merchants that nothing goes live until they
 * approve it. That has to be literally true unless they deliberately turned it
 * off, and a promise that depends on which of five checkboxes was last ticked
 * is not a promise.
 *
 * So no action reads `autoPublish` from a form any more. Every generate path
 * asks here, and this asks the merchant's setting.
 */
import prisma from "../db.server.js";

/**
 * Has this shop chosen to publish without reviewing first?
 *
 * Defaults to FALSE for any shop with no BrandVoice row and on any error.
 * Failing closed is the only safe direction: the cost of wrongly returning
 * false is that a merchant reviews content they would have auto-published; the
 * cost of wrongly returning true is content on a live storefront that nobody
 * approved.
 *
 * @param {string} shop
 * @returns {Promise<boolean>}
 */
export async function publishesWithoutReview(shop) {
  try {
    const bv = await prisma.brandVoice.findUnique({
      where: { shop },
      select: { publishWithoutReview: true },
    });
    return bv?.publishWithoutReview === true;
  } catch {
    return false;
  }
}
