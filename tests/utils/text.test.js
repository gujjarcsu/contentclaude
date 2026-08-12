/**
 * P1-10 regression — HTML entities in plain-text fields must be decoded.
 * Live repro: Review & Publish showed "Premium Skateboards &amp; Gear" raw.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodeHtmlEntities } from "../../app/utils/text.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("P1-10: decodeHtmlEntities", () => {
  it("decodes the live-reproduced case", () => {
    expect(decodeHtmlEntities("Premium Skateboards &amp; Gear")).toBe("Premium Skateboards & Gear");
  });

  it("decodes named, numeric, and hex entities", () => {
    expect(decodeHtmlEntities("A &lt;tag&gt; &quot;quoted&quot; &apos;text&apos;&nbsp;end")).toBe("A <tag> \"quoted\" 'text' end");
    expect(decodeHtmlEntities("&#65;&#x42;")).toBe("AB");
  });

  it("fully resolves double-escapes", () => {
    expect(decodeHtmlEntities("Kids &amp;amp; Teens")).toBe("Kids & Teens");
  });

  it("leaves unknown entities and plain text untouched", () => {
    expect(decodeHtmlEntities("no entities here")).toBe("no entities here");
    expect(decodeHtmlEntities("R&D &unknownentity; stays")).toBe("R&D &unknownentity; stays");
    expect(decodeHtmlEntities(null)).toBe(null);
  });

  it("is applied to AI-parsed plain-text fields at the source (source guard)", () => {
    const aiSrc = readFileSync(join(repoRoot, "app/utils/ai.server.js"), "utf8");
    expect(aiSrc).toMatch(/metaTitle:\s*decodeHtmlEntities\(/);
    expect(aiSrc).toMatch(/metaDescription:\s*decodeHtmlEntities\(/);
  });
});

describe("P1-3/P1-4: settings forms submit metaDescription (source guard)", () => {
  it("autopilot and template forms both carry the metaDescription field", () => {
    const src = readFileSync(join(repoRoot, "app/routes/app.settings.jsx"), "utf8");
    expect(src).toContain('name="ap_metaDescription"');
    expect(src).toContain('name="tpl_metaDescription"');
  });
});
