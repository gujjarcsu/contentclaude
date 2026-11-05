/**
 * Redesign v2 — Settings in tabs and Plans with plan tiles (fork F).
 *
 * Settings: the tabs must never cost a saved value. The brand-voice form
 * posts every field in one submit, so a hidden tab's fields must still be in
 * the rendered form. Plans: no unmeasured "Most popular"; a plan is set apart
 * only for a reason measured on this shop, and the saving chip is computed.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("../../app/db.server.js", () => ({ default: {} }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate: { admin: vi.fn() }, apiVersion: "2026-04" }));
vi.mock("../../app/utils/upgradePrompts.server.js", () => ({ markPromptArrived: vi.fn(), markSubscribeRequested: vi.fn() }));
vi.mock("../../app/utils/quotaSurfaces.server.js", () => ({ recordArrivedFrom: vi.fn() }));
vi.mock("../../app/utils/billingTest.server.js", () => ({ resolveBillingTest: vi.fn() }));
vi.mock("../../app/utils/activeSubscriptions.server.js", () => ({ getActiveSubscriptions: vi.fn() }));
vi.mock("../../app/utils/plans.server.js", () => ({ getOrCreatePlan: vi.fn(), getMonthlyUsageCount: vi.fn(), syncBillingToPlan: vi.fn(), hasUsedTrial: vi.fn() }));
vi.mock("../../app/utils/signedUrl.server.js", () => ({ signShopCallback: vi.fn() }));

import { createMemoryRouter, RouterProvider } from "react-router";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import SettingsPage from "../../app/routes/app.settings.jsx";
import PlansPage from "../../app/routes/app.plans.jsx";
import { BILLING_PLANS } from "../../app/utils/billing-plans.js";
import { annualSavingPct } from "../../app/utils/billing-config.js";

function render(Component, data, path) {
  const router = createMemoryRouter([{ path, element: <Component />, loader: () => data, hydrateFallbackElement: null }], {
    initialEntries: [path],
    hydrationData: { loaderData: { 0: data } },
  });
  return renderToStaticMarkup(
    <AppProvider i18n={en}>
      <RouterProvider router={router} />
    </AppProvider>,
  );
}

const settingsData = (over = {}) => ({
  planName: "free",
  entitlements: { autopilot: false, contentTemplates: false, bulkJobs: false, blogPosts: false },
  aiKey: { configured: false, saved: false, validatedAt: null, failing: false },
  aiKeyAvailable: false,
  bing: { saved: false },
  languageMismatch: null,
  uiLocale: "",
  brandVoice: {
    storeName: "Northline Supply",
    brandTone: "friendly",
    targetAudience: "Home cooks",
    keyDifferentiators: "Small batches",
    avoidPhrases: "No hype",
    sampleContent: "Sample copy",
    additionalNotes: "Notes",
    targetKeywords: "cast iron, skillet",
    language: "en",
    autopilotEnabled: false,
    autopilotAutoPublish: false,
    publishWithoutReview: false,
    includeDraftProducts: false,
    autopilotContentTypes: "description,metaTitle,metaDescription",
  },
  templates: [],
  ...over,
});

describe("Settings v2 — four tabs, no field ever unmounts", () => {
  const html = render(SettingsPage, settingsData(), "/app/settings");
  const form = html.slice(html.indexOf('value="saveBrandVoice"'));
  const voiceForm = form.slice(0, form.indexOf("</form>"));

  it("shows the four tabs", () => {
    for (const label of ["General", "Brand voice", "Automation", "Plan"]) expect(html).toContain(`>${label}<`);
  });

  it("every brand-voice field is in the ONE form, including the ones on hidden tabs", () => {
    for (const name of ["storeName", "language", "uiLocale", "targetAudience", "targetKeywords", "keyDifferentiators", "avoidPhrases", "sampleContent", "additionalNotes", "brandTone", "publishWithoutReview", "includeDraftProducts", "autopilotEnabled"]) {
      expect(voiceForm, `${name} must post with the brand-voice save`).toContain(`name="${name}"`);
    }
    // The saved values are there, not blanks: a hidden tab posts what it holds.
    expect(voiceForm).toContain("Sample copy");
    expect(voiceForm).toContain("Small batches");
  });

  it("tabs are switched with the hidden attribute, never by not rendering", () => {
    const src = readFileSync("app/routes/app.settings.jsx", "utf8");
    expect(src).toMatch(/hidden: tab !== i/);
    expect(src).not.toMatch(/\{tab === \d+ && /);
    expect((html.match(/role="tabpanel"/g) || []).length).toBe(4);
  });

  it("the brand-voice summary is built only from the merchant's inputs", () => {
    expect(html).toContain("What every draft is given");
    expect(html).toContain("Northline Supply");
    expect(html).toContain(">cast iron<");
    expect(html).toContain(">skillet<");
  });

  it("locked features show the feature blurred under a lock card with See plans", () => {
    expect(html).toContain("Content templates are on");
    expect(html).toContain("Using your own AI key is available on the Professional plan.");
    expect(html).toContain("nv-locked");
    expect(html).toContain("See plans");
  });

  it("toggles carry an On / Off status chip", () => {
    expect(html).toContain("Review before publishing");
    expect(html).toMatch(/>On</);
  });

  it("on a plan with templates and the own-key feature, the real forms render", () => {
    const pro = render(SettingsPage, settingsData({ planName: "pro", aiKeyAvailable: true, entitlements: { autopilot: true, contentTemplates: true, bulkJobs: true, blogPosts: true } }), "/app/settings");
    expect(pro).toContain('name="tplName"');
    expect(pro).toContain('name="aiKey"');
    expect(pro).not.toContain("Content templates are on");
  });
});

const plansData = (usageCount) => ({
  promptId: null,
  plan: { planName: "free", status: "ACTIVE", monthlyCredits: 100, shopifyChargeId: null, currentPeriodEnd: null },
  usageCount,
  monthAt: "2026-11-05T00:00:00.000Z",
  billingNotice: null,
});

describe("Plans v2 — tiles, no 'Most popular', a highlight only with a measured reason", () => {
  it("never says Most popular, on screen or in the source", () => {
    expect(render(PlansPage, plansData(10), "/app/plans")).not.toContain("Most popular");
    expect(readFileSync("app/routes/app.plans.jsx", "utf8")).not.toMatch(/t\("Most popular"\)/);
    expect(readFileSync("app/routes/app.plans.jsx", "utf8")).not.toMatch(/highlight: true/);
  });

  it("with light usage, no plan is set apart", () => {
    const html = render(PlansPage, plansData(10), "/app/plans");
    expect(html).not.toContain("Fits your usage");
    expect(html).not.toContain("outline:2px solid var(--navaal-brand)");
  });

  it("at 70%+ of the month's credits, the next plan up is set apart with the measured reason", () => {
    const html = render(PlansPage, plansData(80), "/app/plans");
    expect(html).toContain("Fits your usage");
    expect(html).toContain("You have used 80 of 100 credits this month. Starter gives you 500 a month.");
    expect((html.match(/Fits your usage/g) || []).length).toBe(1);
  });

  it("the saving chip is computed from the price constants", () => {
    const pct = Math.min(...["starter", "growth", "pro"].map((k) => annualSavingPct(BILLING_PLANS[k])));
    expect(render(PlansPage, plansData(10), "/app/plans")).toContain(`Save ${pct}%`);
  });

  it("each plan card has its icon tile, and the current plan card leads", () => {
    const html = render(PlansPage, plansData(10), "/app/plans");
    expect((html.match(/nv-tile /g) || []).length).toBeGreaterThanOrEqual(5);
    expect(html.indexOf("Current plan")).toBeLessThan(html.indexOf("Choose a plan"));
  });
});
