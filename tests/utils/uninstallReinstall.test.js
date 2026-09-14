/**
 * P6.2 — what a merchant keeps, loses and gets back across uninstall → reinstall.
 *
 * The brief asked for this proved and written down for four things: their data,
 * their credits, their trial, and their BYO key. Tracing it found two things
 * that survived and should not have — neither of which any test was looking for:
 *
 *   1. `ProductScore` was never in the deletion list, so a per-product
 *      scoreboard outlived an erasure request.
 *   2. `Shop.aiKeyCiphertext` was never cleared by `redactShopRecord`, so a
 *      merchant's ENCRYPTED ANTHROPIC CREDENTIAL outlived one. The Shop row is
 *      exempt from deletion for a good reason — it stops uninstall/reinstall
 *      minting a fresh trial — but that exemption was written when the row held
 *      counters and timestamps. It does not extend to a credential.
 *
 * The contract below is the deliberate part, pinned so that a future change has
 * to argue with it rather than quietly break it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { GDPR_SHOP_MODELS, GDPR_EXEMPT_MODELS } from "../../app/utils/gdpr.server.js";

const INSTALL_TRACKING = readFileSync("app/utils/installTracking.server.js", "utf8");
const PLANS = readFileSync("app/utils/plans.server.js", "utf8");
const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

describe("THEIR DATA — deleted", () => {
  it("every content table is on the deletion list", () => {
    for (const m of ["generatedContent", "contentVersion", "blogPost", "collectionVoice", "brandVoice"]) {
      expect(GDPR_SHOP_MODELS, `${m} survives redaction`).toContain(m);
    }
  });

  it("the per-product scoreboard is too — it was not, until P6.2", () => {
    expect(GDPR_SHOP_MODELS).toContain("productScore");
  });

  it("sessions go, so the access token does not linger", () => {
    expect(GDPR_SHOP_MODELS).toContain("session");
  });
});

describe("THEIR CREDITS — the allowance is monthly, not per-install", () => {
  it("usage is captured BEFORE the delete, or the count is lost with it", () => {
    // Ordering is the whole mechanism: UsageRecord is deleted on uninstall, so
    // the month's count has to be copied onto the surviving Shop row first.
    const src = code(readFileSync("app/utils/webhookWork.server.js", "utf8"));
    const fn = src.match(/export async function finishUninstall[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fn).toMatch(/captureUsageCarryover/);
    const captureAt = fn.indexOf("captureUsageCarryover");
    const deleteAt = fn.indexOf("deleteShopData");
    // Either the delete is elsewhere, or the capture comes first.
    expect(deleteAt === -1 || captureAt < deleteAt).toBe(true);
  });

  it("restore only applies within the SAME calendar month", () => {
    // A new month is a genuinely fresh allowance — restoring across a month
    // boundary would punish a merchant for reinstalling in March.
    const fn = PLANS.match(/export async function restoreUsageCarryover[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fn).toMatch(/usageMonth/);
    expect(fn).toMatch(/toISOString\(\)\.slice\(0, 7\)/);
  });

  it("the carryover columns live on Shop, which survives", () => {
    const shopModel = SCHEMA.slice(SCHEMA.indexOf("model Shop {"), SCHEMA.indexOf("model ProductScore"));
    expect(shopModel).toMatch(/usageMonth/);
    expect(shopModel).toMatch(/usageCarryover/);
  });
});

describe("THEIR TRIAL — once per shop, for the life of the shop", () => {
  it("trialUsedAt and trialCreditsUsed are on Shop, not Plan", () => {
    // Plan is DELETED on uninstall and Shop is not. On Plan, a merchant could
    // uninstall and reinstall for a second 14-day trial and another 250 credits,
    // indefinitely.
    const shopModel = SCHEMA.slice(SCHEMA.indexOf("model Shop {"), SCHEMA.indexOf("model ProductScore"));
    expect(shopModel).toMatch(/trialUsedAt/);
    expect(shopModel).toMatch(/trialCreditsUsed/);

    const planModel = SCHEMA.slice(SCHEMA.indexOf("model Plan {"), SCHEMA.indexOf("model UsageRecord"));
    expect(planModel).not.toMatch(/trialUsedAt/);
    expect(planModel).not.toMatch(/trialCreditsUsed/);
  });

  it("the annual 2x boost is on Shop for the same reason", () => {
    const shopModel = SCHEMA.slice(SCHEMA.indexOf("model Shop {"), SCHEMA.indexOf("model ProductScore"));
    expect(shopModel).toMatch(/annualBoostMonth/);
  });

  it("redaction does NOT clear the trial marker — that is the point of the exemption", () => {
    // Erasure anonymises the shop domain. It must not hand back a fresh trial,
    // or "erase me" becomes a free-trial reset button.
    const fn = code(INSTALL_TRACKING).match(/export async function redactShopRecord[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fn).not.toMatch(/trialUsedAt/);
    expect(fn).not.toMatch(/trialCreditsUsed/);
    expect(GDPR_EXEMPT_MODELS.Shop).toMatch(/trial/i);
  });
});

describe("THEIR BYO KEY — kept across a reinstall, destroyed by an erasure", () => {
  it("the key columns are on Shop, so a reinstall does not force a re-paste", () => {
    // Deliberate: uninstalling and reinstalling is something merchants do while
    // troubleshooting, and making them find their Anthropic key again is a
    // needless failure.
    const shopModel = SCHEMA.slice(SCHEMA.indexOf("model Shop {"), SCHEMA.indexOf("model ProductScore"));
    expect(shopModel).toMatch(/aiKeyCiphertext/);
  });

  it("REDACTION CLEARS IT — it did not, until P6.2", () => {
    // The Shop row survives erasure by design. That exemption was written when
    // the row held counters and timestamps, and it does not extend to a
    // merchant's Anthropic credential. Encrypted is mitigation, not a reason to
    // retain something after being asked to erase it.
    const fn = code(INSTALL_TRACKING).match(/export async function redactShopRecord[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fn, "redactShopRecord does not clear the ciphertext").toMatch(/aiKeyCiphertext: null/);
    expect(fn).toMatch(/aiKeyIv: null/);
    expect(fn).toMatch(/aiKeyTag: null/);
    // And the flags, or a cleared key would read as "saved but failing".
    expect(fn).toMatch(/aiKeyValidatedAt: null/);
    expect(fn).toMatch(/aiKeyFailedAt: null/);
  });

  it("a plain UNINSTALL does not clear it, which is the difference that matters", () => {
    // Uninstall: the merchant may come back. Erasure: they asked us to forget.
    // The two must not be conflated in either direction.
    expect(GDPR_SHOP_MODELS).not.toContain("shop");
  });
});

describe("the privacy policy describes this, in words a merchant can check", () => {
  it("says what survives and why", async () => {
    const { PRIVACY_SECTIONS } = await import("../../app/utils/legal.js");
    const retention = PRIVACY_SECTIONS.find((s) => /how long/i.test(s.h)).p.join(" ");
    expect(retention).toMatch(/48 hours/);
    expect(retention).toMatch(/free trial/i);
    expect(retention).toMatch(/no content/i);
  });
});
