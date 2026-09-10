/**
 * Phase 2 item 2.6 — auto-publish in one place, and the confirm bypass.
 *
 * The App Store listing tells merchants that nothing goes live until they
 * approve it. That was not literally true.
 *
 * Auto-publish was a per-run form field with a checkbox in five places: the
 * product page, the Products bulk panel, the Generate All modal, and twice on
 * Optimize. The bulk panel submitted with no confirmation at all.
 *
 * And the product page's guard read:
 *
 *     if (autoPublish && !overrideTypes) { ...show the confirm... }
 *
 * `overrideTypes` is set by every per-section "Regenerate" link and by the Alt
 * Text tab. So five of the seven generate paths skipped the confirm — while
 * `doGenerate` still sent `autoPublish=true` and the server still published
 * straight to the live storefront. Clicking the small grey "Regenerate" beside
 * a description overwrote what shoppers see, with no dialog and no undo.
 *
 * The dead state proved it was never intended: `pendingGenerateTypes` was
 * initialised to null, the only write set it to null, and the modal called
 * `doGenerate(pendingGenerateTypes)` — always `doGenerate(null)`. The variable
 * existed to carry exactly the value that branch threw away.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");
const code = (f) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const GENERATE_SCREENS = [
  "app/routes/app.optimize.jsx",
  "app/routes/app.products.jsx",
  "app/routes/app.products_.$id.jsx",
];

describe("the setting is the only source of truth", () => {
  it("no action reads auto-publish from a submitted form", () => {
    // A form field is whatever the page last sent. The merchant's decision
    // lives in their settings, and the server has to ask there.
    for (const f of GENERATE_SCREENS) {
      const src = code(f);
      expect(src, `${f} reads autoPublish from the form`).not.toMatch(
        /formData\.get\(\s*["'](bulk_)?autoPublish["']\s*\)/,
      );
    }
  });

  it("every generate screen asks the shared helper instead", () => {
    for (const f of GENERATE_SCREENS) {
      expect(code(f), `${f} does not read the setting`).toMatch(/publishesWithoutReview\(/);
    }
  });

  it("no screen still sends the field", () => {
    for (const f of GENERATE_SCREENS) {
      const src = code(f);
      expect(src, `${f} still appends the field`).not.toMatch(
        /append\(\s*["'](bulk_)?autoPublish["']/,
      );
    }
  });

  it("no per-run auto-publish checkbox survives", () => {
    for (const f of GENERATE_SCREENS) {
      const src = code(f);
      expect(src, `${f} still offers auto-publish per run`).not.toMatch(
        /label="Auto-publish[^"]*"/,
      );
    }
  });

  it("the switch exists in Settings, and only there", () => {
    expect(code("app/routes/app.settings.jsx")).toMatch(/label="Publish without review"/);
    for (const f of GENERATE_SCREENS) {
      expect(code(f), `${f} offers the switch too`).not.toMatch(/label="Publish without review"/);
    }
  });
});

describe("the confirm can no longer be bypassed", () => {
  const src = code("app/routes/app.products_.$id.jsx");

  it("the guard no longer depends on which button was pressed", () => {
    // This is the bug, in one line. `&& !overrideTypes` let five callers past.
    expect(src).not.toMatch(/if\s*\(\s*publishWithoutReview\s*&&\s*!overrideTypes\s*\)/);
    expect(src).not.toMatch(/if\s*\(\s*autoPublish\s*&&\s*!overrideTypes\s*\)/);
    expect(src).toMatch(/if\s*\(\s*publishWithoutReview\s*\)\s*\{/);
  });

  it("the modal receives the types the caller asked for, not null", () => {
    // `setPendingGenerateTypes(null)` is what made the state dead and what made
    // a confirmed regenerate silently regenerate everything instead.
    expect(src).toMatch(/setPendingGenerateTypes\(overrideTypes\)/);
    expect(src).not.toMatch(/setPendingGenerateTypes\(null\)/);
  });

  it("every generate path goes through the guard", () => {
    // The five that bypassed it: four per-section Regenerate links via
    // handleRegenerateSection, and the Alt Text tab.
    expect(src).toMatch(/handleRegenerateSection\s*=\s*useCallback/);
    expect(src).toMatch(/handleGenerate\(types\)/);
    // The Alt Text tab calls handleGenerate directly with an override object.
    const altText = src.slice(src.indexOf("altText: true"));
    expect(altText.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/doGenerate\(\s*\{[^}]*altText:\s*true/);
  });
});

describe("turning review off asks first, and turning it on does not", () => {
  const src = code("app/routes/app.settings.jsx");

  it("enabling opens a confirm", () => {
    expect(src).toMatch(/if \(value\) setConfirmPublishWithoutReview\(true\)/);
  });

  it("disabling is immediate — the safe direction needs no ceremony", () => {
    expect(src).toMatch(/else setPublishWithoutReview\(false\)/);
  });

  it("the confirm is destructive-toned and says what actually changes", () => {
    expect(src).toMatch(/destructive: true/);
    expect(src).toMatch(/straight to your live storefront/);
    expect(src).toMatch(/replacing what/);
  });

  it("it also says the content is recoverable, because it is", () => {
    // Not reassurance for its own sake: previous versions are kept and a
    // merchant can restore per product. Omitting that makes the warning read
    // as more final than it is.
    expect(src).toMatch(/History tab/);
  });
});

describe("the setting itself", () => {
  it("is a real column with a safe default", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/publishWithoutReview\s+Boolean\s+@default\(false\)/);
  });

  it("ships as a real migration, in its OWN file", () => {
    // It was originally appended to 20260910_geo_note_dismissed, which had
    // already been applied. Prisma skips an applied migration by name, so the
    // statement never ran and every /app load returned 500 for eight hours.
    const sql = read("prisma/migrations/20260910010000_publish_without_review/migration.sql");
    expect(sql).toMatch(/ALTER TABLE "BrandVoice" ADD COLUMN IF NOT EXISTS "publishWithoutReview"/);
    expect(sql).toMatch(/NOT NULL DEFAULT false/);
    // And it is NOT back in the migration it broke.
    expect(read("prisma/migrations/20260910_geo_note_dismissed/migration.sql")).not.toMatch(
      /publishWithoutReview/,
    );
  });

  it("an existing shop does not inherit a per-run tick as a standing choice", () => {
    // Shops had been ticking a per-run box. That is not consent to publish
    // everything without review from now on, so the column defaults to false
    // and there is no backfill.
    const sql = read("prisma/migrations/20260910010000_publish_without_review/migration.sql");
    expect(sql).not.toMatch(/UPDATE "BrandVoice"/);
  });
});

describe("the helper fails closed", () => {
  const { prisma } = vi.hoisted(() => ({ prisma: { brandVoice: { findUnique: vi.fn() } } }));
  vi.mock("../../app/db.server.js", () => ({ default: prisma }));

  beforeEach(() => vi.clearAllMocks());

  it("returns true only when the shop actually set it", async () => {
    const { publishesWithoutReview } = await import("../../app/utils/publishSetting.server.js");
    prisma.brandVoice.findUnique.mockResolvedValue({ publishWithoutReview: true });
    await expect(publishesWithoutReview("s.myshopify.com")).resolves.toBe(true);
  });

  it("a shop with no settings row does not publish without review", async () => {
    const { publishesWithoutReview } = await import("../../app/utils/publishSetting.server.js");
    prisma.brandVoice.findUnique.mockResolvedValue(null);
    await expect(publishesWithoutReview("s.myshopify.com")).resolves.toBe(false);
  });

  it("a database error does not publish without review", async () => {
    // The asymmetry is the whole point. Wrongly returning false costs a
    // merchant a review step they did not want. Wrongly returning true puts
    // content on a live storefront that nobody approved.
    const { publishesWithoutReview } = await import("../../app/utils/publishSetting.server.js");
    prisma.brandVoice.findUnique.mockRejectedValue(new Error("connection lost"));
    await expect(publishesWithoutReview("s.myshopify.com")).resolves.toBe(false);
  });

  it("a non-boolean value is not treated as truthy", async () => {
    const { publishesWithoutReview } = await import("../../app/utils/publishSetting.server.js");
    prisma.brandVoice.findUnique.mockResolvedValue({ publishWithoutReview: "yes" });
    await expect(publishesWithoutReview("s.myshopify.com")).resolves.toBe(false);
  });
});
