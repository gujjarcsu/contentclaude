/**
 * Source guards for the growth release (brief items 3–5) — the rules a
 * reviewer reads in seconds:
 *   - the review ask never fires on page open, on the jobs page, or after an
 *     auto-publish the merchant did not press;
 *   - the dashboard is the first-run landing (no redirect to /app/welcome or /app/setup);
 *   - resource routes for background fetchers never redirect to a login form;
 *   - no countdown / urgency copy anywhere in routes or components;
 *   - quota-reached UI is amber, never critical;
 *   - the free reset date is always beside the upgrade CTA.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(f, "utf8");
const allSources = () => {
  const out = [];
  for (const dir of ["app/routes", "app/components"]) {
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
      }
    };
    walk(dir);
  }
  return out;
};

describe("review ask — structurally compliant", () => {
  it("jobs page never renders a review ask", () => {
    expect(read("app/routes/app.jobs.jsx")).not.toMatch(/ReviewRequest/);
  });
  it("product page does not ask after auto-publish; asks only from a server-issued attempt", () => {
    const src = read("app/routes/app.products_.$id.jsx");
    expect(src).not.toMatch(/autoPublished[^\n]*ReviewRequest|ReviewRequest[^\n]*autoPublished/);
    expect(src).toMatch(/ask=\{[^}]*reviewAsk/);
  });
  it("ReviewRequest cannot call without an attemptId and respects a hidden tab", () => {
    const src = read("app/components/ReviewRequest.jsx");
    expect(src).toContain("ask?.attemptId");
    expect(src).toContain("skipped-hidden");
    expect(src).not.toMatch(/reviewRequestedAt/);
  });
  it("review ask and upgrade-prompt callback routes never redirect to a login form", () => {
    for (const f of ["app/routes/app.review-request.jsx", "app/routes/app.upgrade-prompt.jsx", "app/routes/app.quick-start.jsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/auth\/login/);
    }
    expect(read("app/routes/app.review-request.jsx")).not.toMatch(/\bredirect\(/);
  });
});

describe("first-run landing", () => {
  it("dashboard no longer redirects brand-new shops to /app/welcome or /app/setup", () => {
    const src = read("app/routes/app._index.jsx");
    expect(src).not.toMatch(/redirect\(`\/app\/welcome/);
    expect(src).not.toMatch(/redirect\(`\/app\/setup/);
    expect(src).toMatch(/export function shouldRevalidate/);
  });
});

describe("no dark patterns", () => {
  it("no countdown / urgency copy in any route or component", () => {
    const bad = /countdown|ends in \d|hurry|only \d+ left today|offer ends|limited time/i;
    for (const f of allSources()) {
      expect(read(f), f).not.toMatch(bad);
    }
  });
  it("quota-reached banners are never critical", () => {
    for (const f of ["app/routes/app.products.jsx", "app/routes/app.optimize.jsx", "app/routes/app._index.jsx", "app/routes/app.seo-audit.jsx", "app/components/UpgradePrompt.jsx"]) {
      const src = read(f);
      // any Banner/Box that mentions quota or generations must not be critical
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (/quota|generations this month|Monthly quota/i.test(line)) {
          const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
          expect(window, `${f}:${i + 1}`).not.toMatch(/tone="critical"/);
        }
      });
    }
  });
  it("the reset date is rendered unconditionally beside the upgrade CTA", () => {
    expect(read("app/components/UpgradePrompt.jsx")).toContain("Or wait — your {planLabel} generations reset on {upsell.resetDate}.");
  });
});
