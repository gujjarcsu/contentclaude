/**
 * P6.2 — the deletion list cannot silently fall behind the schema.
 *
 * `GDPR_SHOP_MODELS` is what `shop/redact` actually deletes, and it was
 * assembled by hand. Nothing failed when someone forgot an entry, so two
 * shop-scoped tables had never been on it:
 *
 *   ProductScore    a per-product SEO scoreboard, kept for a merchant who had
 *                   uninstalled and asked Shopify to erase them
 *   SupportRequest  worse, and mine: it holds the EMAIL ADDRESS a merchant
 *                   typed to be replied to. I added the table in the same phase
 *                   as this test and did not add it to the list — which is
 *                   exactly how ProductScore got missed, by someone else,
 *                   earlier.
 *
 * That is the argument for this file. A hand-maintained list that governs
 * DELETION is the worst possible thing to leave unguarded: the failure is
 * invisible, it accumulates, and it is only discovered by a regulator or a
 * merchant asking a pointed question.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GDPR_SHOP_MODELS, GDPR_EXEMPT_MODELS } from "../../app/utils/gdpr.server.js";

const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

/** Every model that has a `shop String` column — i.e. that holds shop-scoped rows. */
function shopScopedModels() {
  const out = [];
  const re = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(SCHEMA)) !== null) {
    const [, name, body] = m;
    if (/^\s+shop\s+String/m.test(body)) out.push(name);
  }
  return out;
}

/** Prisma's client accessor for a model name: `ProductScore` -> `productScore`. */
const accessor = (name) => name[0].toLowerCase() + name.slice(1);

describe("every shop-scoped table is deleted on redaction, or exempted with a reason", () => {
  const models = shopScopedModels();

  it("finds the shop-scoped models at all (guards the guard)", () => {
    // If the regex stops matching, every assertion below passes vacuously and
    // this file becomes decorative. That is false green #1 in this file's own
    // shape, so the count is asserted first.
    expect(models.length).toBeGreaterThan(10);
    expect(models).toContain("GeneratedContent");
    expect(models).toContain("Shop");
  });

  it.each(shopScopedModels())("%s is deleted or exempted", (name) => {
    const deleted = GDPR_SHOP_MODELS.includes(accessor(name));
    const exempt = Object.prototype.hasOwnProperty.call(GDPR_EXEMPT_MODELS, name);
    expect(
      deleted || exempt,
      `${name} holds shop-scoped rows and is neither in GDPR_SHOP_MODELS nor in GDPR_EXEMPT_MODELS. ` +
        `Add it to the deletion list, or exempt it and say why.`,
    ).toBe(true);
    // Never both — that would mean the reason and the behaviour disagree.
    expect(deleted && exempt, `${name} is both deleted and exempted`).toBe(false);
  });

  it("every exemption states a reason, not just a name", () => {
    for (const [name, reason] of Object.entries(GDPR_EXEMPT_MODELS)) {
      expect(typeof reason, `${name} exemption is not a string`).toBe("string");
      expect(reason.length, `${name} exemption has no real reason`).toBeGreaterThan(60);
    }
  });

  it("does not exempt a model that no longer exists", () => {
    const known = new Set(shopScopedModels());
    const ghosts = Object.keys(GDPR_EXEMPT_MODELS).filter((n) => !known.has(n));
    expect(ghosts, `exempted but not in the schema: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("the deletion list names only models that exist", () => {
    const known = new Set(shopScopedModels().map(accessor));
    const ghosts = GDPR_SHOP_MODELS.filter((a) => !known.has(a));
    expect(ghosts, `in the deletion list but not in the schema: ${ghosts.join(", ")}`).toEqual([]);
  });
});

describe("the two that were missing are now covered", () => {
  it("ProductScore is deleted — it was a per-product scoreboard surviving erasure", () => {
    expect(GDPR_SHOP_MODELS).toContain("productScore");
  });

  it("SupportRequest is deleted — it holds a merchant's email address", () => {
    // The one piece of personal data this app asks a merchant to type.
    expect(GDPR_SHOP_MODELS).toContain("supportRequest");
  });
});

describe("what survives, survives for a stated reason", () => {
  it("the Shop row is anonymised rather than deleted, and that is deliberate", () => {
    // Deleting it would let uninstall/reinstall mint a fresh free trial and a
    // fresh free-tier allowance on demand — Phase 0 item 10.
    expect(GDPR_EXEMPT_MODELS.Shop).toMatch(/anonymised/i);
    expect(GDPR_EXEMPT_MODELS.Shop).toMatch(/trial/i);
    expect(GDPR_SHOP_MODELS).not.toContain("shop");
  });

  it("the audit trail survives, and holds no customer contact details", () => {
    expect(GDPR_EXEMPT_MODELS.GDPRRequest).toMatch(/audit/i);
    // The handler's own claim. If it ever starts persisting the raw payload,
    // this exemption stops being defensible.
    const handler = readFileSync("app/routes/webhooks.customers.redact.jsx", "utf8");
    expect(handler).not.toMatch(/JSON\.stringify\(payload\)/);
    expect(handler).toMatch(/customer_id/);
  });

  it("logs are exempt on a retention argument, not on silence", () => {
    expect(GDPR_EXEMPT_MODELS.LogEvent).toMatch(/30 days/i);
  });
});

describe("the privacy policy describes the same behaviour the code performs", () => {
  it("says the Shop record survives and says why", async () => {
    const { PRIVACY_SECTIONS } = await import("../../app/utils/legal.js");
    const retention = PRIVACY_SECTIONS.find((s) => /how long/i.test(s.h)).p.join(" ");
    expect(retention).toMatch(/uninstall/i);
    expect(retention).toMatch(/reinstall/i);
    expect(retention).toMatch(/no content/i);
  });
});
