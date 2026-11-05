/**
 * Redesign v2 — Collections and Optimize use the category's pieces, keep one
 * notice at most, state what a run costs before it runs, and say only facts in
 * their title rows. Source-level: both screens render inside modals or after
 * fetches that a static render does not reach.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");

describe("Collections, redesign v2", () => {
  const src = read("app/routes/app.collections.jsx");

  it("writes with the brand AI button and measures drafted fields with character bars", () => {
    expect(src).toMatch(/<AiButton[\s\S]{0,200}handleGenerate\(collection\)/);
    expect((src.match(/<CharBar /g) ?? []).length).toBe(2);
    expect(src).not.toMatch(/helpText=\{t\("\{length\}\/(60|155)"/);
  });

  it("shows at most one notice, chained by priority, and a publish is a toast", () => {
    expect(src).toMatch(/fetcherData\?\.error \? \([\s\S]*?\) : catalogError \? \([\s\S]*?\) : truncated \? \(/);
    expect(src).not.toContain('title={t("Published!")}');
  });

  it("its toasts are translated", () => {
    expect(src).toContain('toast.show(t("Collection content published")');
    expect(src).toContain('toast.show(t("Collection voice saved")');
    expect(src).not.toMatch(/toast\.show\("Collection/);
  });

  it("every metric card counts the collections listed and says so", () => {
    expect((src.match(/t\("of the \{n\} listed"/g) ?? []).length).toBe(3);
    expect(src).toContain("<ProductThumb url={collection.imageUrl}");
  });
});

describe("Optimize, redesign v2", () => {
  const src = read("app/routes/app.optimize.jsx");

  it("the title row states facts, not how to use the screen", () => {
    expect(src).not.toContain("Generate AI content for products missing a description");
    expect(src).toContain("not yet optimized · {remaining} credits left this month");
  });

  it("the run states what it costs beside the button that spends it, and why it cannot run when nothing is chosen", () => {
    expect(src).toContain("Uses up to {n, plural, one {# credit} other {# credits}}, one per product");
    expect(src).toContain("Choose at least one kind of content.");
    expect(src).toMatch(/<AiButton solid size="large" onClick=\{handleOptimize\}/);
  });

  it("the steps follow the merchant's own publish setting", () => {
    expect(src).toMatch(/const steps = publishWithoutReview\s*\?/);
    expect(src).toContain("Published straight to your store");
    expect(src).toContain("Saved as drafts");
  });

  it("the plan name is translated", () => {
    expect(src).toContain('free: t("Free")');
    expect(src).not.toContain('free: "Free"');
  });
});
