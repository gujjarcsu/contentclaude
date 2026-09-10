import { useState, useEffect, useRef } from "react";
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
import { markPromptArrived, markSubscribeRequested } from "../utils/upgradePrompts.server.js";
import { recordArrivedFrom } from "../utils/quotaSurfaces.server.js";
import { resolveBillingTest } from "../utils/billingTest.server.js";
import { getActiveSubscriptions } from "../utils/activeSubscriptions.server.js";
import { BILLING_PLANS, FREE_PLAN, ALL_BILLING_PLAN_KEYS } from "../utils/billing-plans.js";
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
      monthlyLimit: plan.monthlyLimit,
      shopifyChargeId: plan.shopifyChargeId,
      currentPeriodEnd: plan.currentPeriodEnd?.toISOString() ?? null,
    },
    usageCount,
    currentMonth,
    billingNotice,
  };
};

export const action = async ({ request }) => {
  const { billing, session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "subscribe") {
    const planKey = formData.get("planKey");
    if (!planKey || !ALL_BILLING_PLAN_KEYS.includes(planKey)) {
      return Response.json({ error: "Invalid plan selected." }, { status: 400 });
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
    // Phase 0 item 10 — the 7-day trial is once per shop, for the life of the
    // shop. trialDays: 7 is baked into every plan in the billing config, so
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
        { error: `Could not start subscription: ${msg}. Please try again or contact support.` },
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
              "We couldn't reach Shopify to confirm your subscription. Please try again in a moment, or contact support at hello@navaal.ai.",
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
              "We couldn't find an active subscription to cancel. If you believe you have one, please contact support at hello@navaal.ai before assuming it's cancelled.",
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
        { error: `Could not cancel subscription: ${err?.message ?? err}` },
        { status: 500 },
      );
    }

    // Immediately reflect cancelled state — don't wait for Shopify webhook delivery
    // (webhook can take up to 5 minutes; merchant should lose access instantly).
    // Only reached after billing.cancel genuinely succeeded above.
    await syncBillingToPlan(session.shop, []);

    return Response.json({ cancelled: true });
  }

  return Response.json({ error: "Unknown action." });
};

const PLAN_DISPLAY = [
  {
    planName: "free",
    label: "Free",
    tagline: "Get started, no card needed",
    price: "$0",
    period: "forever",
    monthlyLimit: FREE_PLAN.monthlyLimit,
    icon: PlanIcon,
    iconTone: "subdued",
    highlight: false,
    planKey: null,
    features: [
      `${FREE_PLAN.monthlyLimit} generations / month`,
      "Product descriptions",
      "Meta titles & descriptions",
      "FAQ content",
      "Image alt text",
      "Brand voice settings",
    ],
  },
  {
    planName: "starter",
    label: "Starter",
    tagline: "Perfect for small stores",
    price: "$9.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.starter.monthlyLimit,
    icon: StarFilledIcon,
    iconTone: "info",
    highlight: false,
    planKey: BILLING_PLANS.starter.key,
    annualPlanKey: BILLING_PLANS.starter.annualKey,
    annualPrice: "$99.90",
    features: [
      `${BILLING_PLANS.starter.monthlyLimit} generations / month`,
      "Everything in Free",
      "7-day free trial",
      "Content templates",
      "Version history",
      "Priority support",
    ],
  },
  {
    planName: "growth",
    label: "Growth",
    tagline: "Most popular · scales with you",
    price: "$29.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.growth.monthlyLimit,
    icon: ChartHistogramGrowthIcon,
    iconTone: "info",
    highlight: true,
    planKey: BILLING_PLANS.growth.key,
    annualPlanKey: BILLING_PLANS.growth.annualKey,
    annualPrice: "$299.90",
    features: [
      `${BILLING_PLANS.growth.monthlyLimit} generations / month`,
      "Everything in Starter",
      "7-day free trial",
      "Bulk generation jobs",
      "Autopilot mode",
      "A/B variant testing",
    ],
  },
  {
    planName: "pro",
    label: "Professional",
    tagline: "For high-volume merchants",
    price: "$79.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.pro.monthlyLimit,
    icon: OrganizationIcon,
    iconTone: "info",
    highlight: false,
    planKey: BILLING_PLANS.pro.key,
    annualPlanKey: BILLING_PLANS.pro.annualKey,
    annualPrice: "$799.90",
    features: [
      `${BILLING_PLANS.pro.monthlyLimit} generations / month`,
      "Everything in Growth",
      "7-day free trial",
      "Dedicated account manager",
      "Custom onboarding",
      "SLA support",
    ],
  },
];

const PLAN_ORDER = ["free", "starter", "growth", "pro"];

const FEATURE_TABLE = [
  { feature: "AI generations / month", free: "25", starter: "50", growth: "200", pro: "1,000" },
  { feature: "Product descriptions", free: true, starter: true, growth: true, pro: true },
  { feature: "Meta titles & descriptions", free: true, starter: true, growth: true, pro: true },
  { feature: "FAQ content", free: true, starter: true, growth: true, pro: true },
  { feature: "Image alt text", free: true, starter: true, growth: true, pro: true },
  { feature: "Content templates", free: false, starter: true, growth: true, pro: true },
  { feature: "Version history & rollback", free: false, starter: true, growth: true, pro: true },
  { feature: "Bulk generation jobs", free: false, starter: false, growth: true, pro: true },
  { feature: "Autopilot mode", free: false, starter: false, growth: true, pro: true },
  { feature: "A/B variant testing", free: false, starter: false, growth: true, pro: true },
  { feature: "Dedicated support", free: false, starter: false, growth: false, pro: true },
];

const FAQ_ITEMS = [
  {
    q: "When does my monthly generation count reset?",
    a: "Counts reset on the 1st of each calendar month. Unused generations don't roll over.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Yes. Approving a new plan replaces your current one — there is no cancellation step. Upgrades take effect immediately; a change to a cheaper plan is prorated by Shopify.",
  },
  {
    q: "What counts as one 'generation'?",
    a: "Each time you generate content for a product — description, meta title/description, or FAQ — counts as one generation, regardless of how many content types are selected in that run.",
  },
  {
    q: "Is there a free trial?",
    a: "All paid plans include a 7-day free trial. You won't be charged until the trial ends and you can cancel anytime.",
  },
];

function FeatureCell({ value }) {
  // Never color- or glyph-only: Polaris Icon renders accessibilityLabel as
  // visually-hidden text, so a screen reader hears "Included" / "Not included"
  // instead of a bare check glyph or an em dash.
  if (value === true) return <Icon source={CheckIcon} tone="success" accessibilityLabel="Included" />;
  if (value === false) return <Icon source={XIcon} tone="subdued" accessibilityLabel="Not included" />;
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
  const isAnnual = billingPeriod === "annual" && !!displayPlan.annualPlanKey;
  const shownPrice = isAnnual ? displayPlan.annualPrice : displayPlan.price;
  const shownPeriod = isAnnual ? "/ year" : displayPlan.period;
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
            {isCurrent && <Badge tone="success">Current plan</Badge>}
            {displayPlan.highlight && <Badge tone="info">Most popular</Badge>}
          </InlineStack>
        )}

        {/* Header */}
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <Box minWidth="20px">
              <Icon source={displayPlan.icon} tone={displayPlan.iconTone} />
            </Box>
            <Text as="h3" variant="headingMd">
              {displayPlan.label}
            </Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            {displayPlan.tagline}
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
            <Text as="p" variant="bodySm" tone="success" fontWeight="semibold">
              2 months free vs monthly
            </Text>
          )}
        </BlockStack>

        {/* Features */}
        <BlockStack gap="200">
          {displayPlan.features.map((f) => (
            <InlineStack key={f} gap="200" blockAlign="start" wrap={false}>
              <Box minWidth="20px">
                <Icon source={CheckIcon} tone="success" accessibilityLabel="Included" />
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
                <Icon source={CheckIcon} tone="success" accessibilityLabel="Active" />
              </Box>
              <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued">
                Active plan
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
                Upgrade to {displayPlan.label}
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
                Switch to {displayPlan.label}
              </Button>
            </Form>
          ) : (
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              Free forever
            </Text>
          )}
          {displayPlan.planKey && isDowngrade && (
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              Approving this replaces your current plan — no need to cancel first.
            </Text>
          )}
          {displayPlan.planKey && !isCurrent && !isDowngrade && (
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              7-day free trial · Cancel anytime
            </Text>
          )}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

export default function PlansPage() {
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
    return <AppSkeleton title="Plans & Billing" sections={3} layout="full" />;
  }
  const submittingPlan = navigation.formData?.get("planKey");
  const isCancelling = navigation.formData?.get("actionType") === "cancel";

  const usagePct = Math.min(100, Math.round((usageCount / plan.monthlyLimit) * 100));
  const usageRemaining = Math.max(0, plan.monthlyLimit - usageCount);
  const currentPlanIndex = PLAN_ORDER.indexOf(plan.planName);
  const currentDisplay = PLAN_DISPLAY.find((p) => p.planName === plan.planName);

  return (
    <Page
      title="Plans & Billing"
      subtitle="Upgrade anytime · 7-day free trial on all paid plans · Cancel anytime"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="600">
        {billingNotice === "upgraded" && plan.planName !== "free" && (
          <Banner
            tone="success"
            title={`You're on the ${PLAN_DISPLAY.find((p) => p.planName === plan.planName)?.label ?? plan.planName} plan`}
          >
            <p>Your subscription is active. Your new monthly generation limit is live.</p>
          </Banner>
        )}
        {billingNotice === "declined" && (
          <Banner tone="warning" title="Charge not approved">
            <p>
              The subscription charge was declined or wasn&apos;t completed, so you&apos;re still on your
              current plan. You can try upgrading again anytime.
            </p>
          </Banner>
        )}
        {billingNotice === "error" && (
          <Banner tone="warning" title="We couldn't confirm the change just now">
            <p>
              Your plan will update automatically within a few moments if the charge went through. Refresh
              this page shortly, or contact hello@navaal.ai if it doesn&apos;t.
            </p>
          </Banner>
        )}

        {actionData?.cancelled && (
          <Banner tone="info" title="Subscription cancelled">
            <p>Your plan has been cancelled and you&apos;ve been moved to the Free plan.</p>
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
                  Monthly Usage
                </Text>
                <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                  {currentDisplay?.label ?? plan.planName} Plan
                </Badge>
                {plan.currentPeriodEnd && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Renews {new Date(plan.currentPeriodEnd).toLocaleDateString()}
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
                  {usageCount} used
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  fontWeight="semibold"
                  tone={usagePct >= 90 ? "critical" : usagePct >= 70 ? undefined : "success"}
                >
                  {usageRemaining} remaining of {plan.monthlyLimit}
                </Text>
              </InlineStack>
              <ProgressBar progress={usagePct} tone={usagePct >= 90 ? "critical" : "success"} size="small" />
              {usagePct >= 70 && plan.planName !== "pro" && (
                <Text as="p" variant="bodySm" tone={usagePct >= 90 ? "critical" : undefined}>
                  {usagePct >= 90 ? "Nearly at limit" : "Usage climbing — consider upgrading"}
                </Text>
              )}
            </BlockStack>
          </InlineGrid>
        </Card>
        {/* Horizontal plan cards */}
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <Text as="h2" variant="headingLg">
              Choose Your Plan
            </Text>
            <ButtonGroup variant="segmented">
              <Button pressed={billingPeriod === "monthly"} onClick={() => setBillingPeriod("monthly")}>
                Monthly
              </Button>
              <Button pressed={billingPeriod === "annual"} onClick={() => setBillingPeriod("annual")}>
                Annual · 2 months free
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
              Full Feature Comparison
            </Text>
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={[
                <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued" key="feature">
                  Feature
                </Text>,
                "Free",
                "Starter",
                <Text as="span" variant="bodySm" fontWeight="semibold" tone="success" key="growth">
                  Growth
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
              Frequently Asked Questions
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
                  Cancel Subscription
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  You&apos;ll be moved to the Free plan. Unused time is prorated automatically.
                </Text>
              </BlockStack>
              <Form method="post">
                <input type="hidden" name="actionType" value="cancel" />
                <Button tone="critical" variant="plain" submit loading={isSubmitting && isCancelling}>
                  Cancel Subscription
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
