/**
 * Redesign v2 — Home, the first run, the setup guide and the job indicator.
 *
 * The rendering checks prove the new pieces carry their meaning in words
 * (chips, labels, counts); the source checks pin the honesty rules the new
 * layout must keep: counts come from every finding the walk made, the Passed
 * tab names only checks that really exist, and the job indicator polls exactly
 * as before.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { ProductIcon } from "@shopify/polaris-icons";
import { IssueList } from "../../app/components/IssueList.jsx";
import { SetupGuide } from "../../app/components/SetupGuide.jsx";
import { StatStrip } from "../../app/components/StatStrip.jsx";
import { IlluScore } from "../../app/components/Illustrations.jsx";
import { BLOCKER_GROUPS } from "../../app/utils/firstRun.js";

const html = (node) => renderToStaticMarkup(<AppProvider i18n={en}>{node}</AppProvider>);
const src = (f) => readFileSync(f, "utf8");

describe("IssueList rows carry what they are about", () => {
  it("a row with a tag shows its SEO / GEO / Both chip before the sentence", () => {
    const out = html(<IssueList items={[{ id: "a", severity: "critical", title: "5 products have no description", tag: "geo" }, { id: "b", severity: "warning", title: "Pages cannot be indexed", tag: "seo" }]} />);
    expect(out).toContain('class="nv-chip nv-chip--geo">GEO<');
    expect(out).toContain('class="nv-chip nv-chip--seo">SEO<');
    expect(out.indexOf("GEO<")).toBeLessThan(out.indexOf("5 products have no description"));
  });
  it("a row without a tag renders no chip", () => {
    expect(html(<IssueList items={[{ id: "a", severity: "info", title: "Something changed" }]} />)).not.toContain("nv-chip");
  });
});

describe("Get started checklist", () => {
  const steps = [
    { id: "a", title: "Scan", done: true },
    { id: "b", title: "Voice", description: "Tell us how you sound.", done: false, action: { content: "Open settings" }, illustration: <IlluScore /> },
    { id: "c", title: "Review", done: false },
  ];
  it("shows the n/m chip, a labelled progress bar, and the open step with its dark button and drawing", () => {
    const out = html(<SetupGuide steps={steps} />);
    expect(out).toContain("Get started checklist");
    expect(out).toContain("1/3 done");
    expect(out).toContain('aria-labelledby="setup-guide-title"');
    expect(out).toContain("Polaris-Button--variantPrimary");
    expect(out).toContain('class="nv-illu"');
    expect(out).toContain('aria-expanded="true"');
  });
});

describe("StatStrip", () => {
  it("draws an icon tile only for a cell that asks for one", () => {
    expect(html(<StatStrip items={[{ id: "x", label: "Published", value: "3", icon: ProductIcon, tone: "success" }]} />)).toContain("nv-tile--success");
    expect(html(<StatStrip items={[{ id: "x", label: "Published", value: "3" }]} />)).not.toContain("nv-tile");
  });
});

describe("Home — counts and tabs come from every finding", () => {
  const home = src("app/routes/app._index.jsx");
  it("the tabs' counts are the lengths of the groups they show", () => {
    expect(home).toMatch(/badge: String\(groups\.critical\.length\)/);
    expect(home).toMatch(/badge: String\(groups\.warning\.length\)/);
    expect(home).toMatch(/badge: String\(groups\.passed\.length\)/);
    expect(home).toMatch(/fixFirstRows\(\{ blockers: allBlockers \?\? blockers/);
  });
  it("the Passed tab names exactly the checks the walk runs — no invented check", () => {
    const block = home.slice(home.indexOf("const PASSED_CHECK = {"), home.indexOf("};", home.indexOf("const PASSED_CHECK = {")));
    const keys = [...block.matchAll(/"(openai·[^"]+)"/g)].map((m) => m[1]).sort();
    expect(keys).toEqual(BLOCKER_GROUPS.map((g) => g.key).sort());
  });
  it("the catalogue watch's lines keep their order and their wording (built by the same helpers)", () => {
    expect(home).toMatch(/homeAttentionLines\(attention, t\)\.forEach/);
    expect(home).toMatch(/gscLine\(attention\?\.gsc, t\)/);
    expect(home).toMatch(/indexabilityLine\(attention\?\.indexability, t\)/);
  });
  it("the metric cards keep the strip's scopes and its dash for a missing count", () => {
    expect(home).toMatch(/<MetricCard[\s\S]{0,200}scope=\{s\.hint\}/);
    expect(home).toMatch(/const num = \(v, exact = true\) => \(v === null \|\| v === undefined/);
  });
});

describe("First run — the result screen", () => {
  const start = src("app/components/StartState.jsx");
  it("the headline and the severity cards count every finding, and Good is checks no product fails", () => {
    expect(start).toMatch(/const all = Array\.isArray\(start\.allBlockers\)/);
    expect(start).toMatch(/severityCounts\(all\)/);
    expect(start).toMatch(/We found \{n, plural, one \{# issue\} other \{# issues\}\} in your catalog/);
    expect(start).toMatch(/<SeverityCards critical=\{criticalCount\} warning=\{warningCount\} good=\{goodCount\}/);
  });
  it("the three severity cards always add up to the total the caption states", async () => {
    // Found on a fresh install of the dev store: a password-protected storefront
    // was counted Critical but was not one of the checks in the total, so the
    // cards read 1 + 2 + 7 = 10 under "Out of 9 checks".
    const { severityCounts, FIRST_RUN_CHECKS } = await import("../../app/components/StartState.jsx");
    const { PASSWORD_BLOCKER } = await import("../../app/utils/firstRun.js");
    const degrading = FIRST_RUN_CHECKS.filter((g) => g.grade === "degrading").slice(0, 2);
    const cases = [[], [PASSWORD_BLOCKER], [PASSWORD_BLOCKER, ...degrading], [...degrading], [...FIRST_RUN_CHECKS]];
    for (const all of cases) {
      const c = severityCounts(all.map((g) => ({ key: g.key, grade: g.grade })));
      expect(c.critical + c.warning + c.good).toBe(FIRST_RUN_CHECKS.length);
    }
    expect(severityCounts([{ key: PASSWORD_BLOCKER.key, grade: "blocking" }]).critical).toBe(1);
  });

  it("goal and scan sit in the stepped onboarding card", () => {
    expect(start).toMatch(/<StepDots total=\{3\} current=\{step\} \/>/);
    expect(start).toMatch(/<ChoiceCard key=\{o\.id\}/);
    expect(start).toMatch(/className="nv-stage"/);
  });
  it("Home passes every finding to the first run as well as the top three", () => {
    expect(src("app/routes/app._index.jsx")).toMatch(/blockers,\s*\/\/ Every finding, for the result screen's severity cards and its headline count\.\s*allBlockers,/);
  });
});

describe("Background job indicator", () => {
  const app = src("app/routes/app.jsx");
  it("is one small 'n running' control with a popover, not a banner", () => {
    expect(app).toMatch(/\{n\} running/);
    expect(app).toMatch(/<Popover/);
    expect(app).not.toMatch(/<Banner/);
  });
  it("polls exactly as before: only while a job runs, stopping after two empty responses", () => {
    expect(app).toMatch(/if \(idleStreakRef\.current >= 2\) return;/);
    expect(app).toMatch(/fetcher\.load\("\/api\/jobs-status"\)/);
  });
  it("keeps the six-item nav", () => {
    expect((app.match(/<s-link href=/g) ?? []).length).toBe(6);
  });
});
