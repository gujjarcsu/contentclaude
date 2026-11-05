/**
 * Redesign (Nov 2026) — THE SHARED PIECES, RENDERED.
 *
 * ScoreRing, IssueList, StatStrip and SetupGuide are the four components the
 * rebuilt screens are made of. A source check cannot tell whether the ring
 * draws a red dot for a store that was never scored (it did: Number(null) is
 * 0), so these render each piece through Polaris and read the markup.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import { ScoreRing } from "../../app/components/ScoreRing.jsx";
import { IssueList } from "../../app/components/IssueList.jsx";
import { StatStrip } from "../../app/components/StatStrip.jsx";
import { SetupGuide } from "../../app/components/SetupGuide.jsx";

const render = (el) => renderToStaticMarkup(<AppProvider i18n={{}}>{el}</AppProvider>);

describe("ScoreRing", () => {
  it("not scored: a dash, no arc, and an accessible name that says so", () => {
    for (const value of [null, undefined, ""]) {
      const html = render(<ScoreRing value={value} label="Search readiness" />);
      expect(html).toContain("–");
      expect(html).not.toMatch(/>0</);
      expect((html.match(/<circle/g) ?? []).length).toBe(1); // the track only
      expect(html).toContain('aria-label="Search readiness: not scored yet"');
    }
  });

  it("zero draws no arc (a zero-length round cap is a dot that reads as a score)", () => {
    const html = render(<ScoreRing value={0} label="Search readiness" />);
    expect(html).toMatch(/>0</);
    expect((html.match(/<circle/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-label="Search readiness: 0 out of 100"');
  });

  it("a score draws the arc in the band's Polaris token and names the number", () => {
    const html = render(<ScoreRing value={57} label="Search readiness" caption="across 30 products sampled" />);
    expect((html.match(/<circle/g) ?? []).length).toBe(2);
    expect(html).toContain("--p-color-bg-fill-caution");
    expect(html).toContain('aria-label="Search readiness: 57 out of 100"');
    expect(html).toContain("across 30 products sampled");
    expect(render(<ScoreRing value={84} />)).toContain("--p-color-bg-fill-success");
    expect(render(<ScoreRing value={20} />)).toContain("--p-color-bg-fill-critical");
    expect(render(<ScoreRing value={140} />)).toContain(">100<"); // clamped
  });
});

describe("IssueList", () => {
  const rows = [
    { id: "a", severity: "critical", title: "5 products have no description", detail: "On Starter and above.", action: { content: "See plans", onAction: () => {} } },
    { id: "b", severity: "warning", title: "4,384 products have no barcode", action: { content: "Tell us", onAction: () => {} } },
    { id: "c", severity: "passed", title: "Titles are the right length" },
  ];
  it("severity is a word, not only a colour; a row with nothing to do has no button", () => {
    const html = render(<IssueList items={rows} />);
    expect(html).toContain("Critical");
    expect(html).toContain("Warning");
    expect(html).toContain("Passed");
    expect((html.match(/<button/g) ?? []).length).toBe(2);
    expect(html).toContain("On Starter and above.");
    expect(html).not.toContain("disabled");
  });
  it("empty: the caller's sentence, or the default", () => {
    expect(render(<IssueList items={[]} emptyText="Add products to your store." />)).toContain("Add products to your store.");
    expect(render(<IssueList items={[]} />)).toContain("Nothing to fix right now.");
  });
});

describe("StatStrip", () => {
  it("prints the caller's formatted values, a dash for a count we do not have, and links a cell that has a url", () => {
    const html = render(
      <StatStrip
        items={[
          { id: "ready", label: "Ready to review", value: "2", hint: "Waiting for you", url: "/app/review" },
          { id: "cat", label: "In your catalogue", value: null, hint: "We could not read this from Shopify just now" },
        ]}
      />,
    );
    expect(html).toContain(">2<");
    expect(html).toContain("–");
    expect(html).toContain('href="/app/review"');
    expect(html).not.toContain("Polaris-Icon"); // no icon-in-a-circle tiles
  });
  it("renders nothing for no cells", () => {
    expect(renderToStaticMarkup(<StatStrip items={[]} />)).toBe("");
  });
});

describe("SetupGuide", () => {
  const steps = [
    { id: "scan", title: "Score your catalogue", done: true },
    { id: "voice", title: "Set your brand voice", description: "Tell us how you sound.", done: false, action: { content: "Set it up", onAction: () => {} } },
    { id: "review", title: "Review your first drafts", done: false },
  ];
  it("counts what is done, opens the first unfinished step, and offers Dismiss only when every step is done", () => {
    const html = render(<SetupGuide steps={steps} onDismiss={() => {}} />);
    expect(html).toContain("1 of 3 done");
    expect(html).toContain("Tell us how you sound.");
    expect(html).toContain("Set it up");
    expect(html).not.toContain("Dismiss");
    const done = render(<SetupGuide steps={steps.map((s) => ({ ...s, done: true }))} onDismiss={() => {}} />);
    expect(done).toContain("Setup complete");
    expect(done).toContain("Dismiss");
  });
});
