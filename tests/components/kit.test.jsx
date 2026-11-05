/**
 * The redesign v2 kit (app/components/Kit.jsx, Illustrations.jsx): every
 * piece renders, carries an accessible name where it conveys meaning, and
 * never prints a number it was not given.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { ProductIcon } from "@shopify/polaris-icons";
import { readFileSync } from "node:fs";
import { IconTile, StatusIcon, TagChip, CountChip, CharBar, charBand, StepDots, AiButton, ChoiceCard, SeverityCards, ScoreGauge, LockedPreview, MetricCard } from "../../app/components/Kit.jsx";
import { ScoreRing } from "../../app/components/ScoreRing.jsx";
import * as Illu from "../../app/components/Illustrations.jsx";

const html = (node) => renderToStaticMarkup(<AppProvider i18n={en}>{node}</AppProvider>);

describe("Kit", () => {
  it("an icon tile is decorative unless labelled", () => {
    expect(html(<IconTile icon={ProductIcon} />)).toContain('aria-hidden="true"');
    expect(html(<IconTile icon={ProductIcon} label="Products" />)).toContain('aria-label="Products"');
    expect(html(<IconTile icon={ProductIcon} tone="critical" size="lg" />)).toContain("nv-tile--critical");
  });

  it("status icons are named, not colour-only", () => {
    expect(html(<StatusIcon status="critical" />)).toContain(">Critical<");
    expect(html(<StatusIcon status="warning" />)).toContain(">Needs work<");
    expect(html(<StatusIcon status="good" />)).toContain(">Good<");
  });

  it("tag chips name the surface", () => {
    expect(html(<TagChip kind="seo" />)).toContain(">SEO<");
    expect(html(<TagChip kind="geo" />)).toContain(">GEO<");
    expect(html(<TagChip kind="both" />)).toContain(">Both<");
    expect(html(<CountChip n={3} tone="critical" />)).toContain("nv-chip--count-critical");
  });

  it("character bars band green inside the limit, amber when short or empty, red when over", () => {
    expect(charBand(45, 60, 30)).toBe("good");
    expect(charBand(10, 60, 30)).toBe("fair");
    expect(charBand(0, 60)).toBe("fair");
    expect(charBand(61, 60)).toBe("poor");
    const out = html(<CharBar count={61} max={60} id="t" />);
    expect(out).toContain("nv-charbar--poor");
    expect(out).toContain('aria-valuenow="61"');
    expect(out).toContain("61/60 characters");
  });

  it("step dots announce the step", () => {
    expect(html(<StepDots total={3} current={1} />)).toContain('aria-label="Step 2 of 3"');
  });

  it("the AI button is a real button with a sparkle, and says when it is busy", () => {
    const idle = html(<AiButton>AI optimize</AiButton>);
    expect(idle).toContain('<button type="button" class="nv-ai">');
    expect(idle).toContain("AI optimize");
    expect(html(<AiButton loading>AI optimize</AiButton>)).toContain('aria-busy="true"');
    expect(html(<AiButton solid size="large">Generate</AiButton>)).toContain("nv-ai--solid nv-ai--lg");
  });

  it("a choice card is a pressed-state button", () => {
    const out = html(<ChoiceCard icon={ProductIcon} title="Search" body="Google and Bing" selected />);
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain("Google and Bing");
  });

  it("severity cards print a dash for an unmeasured count, never a zero", () => {
    const out = html(<SeverityCards critical={2} warning={null} good={7} />);
    expect(out).toContain(">2<");
    expect(out).toContain(">–<");
    expect(out).toContain(">7<");
    expect(out).toContain("Needs work");
  });

  it("the gauge reads its value, and a dash when not scored", () => {
    expect(html(<ScoreGauge value={64} label="Search readiness" />)).toContain('aria-label="Search readiness: 64 out of 100"');
    expect(html(<ScoreGauge value={null} label="Search readiness" />)).toContain("not scored yet");
  });

  it("the score ring can sit on a tint of its band", () => {
    expect(html(<ScoreRing value={69} tint />)).toContain("var(--navaal-tint-caution)");
    expect(html(<ScoreRing value={69} />)).not.toContain("--navaal-tint");
  });

  it("a locked preview hides the preview from assistive tech and offers the plans", () => {
    const out = html(
      <LockedPreview title="Unlock" sentence="On Growth and above.">
        <button type="button">inside</button>
      </LockedPreview>,
    );
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain("See plans");
    expect(out).toContain("On Growth and above.");
  });

  it("a metric card prints a dash for a missing value", () => {
    expect(html(<MetricCard icon={ProductIcon} label="Published" value={null} />)).toContain(">–<");
  });

  it("every illustration is decorative SVG", () => {
    for (const [name, C] of Object.entries(Illu)) {
      const out = renderToStaticMarkup(<C />);
      expect(out, name).toContain('aria-hidden="true"');
      expect(out, name).toMatch(/^<svg class="nv-illu"/);
    }
  });

  it("brand.css defines the one brand token and root.jsx loads it", () => {
    expect(readFileSync("app/brand.css", "utf8")).toMatch(/--navaal-brand:\s*#[0-9a-f]{6}/i);
    expect(readFileSync("app/root.jsx", "utf8")).toMatch(/brand\.css\?url/);
  });
});
