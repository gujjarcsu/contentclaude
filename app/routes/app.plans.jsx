import { useState, useEffect, useRef } from "react";
import { useT } from "../i18n/react.jsx";
import { tForRequest, T } from "../i18n/index.js";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useNavigate,
  useRevalidator,
  useFetcher,
  Form,
} from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  ButtonGroup,
  Banner,
  Box,
  ProgressBar,
  Badge,
  Divider,
  DataTable,
  Icon,
  InlineGrid,
} from "@shopify/polaris";
import {
  CheckIcon,
  XIcon,
  PlanIcon,
  StarFilledIcon,
  ChartHistogramGrowthIcon,
  OrganizationIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import { quotaPct } from "../utils/quota.js";
import { markPromptArrived, markSubscribeRequested } from "../utils/upgradePrompts.server.js";
import { recordArrivedFrom } from "../utils/quotaSurfaces.server.js";
import { resolveBillingTest } from "../utils/billingTest.server.js";
import { getActiveSubscriptions } from "../utils/activeSubscriptions.server.js";
import {
  BILLING_PLANS,
  FREE_PLAN,
  ALL_BILLING_PLAN_KEYS,
  TRIAL_DAYS,
  TRIAL_CREDITS,
} from "../utils/billing-plans.js";
import { formatPrice, annualSavingPct } from "../utils/billing-config.js";
// The credit weights are the third locked axis and `credits.js` already says
// "the plans page and the quota surfaces show these numbers". It did not: the
// page was written before B1 and still described a flat one-per-generation
// model. Derived now, so the cost a merchant reads is the cost the gate charges.
import { CREDIT_WEIGHTS, CREDIT_RESET_SENTENCE, CREDIT_ROLLOVER_SENTENCE } from "../utils/credits.js";
import {
  getOrCreatePlan,
  getMonthlyUsageCount,
  syncBillingToPlan,
  hasUsedTrial,
} from "../utils/plans.server.js";
import { signShopCallback } from "../utils/signedUrl.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fast path ONLY — the DB plan (kept current by the app_subscriptions/update
  // webhook) is the source of truth for display, so this response is just two
  // quick DB reads and closes immediately. The Shopify billing.check() round-trip
  // is intentionally NOT here: it runs after first paint via a fetcher to
  // /app/plans-reconcile. (Doing it inline — even as a streamed deferred promise —
  // held the response open behind the edge proxy's buffering and froze the page
  // for the full billing.check duration.)
  const [plan, usageCount] = await Promise.all([getOrCreatePlan(shop), getMonthlyUsageCount(shop)]);

  const currentMonth = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  // Notice from the billing return callback (see routes/billing.callback.jsx):
  // upgraded=1 on a successful approval, declined=1 when the charge was
  // declined/expired, billing_error=1 if the callback couldn't read state.
  const url = new URL(request.url);
  const billingNotice = url.searchParams.get("upgraded")
    ? "upgraded"
    : url.searchParams.get("declined")
      ? "declined"
      : url.searchParams.get("billing_error")
        ? "error"
        : null;

  // Phase 3 item 3.4 — which of the two upsell surfaces sent them here.
  // Recorded on arrival so it survives the round trip out to Shopify's approval
  // screen and back through /billing/callback, where the subscription actually
  // activates. Both writes are shop-scoped, never throw, and a `from` we did
  // not mint is discarded — an attribution a merchant can type into their own
  // URL bar is not an attribution.
  const promptId = url.searchParams.get("prompt");
  const from = url.searchParams.get("from");
  if (promptId) {
    await Promise.all([markPromptArrived(shop, promptId), recordArrivedFrom(shop, promptId, from)]);
  }

  return {
    // Carried into the subscribe form so a subscribe REQUEST can be attributed
    // to the prompt the merchant came from, not just the arrival.
    promptId: promptId || null,
    plan: {
      planName: plan.planName,
      status: plan.status,
      monthlyCredits: plan.monthlyCredits,
      shopifyChargeId: plan.shopifyChargeId,
      currentPeriodEnd: plan.currentPeriodEnd?.toISOString() ?? null,
    },
    usageCount,
    currentMonth,
    billingNotice,
  };
};

export const action = async ({ request }) => {
  const t = tForRequest(request);
  const { billing, session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "subscribe") {
    const planKey = formData.get("planKey");
    if (!planKey || !ALL_BILLING_PLAN_KEYS.includes(planKey)) {
      return Response.json({ error: t("Invalid plan selected.") }, { status: 400 });
    }
    // Dev stores (incl. the App Store review team's) can only approve TEST
    // charges; real merchants get real charges. Resolved per shop — only the
    // subscribe path needs it (test-vs-real must be decided before the sub
    // exists); cancel reads the sub's real test flag instead.
    // Phase 3 item 3.4 — a subscribe REQUEST is the strongest signal short of
    // an activation, and it is what attributePlanChoice matches on first.
    const promptId = formData.get("promptId");
    if (promptId) await markSubscribeRequested(session.shop, String(promptId), planKey);

    const isTest = await resolveBillingTest(admin, session.shop);
    // Phase 0 item 10 — the trial is once per shop, for the life of the
    // shop. TRIAL_DAYS is baked into every plan in the billing config, so
    // subscribe then cancel then resubscribe granted an unlimited series of free
    // trials, and uninstall then reinstall did the same. The flag lives on the Shop
    // row (Plan is deleted on uninstall); passing 0 overrides the config for
    // this request only.
    const trialSpent = await hasUsedTrial(session.shop);
    const callbackSig = signShopCallback(session.shop);
    // billing.request() internally throws a redirect Response to Shopify's
    // approval screen. Any non-redirect throw (Shopify userErrors, network
    // failures, bad returnUrl) must be caught and returned as a user-facing
    // message — never let it bubble to the ErrorBoundary.
    try {
      await billing.request({
        plan: planKey,
        isTest,
        ...(trialSpent ? { trialDays: 0 } : {}),
        // Return to a PUBLIC backend callback (no session cookie needed), NOT
        // straight to /app/plans. After approval Shopify does a top-level
        // redirect here with no embedded context; /app/plans would fail auth
        // and dump the merchant on /auth/login (App Store 1.2.2 rejection).
        // The callback records the plan via the shop's offline token, then
        // 302s back INTO the embedded admin. Shopify appends &charge_id=…
        // Signed (Phase 0 item 20): /billing/callback is public and reads the
        // shop's subscription state, so the link must prove WE issued it for
        // THIS shop, and must stop working after a few hours.
        returnUrl:
          `${process.env.SHOPIFY_APP_URL}/billing/callback?shop=${encodeURIComponent(session.shop)}` +
          `&sig=${encodeURIComponent(callbackSig.sig)}&exp=${encodeURIComponent(callbackSig.exp)}`,
      });
    } catch (err) {
      // On success, billing.request THROWS a 401 Response whose
      // X-Shopify-API-Request-Failure-Reauthorize-Url header is Shopify's billing
      // confirmation URL (it expects App Bridge to redirect the top window there).
      // Re-throwing it lands in the ErrorBoundary as a misleading "session expired",
      // so instead surface the URL as data and let the client break out of the
      // iframe to it (see the redirect effect in the component).
      if (err instanceof Response) {
        const confirmationUrl = err.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url");
        if (confirmationUrl) return Response.json({ confirmationUrl });
        throw err; // a genuine re-auth redirect, not the billing hand-off
      }
      // Anything else is a real error; surface it to the user.
      const msg = err?.message ?? String(err);
      return Response.json(
        { error: t("Could not start subscription: {msg}. Please try again or contact support.", { msg }) },
        { status: 500 },
      );
    }
  }

  if (actionType === "cancel") {
    try {
      // Test-agnostic lookup (App Store 1.2.3): billing.check({ isTest }) hides
      // subscriptions whose test flag doesn't match isTest, so a dev store's
      // test:true sub could look absent and produce a false "nothing to cancel".
      // getActiveSubscriptions returns every active sub regardless of test flag.
      const { ok, subs } = await getActiveSubscriptions(admin.graphql);
      if (!ok) {
        return Response.json(
          {
            error:
              t("We couldn't reach Shopify to confirm your subscription. Please try again in a moment, or contact support at hello@navaal.ai."),
          },
          { status: 503 },
        );
      }
      const activeSub = subs.find((s) => s.status === "ACTIVE");
      if (!activeSub) {
        // Fail LOUDLY. Returning {cancelled: true} here would tell the
        // merchant they cancelled while Shopify keeps charging them — and
        // syncBillingToPlan(shop, []) would wipe their paid plan locally.
        return Response.json(
          {
            error:
              t("We couldn't find an active subscription to cancel. If you believe you have one, please contact support at hello@navaal.ai before assuming it's cancelled."),
          },
          { status: 409 },
        );
      }
      // Cancel with the sub's ACTUAL test flag, not a re-resolved isTest —
      // avoids any request/check divergence hiding the sub from the cancel.
      await billing.cancel({ subscriptionId: activeSub.id, isTest: activeSub.test, prorate: true });
    } catch (err) {
      if (err instanceof Response) throw err;
      return Response.json(
        { error: t("Could not cancel subscription: {v}", { v: err?.message ?? err }) },
        { status: 500 },
      );
    }

    // Immediately reflect cancelled state — don't wait for Shopify webhook delivery
    // (webhook can take up to 5 minutes; merchant should lose access instantly).
    // Only reached after billing.cancel genuinely succeeded above.
    await syncBillingToPlan(session.shop, []);

    return Response.json({ cancelled: true });
  }

  return Response.json({ error: t("Unknown action.") });
};

/**
 * P5.0 — the plan cards, DERIVED from the locked table.
 *
 * Every number on this page used to be a hardcoded string, and by the time it
 * was read they had drifted from the table the app actually bills on in four
 * separate ways at once: the annual prices were the pre-20% figures
 * ($99.90/$299.90/$799.90 against $95.90/$287.90/$767.90), the comparison table
 * still listed the pre-B2 allowances (25/50/200/1,000 against 100/500/1,500/
 * 4,000), bulk was shown as Growth-and-up when B3 moved it to Starter, and the
 * trial said 7 days. None of that was caught, because every pricing test
 * asserted `billing-plans.js` against itself and nothing asserted the screen.
 *
 * So: no literal prices, no literal allowances, no literal trial length below.
 * `plansSurfaces.test.js` fails if one comes back.
 */
const trialLine = `${TRIAL_DAYS}-day free trial · ${TRIAL_CREDITS} credits`;

/** "1,000 products" / "Unlimited products" — productLimit is a LOCKED axis and it appeared nowhere on this page. */
function productLine(limit) {
  return limit === null ? "Unlimited products" : `Up to ${limit.toLocaleString()} products`;
}

/** Credits, not "generations": a blog post costs 3 and alt text costs 0 (B1). */
function creditLine(credits) {
  return `${credits.toLocaleString()} credits / month`;
}

const PLAN_DISPLAY = [
  {
    planName: "free",
    label: T("Free"),
    tagline: T("Get started, no card needed"),
    price: formatPrice(FREE_PLAN.amount),
    period: "forever",
    monthlyCredits: FREE_PLAN.monthlyCredits,
    icon: PlanIcon,
    iconTone: "subdued",
    highlight: false,
    planKey: null,
    features: [
      creditLine(FREE_PLAN.monthlyCredits),
      productLine(FREE_PLAN.productLimit),
      "Product descriptions",
      "Meta titles & descriptions",
      "FAQ content",
      "Image alt text",
      "Brand voice settings",
    ],
  },
  {
    planName: "starter",
    label: T("Starter"),
    tagline: T("Perfect for small stores"),
    price: formatPrice(BILLING_PLANS.starter.amount),
    period: "/ month",
    monthlyCredits: BILLING_PLANS.starter.monthlyCredits,
    icon: StarFilledIcon,
    iconTone: "info",
    highlight: false,
    planKey: BILLING_PLANS.starter.key,
    annualPlanKey: BILLING_PLANS.starter.annualKey,
    annualPrice: formatPrice(BILLING_PLANS.starter.annualAmount),
    features: [
      creditLine(BILLING_PLANS.starter.monthlyCredits),
      productLine(BILLING_PLANS.starter.productLimit),
      "Everything in Free",
      trialLine,
      // B3 — bulk starts HERE, at $9.99, and this card did not say so. The
      // comparison table showed it as Growth-and-up while the code granted it,
      // so a Starter subscriber had no way to learn they were already paying
      // for the feature that saves them the time.
      "Bulk runs",
      "Content templates",
      "Version history",
      // 12-OFFER.md 5.5 - "Priority support" is the same undefined-promise
      // class as "SLA support", which 6 bans by name: no defined priority,
      // no queue, no response commitment behind it.
      "Email support from the founder",
    ],
  },
  {
    planName: "growth",
    label: T("Growth"),
    tagline: T("Most popular · scales with you"),
    price: formatPrice(BILLING_PLANS.growth.amount),
    period: "/ month",
    monthlyCredits: BILLING_PLANS.growth.monthlyCredits,
    icon: ChartHistogramGrowthIcon,
    iconTone: "info",
    highlight: true,
    planKey: BILLING_PLANS.growth.key,
    annualPlanKey: BILLING_PLANS.growth.annualKey,
    annualPrice: formatPrice(BILLING_PLANS.growth.annualAmount),
    features: [
      creditLine(BILLING_PLANS.growth.monthlyCredits),
      productLine(BILLING_PLANS.growth.productLimit),
      "Everything in Starter",
      trialLine,
      `Blog posts (${CREDIT_WEIGHTS.blog} credits each)`,
      "Autopilot mode",
      // 12-OFFER.md 5.5 - the feature generates two candidate texts for the
      // merchant to choose between. There is no traffic split and no winner
      // is measured, so "A/B testing" names a measurement we do not perform.
      // The product page already says it honestly ("Generate two options to
      // compare"); only the plan card overclaimed.
      "Two description options to compare",
    ],
  },
  {
    planName: "pro",
    label: T("Professional"),
    tagline: T("For high-volume merchants"),
    price: formatPrice(BILLING_PLANS.pro.amount),
    period: "/ month",
    monthlyCredits: BILLING_PLANS.pro.monthlyCredits,
    icon: OrganizationIcon,
    iconTone: "info",
    highlight: false,
    planKey: BILLING_PLANS.pro.key,
    annualPlanKey: BILLING_PLANS.pro.annualKey,
    annualPrice: formatPrice(BILLING_PLANS.pro.annualAmount),
    features: [
      creditLine(BILLING_PLANS.pro.monthlyCredits),
      productLine(BILLING_PLANS.pro.productLimit),
      "Everything in Growth",
      trialLine,
      // C0.7 — 04-DECISIONS.md requires the billing rule to be on the plan
      // card and the Settings card, not in a help article. A merchant
      // discovering how they are billed after the fact is the same class of
      // failure as the trial length.
      "Your own AI key — no credits used",
      // P0.8 / 08-ECONOMICS.md guardrail 6 — the SERVICE stays, the two
      // undefined words go. "SLA" means a contractual guarantee with remedies;
      // saying it without one written is a promise we cannot keep, and at low
      // review volume one unmet promise halves the rating. Exact replacement
      // wording from 12-OFFER.md #6.
      "Direct access to the founder",
      "Setup call when you start",
      "Every question answered within one business day",
    ],
  },
];

const PLAN_ORDER = ["free", "starter", "growth", "pro"];

/** Read an entitlement off the locked table so a gate change cannot leave this row behind. */
const ent = (name, feature) =>
  (name === "free" ? FREE_PLAN : BILLING_PLANS[name]).entitlements[feature] === true;

const FEATURE_TABLE = [
  {
    // Was hardcoded "25 / 50 / 200 / 1,000" — the pre-B2 allowances, still on
    // the screen after the locked table multiplied every one of them by 4-7.5x.
    feature: "Credits / month",
    free: FREE_PLAN.monthlyCredits.toLocaleString(),
    starter: BILLING_PLANS.starter.monthlyCredits.toLocaleString(),
    growth: BILLING_PLANS.growth.monthlyCredits.toLocaleString(),
    pro: BILLING_PLANS.pro.monthlyCredits.toLocaleString(),
  },
  {
    feature: "Products covered",
    free: FREE_PLAN.productLimit.toLocaleString(),
    starter: BILLING_PLANS.starter.productLimit.toLocaleString(),
    growth: BILLING_PLANS.growth.productLimit.toLocaleString(),
    pro: "Unlimited",
  },
  {
    feature: "Free trial",
    free: "—",
    starter: trialLine,
    growth: trialLine,
    pro: trialLine,
  },
  { feature: "Product descriptions", free: true, starter: true, growth: true, pro: true },
  { feature: "Meta titles & descriptions", free: true, starter: true, growth: true, pro: true },
  { feature: "FAQ content", free: true, starter: true, growth: true, pro: true },
  {
    feature: `Image alt text (${CREDIT_WEIGHTS.altText} credits)`,
    free: true, starter: true, growth: true, pro: true,
  },
  {
    feature: "Full catalogue audit",
    // Never capped, on any plan including Free — a locked decision, and it is
    // the hook (14-PRICING.md §4).
    free: true, starter: true, growth: true, pro: true,
  },
  {
    feature: "Content templates",
    free: ent("free", "contentTemplates"), starter: ent("starter", "contentTemplates"),
    growth: ent("growth", "contentTemplates"), pro: ent("pro", "contentTemplates"),
  },
  {
    feature: "Version history & rollback",
    free: ent("free", "versionHistory"), starter: ent("starter", "versionHistory"),
    growth: ent("growth", "versionHistory"), pro: ent("pro", "versionHistory"),
  },
  {
    // This row said Starter: NO while the code granted it. Derived now.
    feature: "Bulk runs",
    free: ent("free", "bulkJobs"), starter: ent("starter", "bulkJobs"),
    growth: ent("growth", "bulkJobs"), pro: ent("pro", "bulkJobs"),
  },
  {
    feature: "Autopilot mode",
    free: ent("free", "autopilot"), starter: ent("starter", "autopilot"),
    growth: ent("growth", "autopilot"), pro: ent("pro", "autopilot"),
  },
  {
    feature: "Two description options to compare",
    free: ent("free", "abVariants"), starter: ent("starter", "abVariants"),
    growth: ent("growth", "abVariants"), pro: ent("pro", "abVariants"),
  },
  { feature: "Dedicated support", free: false, starter: false, growth: false, pro: true },
];

const FAQ_ITEMS = [
  {
    q: "When do my credits reset?",
    a: `${CREDIT_RESET_SENTENCE} ${CREDIT_ROLLOVER_SENTENCE}`,
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Yes. Approving a new plan replaces your current one — there is no cancellation step. Upgrades take effect immediately; a change to a cheaper plan is prorated by Shopify.",
  },
  {
    // B1 — credit weighting shipped at 7d23792 and this answer still described
    // the flat "one generation" model it replaced. Alt text costs nothing now
    // and a blog post costs three, so the old answer understated one and
    // overstated the other.
    q: "What does one credit buy?",
    a:
      `Most things cost ${CREDIT_WEIGHTS.description} credit: a product description, a meta title and ` +
      `description, or FAQ content. Image alt text is free — ${CREDIT_WEIGHTS.altText} credits, however many ` +
      `images the product has. A blog post costs ${CREDIT_WEIGHTS.blog} credits, because it is several times ` +
      `the work. When you select more than one content type in a single run, you are charged the most ` +
      `expensive one, not the sum.`,
  },
  {
    q: "Is there a free trial?",
    a: `All paid plans include a ${TRIAL_DAYS}-day free trial with ${TRIAL_CREDITS} credits to spend in it. You won't be charged until the trial ends and you can cancel anytime. The trial allowance is ${TRIAL_CREDITS} credits rather than the plan's full monthly amount, and it is one trial per store.`,
  },
];

function FeatureCell({ value }) {
  const t = useT();
  // Never color- or glyph-only: Polaris Icon renders accessibilityLabel as
  // visually-hidden text, so a screen reader hears "Included" / "Not included"
  // instead of a bare check glyph or an em dash.
  if (value === true) return <Icon source={CheckIcon} tone="success" accessibilityLabel={t("Included")} />;
  if (value === false) return <Icon source={XIcon} tone="subdued" accessibilityLabel={t("Not included")} />;
  return (
    <Text as="span" variant="bodySm" fontWeight="semibold">
      {value}
    </Text>
  );
}

function PlanCard({
  displayPlan,
  isCurrent,
  isUpgrade,
  isDowngrade,
  isSubmitting,
  submittingPlan,
  billingPeriod,
  promptId,
}) {
  const t = useT();
  const isAnnual = billingPeriod === "annual" && !!displayPlan.annualPlanKey;
  const shownPrice = isAnnual ? displayPlan.annualPrice : displayPlan.price;
  const shownPeriod = isAnnual ? t("/ year") : t(displayPlan.period);
  const activeKey = isAnnual ? displayPlan.annualPlanKey : displayPlan.planKey;
  // The spinner stays on the plan actually being purchased; the disable is
  // global, so the highest-intent button in the app cannot be double-submitted
  // and no second plan can be started while one hand-off is already in flight.
  const isSubmittingThisPlan = isSubmitting && submittingPlan === activeKey;

  return (
    <Card>
      <BlockStack gap="400">
        {/* Status badges in normal flow. The old pills were both absolutely
            positioned at top:-12px and overlapped each other on the Growth
            card whenever Growth was also the current plan. */}
        {(isCurrent || displayPlan.highlight) && (
          <InlineStack gap="200" blockAlign="center" wrap>
            {isCurrent && <Badge tone="success">{t("Current plan")}</Badge>}
            {displayPlan.highlight && <Badge tone="info">{t("Most popular")}</Badge>}
          </InlineStack>
        )}

        {/* Header */}
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <Box minWidth="20px">
              <Icon source={displayPlan.icon} tone={displayPlan.iconTone} />
            </Box>
            <Text as="h3" variant="headingMd">
              {t(displayPlan.label)}
            </Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            {t(displayPlan.tagline)}
          </Text>
          <InlineStack gap="100" blockAlign="baseline" wrap={false}>
            <Text as="span" variant="heading2xl">
              {shownPrice}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {shownPeriod}
            </Text>
          </InlineStack>
          {isAnnual && (
            /* 14-PRICING.md §4 bans "2 months free" BY NAME: it is 16.7%, it is
               what every competitor displays, and a merchant who checks the
               arithmetic and finds it wrong will not believe the next number we
               show them. This card rendered that exact phrase while the real
               discount was 20%. Computed from the two prices now, so the badge
               cannot disagree with the charge. */
            <Text as="p" variant="bodySm" tone="success" fontWeight="semibold">
              {t("Save {annualSavingPct}% vs monthly", { annualSavingPct: annualSavingPct(BILLING_PLANS[displayPlan.planName]) })}
            </Text>
          )}
        </BlockStack>

        {/* Features */}
        <BlockStack gap="200">
          {displayPlan.features.map((f) => (
            <InlineStack key={f} gap="200" blockAlign="start" wrap={false}>
              <Box minWidth="20px">
                <Icon source={CheckIcon} tone="success" accessibilityLabel={t("Included")} />
              </Box>
              <Text as="span" variant="bodySm">
                {f}
              </Text>
            </InlineStack>
          ))}
        </BlockStack>

        {/* CTA */}
        <BlockStack gap="200">
          {isCurrent ? (
            <InlineStack gap="100" align="center" blockAlign="center" wrap={false}>
              <Box minWidth="20px">
                <Icon source={CheckIcon} tone="success" accessibilityLabel={t("Active")} />
              </Box>
              <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued">
                {t("Active plan")}
              </Text>
            </InlineStack>
          ) : displayPlan.planKey && isUpgrade ? (
            <Form method="post">
              <input type="hidden" name="actionType" value="subscribe" />
              <input type="hidden" name="planKey" value={activeKey} />
              {promptId && <input type="hidden" name="promptId" value={promptId} />}
              <Button
                variant="primary"
                submit
                fullWidth
                loading={isSubmittingThisPlan}
                disabled={isSubmitting}
              >
                {t("Upgrade to {label}", { label: t(displayPlan.label) })}
              </Button>
            </Form>
          ) : displayPlan.planKey && isDowngrade ? (
            /* Phase 3 item 3.4 — this used to say "Cancel current plan to
               switch", which was not true. Shopify REPLACES an app
               subscription when the merchant approves a new one; there is no
               cancellation step, and telling a merchant to cancel first would
               have left them with no plan at all if they stopped there. */
            <Form method="post">
              <input type="hidden" name="actionType" value="subscribe" />
              <input type="hidden" name="planKey" value={activeKey} />
              {promptId && <input type="hidden" name="promptId" value={promptId} />}
              <Button submit fullWidth loading={isSubmittingThisPlan} disabled={isSubmitting}>
                {t("Switch to {label}", { label: t(displayPlan.label) })}
              </Button>
            </Form>
          ) : (
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              {t("Free forever")}
            </Text>
          )}
          {displayPlan.planKey && isDowngrade && (
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              {t("Approving this replaces your current plan — no need to cancel first.")}
            </Text>
          )}
          {displayPlan.planKey && !isCurrent && !isDowngrade && (
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              {t("{trialLine} · Cancel anytime", { trialLine })}
            </Text>
          )}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

export default function PlansPage() {
  const t = useT();
  const { plan, usageCount, currentMonth, billingNotice, promptId } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const loadingThisRoute = useRouteLoading();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const reconcileFetcher = useFetcher();
  const [billingPeriod, setBillingPeriod] = useState("monthly");

  // Post-paint billing reconciliation. Fires once after the page has rendered, so
  // the Shopify billing.check() round-trip never blocks first paint. Revalidates
  // only if Shopify reports a plan the webhook missed.
  const reconcileStarted = useRef(false);
  const reconcileHandled = useRef(false);
  useEffect(() => {
    if (!reconcileStarted.current) {
      reconcileStarted.current = true;
      reconcileFetcher.load("/app/plans-reconcile");
    }
  }, [reconcileFetcher]);
  useEffect(() => {
    if (reconcileFetcher.data?.changed && !reconcileHandled.current) {
      reconcileHandled.current = true;
      revalidator.revalidate();
    }
  }, [reconcileFetcher.data, revalidator]);

  // Billing hand-off: the subscribe action returns Shopify's billing confirmation
  // URL. Break out of the embedded iframe so the merchant lands on the approval
  // screen at the TOP window (App Bridge intercepts open(url, "_top")). This is
  // what makes "Upgrade" actually go to checkout instead of the old 401 that the
  // ErrorBoundary mistook for "session expired".
  const billingRedirected = useRef(false);
  useEffect(() => {
    if (actionData?.confirmationUrl && !billingRedirected.current) {
      billingRedirected.current = true;
      open(actionData.confirmationUrl, "_top");
    }
  }, [actionData]);

  const isSubmitting = navigation.state === "submitting";

  if (loadingThisRoute) {
    return <AppSkeleton title={t("Plans & Billing")} sections={3} layout="full" />;
  }
  const submittingPlan = navigation.formData?.get("planKey");
  const isCancelling = navigation.formData?.get("actionType") === "cancel";

  const usagePct = quotaPct(usageCount, plan.monthlyCredits);
  const usageRemaining = Math.max(0, plan.monthlyCredits - usageCount);
  const currentPlanIndex = PLAN_ORDER.indexOf(plan.planName);
  const currentDisplay = PLAN_DISPLAY.find((p) => p.planName === plan.planName);

  return (
    <Page
      title={t("Plans & Billing")}
      subtitle={t("Upgrade anytime · {trialLine} on all paid plans · Cancel anytime", { trialLine })}
      backAction={{ content: t("Dashboard"), onAction: () => navigate("/app") }}
    >
      <BlockStack gap="600">
        {billingNotice === "upgraded" && plan.planName !== "free" && (
          <Banner
            tone="success"
            title={t("You're on the {v} plan", { v: t(PLAN_DISPLAY.find((p) => p.planName === plan.planName)?.label ?? plan.planName) })}
          >
            <p>{t("Your subscription is active. Your new monthly credits are live.")}</p>
          </Banner>
        )}
        {billingNotice === "declined" && (
          <Banner tone="warning" title={t("Charge not approved")}>
            <p>
              {t("The subscription charge was declined or wasn't completed, so you're still on your current plan. You can try upgrading again anytime.")}
            </p>
          </Banner>
        )}
        {billingNotice === "error" && (
          <Banner tone="warning" title={t("We couldn't confirm the change just now")}>
            <p>
              {t("Your plan will update automatically within a few moments if the charge went through. Refresh this page shortly, or contact hello@navaal.ai if it doesn't.")}
            </p>
          </Banner>
        )}

        {actionData?.cancelled && (
          <Banner tone="info" title={t("Subscription cancelled")}>
            <p>{t("Your plan has been cancelled and you've been moved to the Free plan.")}</p>
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">
            <p>{actionData.error}</p>
          </Banner>
        )}

        {/* Usage summary — compact horizontal bar */}
        <Card>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400" alignItems="center">
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="h2" variant="headingMd">
                  {t("Monthly credits")}
                </Text>
                <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                  {t(currentDisplay?.label ?? plan.planName)} {t("Plan")}
                </Badge>
                {plan.currentPeriodEnd && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Renews")} {new Date(plan.currentPeriodEnd).toLocaleDateString()}
                  </Text>
                )}
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                {currentMonth}
              </Text>
            </BlockStack>

            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("{usageCount} used", { usageCount })}
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  fontWeight="semibold"
                  tone={usagePct >= 90 ? "critical" : usagePct >= 70 ? undefined : "success"}
                >
                  {t("{usageRemaining} remaining of {monthlyCredits}", { usageRemaining, monthlyCredits: plan.monthlyCredits })}
                </Text>
              </InlineStack>
              <ProgressBar progress={usagePct} tone={usagePct >= 90 ? "critical" : "success"} size="small" />
              {usagePct >= 70 && plan.planName !== "pro" && (
                <Text as="p" variant="bodySm" tone={usagePct >= 90 ? "critical" : undefined}>
                  {usagePct >= 90 ? t("Nearly at limit") : t("Usage climbing — consider upgrading")}
                </Text>
              )}
            </BlockStack>
          </InlineGrid>
        </Card>
        {/* Horizontal plan cards */}
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <Text as="h2" variant="headingLg">
              {t("Choose Your Plan")}
            </Text>
            <ButtonGroup variant="segmented">
              <Button pressed={billingPeriod === "monthly"} onClick={() => setBillingPeriod("monthly")}>
                {t("Monthly")}
              </Button>
              <Button pressed={billingPeriod === "annual"} onClick={() => setBillingPeriod("annual")}>
                {t("Annual · save {annualSavingPct}%", { annualSavingPct: annualSavingPct(BILLING_PLANS.growth) })}
              </Button>
            </ButtonGroup>
          </InlineStack>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            {PLAN_DISPLAY.map((displayPlan) => {
              const isCurrent = displayPlan.planName === plan.planName;
              const planIndex = PLAN_ORDER.indexOf(displayPlan.planName);
              const isUpgrade = planIndex > currentPlanIndex;
              const isDowngrade = planIndex < currentPlanIndex;

              return (
                <PlanCard
                  key={displayPlan.planName}
                  displayPlan={displayPlan}
                  isCurrent={isCurrent}
                  isUpgrade={isUpgrade}
                  isDowngrade={isDowngrade}
                  promptId={promptId}
                  isSubmitting={isSubmitting}
                  submittingPlan={submittingPlan}
                  billingPeriod={billingPeriod}
                />
              );
            })}
          </InlineGrid>
        </BlockStack>

        {/* Feature comparison table */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              {t("Full Feature Comparison")}
            </Text>
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={[
                <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued" key="feature">
                  {t("Feature")}
                </Text>,
                "Free",
                "Starter",
                <Text as="span" variant="bodySm" fontWeight="semibold" tone="success" key="growth">
                  {t("Growth")}
                </Text>,
                "Professional",
              ]}
              rows={FEATURE_TABLE.map((row) => [
                row.feature,
                <FeatureCell key="free" value={row.free} />,
                <FeatureCell key="starter" value={row.starter} />,
                <FeatureCell key="growth" value={row.growth} />,
                <FeatureCell key="pro" value={row.pro} />,
              ])}
            />
          </BlockStack>
        </Card>

        {/* FAQ */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              {t("Frequently Asked Questions")}
            </Text>
            {FAQ_ITEMS.map((item, i) => (
              <BlockStack key={i} gap="100">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {item.q}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {item.a}
                </Text>
                {i < FAQ_ITEMS.length - 1 && <Divider />}
              </BlockStack>
            ))}
          </BlockStack>
        </Card>

        {/* Cancel */}
        {plan.planName !== "free" && (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  {t("Cancel Subscription")}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("You'll be moved to the Free plan. Unused time is prorated automatically.")}
                </Text>
              </BlockStack>
              <Form method="post">
                <input type="hidden" name="actionType" value="cancel" />
                <Button tone="critical" variant="plain" submit loading={isSubmitting && isCancelling}>
                  {t("Cancel Subscription")}
                </Button>
              </Form>
            </InlineStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
