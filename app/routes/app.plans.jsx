import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner,
  Box, ProgressBar, Badge, Divider, DataTable,
} from "@shopify/polaris";
import { Check, Zap, Star, Rocket, Building2, ArrowRight } from "lucide-react";
import { authenticate, BILLING_TEST } from "../shopify.server";
import { BILLING_PLANS, FREE_PLAN } from "../utils/billing-plans.js";
import { getOrCreatePlan, getMonthlyUsageCount, syncBillingToPlan } from "../utils/plans.server";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;

  const { appSubscriptions } = await billing.check({
    plans: Object.values(BILLING_PLANS).map((p) => p.key),
    isTest: BILLING_TEST,
  });
  await syncBillingToPlan(shop, appSubscriptions);

  const [plan, usageCount] = await Promise.all([
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
  ]);

  const currentMonth = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return Response.json({
    plan: {
      planName: plan.planName,
      status: plan.status,
      monthlyLimit: plan.monthlyLimit,
      shopifyChargeId: plan.shopifyChargeId,
      currentPeriodEnd: plan.currentPeriodEnd?.toISOString() ?? null,
    },
    usageCount,
    currentMonth,
  });
};

export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "subscribe") {
    const planKey = formData.get("planKey");
    const validKeys = Object.values(BILLING_PLANS).map((p) => p.key);
    if (!planKey || !validKeys.includes(planKey)) {
      return Response.json({ error: "Invalid plan selected." }, { status: 400 });
    }
    // billing.request() internally throws a redirect Response to Shopify's
    // approval screen. Any non-redirect throw (Shopify userErrors, network
    // failures, bad returnUrl) must be caught and returned as a user-facing
    // message — never let it bubble to the ErrorBoundary.
    try {
      await billing.request({
        plan: planKey,
        isTest: BILLING_TEST,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/plans`,
      });
    } catch (err) {
      // The framework throws a redirect Response on success — re-throw so
      // React Router can follow it.
      if (err instanceof Response) throw err;
      // Anything else is a real error; surface it to the user.
      const msg = err?.message ?? String(err);
      return Response.json(
        { error: `Could not start subscription: ${msg}. Please try again or contact support.` },
        { status: 500 }
      );
    }
  }

  if (actionType === "cancel") {
    try {
      const { appSubscriptions } = await billing.check({
        plans: Object.values(BILLING_PLANS).map((p) => p.key),
        isTest: BILLING_TEST,
      });
      const activeSub = appSubscriptions.find((s) => s.status === "ACTIVE");
      if (activeSub) {
        await billing.cancel({ subscriptionId: activeSub.id, isTest: BILLING_TEST, prorate: true });
      }
    } catch (err) {
      if (err instanceof Response) throw err;
      return Response.json({ error: `Could not cancel subscription: ${err?.message ?? err}` }, { status: 500 });
    }
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
    icon: Zap,
    iconColor: "#8C9196",
    accent: "#f6f6f7",
    accentBorder: "#e3e3e3",
    textColor: "#202223",
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
    icon: Star,
    iconColor: "#2C6ECB",
    accent: "#f3f7fd",
    accentBorder: "#b3cef0",
    textColor: "#202223",
    highlight: false,
    planKey: BILLING_PLANS.starter.key,
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
    icon: Rocket,
    iconColor: "#ffffff",
    accent: "#2C6ECB",
    accentBorder: "#1a5099",
    textColor: "#ffffff",
    highlight: true,
    planKey: BILLING_PLANS.growth.key,
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
    icon: Building2,
    iconColor: "#1656AC",
    accent: "#f8f8f8",
    accentBorder: "#d2d5d8",
    textColor: "#202223",
    highlight: false,
    planKey: BILLING_PLANS.pro.key,
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
    a: "Yes. Upgrades take effect immediately. Downgrades take effect at the end of the current billing period with prorated credit.",
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
  if (value === true) return <Text as="span" tone="success">✓</Text>;
  if (value === false) return <Text as="span" tone="subdued">—</Text>;
  return <Text as="span" variant="bodySm" fontWeight="semibold">{value}</Text>;
}

function PlanCard({ displayPlan, isCurrent, isUpgrade, isDowngrade, isSubmitting, submittingPlan }) {
  const Icon = displayPlan.icon;
  const isLight = !displayPlan.highlight;

  return (
    <div style={{
      background: displayPlan.accent,
      border: `2px solid ${isCurrent ? "#00A047" : displayPlan.accentBorder}`,
      borderRadius: "12px",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "20px",
      position: "relative",
      transform: displayPlan.highlight ? "scale(1.03)" : "scale(1)",
      boxShadow: displayPlan.highlight ? "0 8px 32px rgba(44,110,203,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      {displayPlan.highlight && (
        <div style={{
          position: "absolute",
          top: "-12px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#00A047",
          color: "#fff",
          fontSize: "11px",
          fontWeight: "700",
          letterSpacing: "0.08em",
          padding: "4px 12px",
          borderRadius: "20px",
          whiteSpace: "nowrap",
        }}>⭐ MOST POPULAR</div>
      )}
      {isCurrent && (
        <div style={{
          position: "absolute",
          top: "-12px",
          right: "16px",
          background: "#00A047",
          color: "#fff",
          fontSize: "11px",
          fontWeight: "700",
          padding: "4px 10px",
          borderRadius: "20px",
        }}>Current Plan</div>
      )}

      {/* Header */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <Icon size={22} color={displayPlan.iconColor} />
        </div>
        <div style={{ color: displayPlan.textColor, fontSize: "18px", fontWeight: "700", marginBottom: "4px" }}>
          {displayPlan.label}
        </div>
        <div style={{ color: isLight ? "#6D7175" : "rgba(255,255,255,0.75)", fontSize: "13px", marginBottom: "12px" }}>
          {displayPlan.tagline}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span style={{ color: displayPlan.textColor, fontSize: "32px", fontWeight: "800", lineHeight: 1 }}>
            {displayPlan.price}
          </span>
          <span style={{ color: isLight ? "#8C9196" : "rgba(255,255,255,0.6)", fontSize: "13px" }}>
            {displayPlan.period}
          </span>
        </div>
      </div>

      {/* Features */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        {displayPlan.features.map((f) => (
          <div key={f} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <Check size={14} color={displayPlan.highlight ? "#a8d5b5" : "#00A047"} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span style={{ color: isLight ? "#202223" : "rgba(255,255,255,0.9)", fontSize: "13px", lineHeight: "1.4" }}>
              {f}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div>
        {isCurrent ? (
          <div style={{
            textAlign: "center",
            padding: "10px",
            background: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.15)",
            borderRadius: "8px",
            color: isLight ? "#6D7175" : "rgba(255,255,255,0.7)",
            fontSize: "13px",
            fontWeight: "600",
          }}>
            ✓ Active Plan
          </div>
        ) : displayPlan.planKey && isUpgrade ? (
          <Form method="post">
            <input type="hidden" name="actionType" value="subscribe" />
            <input type="hidden" name="planKey" value={displayPlan.planKey} />
            <button type="submit" style={{
              width: "100%",
              padding: "12px 16px",
              background: displayPlan.highlight ? "#ffffff" : "#2C6ECB",
              color: displayPlan.highlight ? "#2C6ECB" : "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              opacity: isSubmitting && submittingPlan === displayPlan.planKey ? 0.7 : 1,
            }}>
              {isSubmitting && submittingPlan === displayPlan.planKey ? "Processing…" : (
                <>Upgrade to {displayPlan.label} <ArrowRight size={14} /></>
              )}
            </button>
          </Form>
        ) : isDowngrade ? (
          <div style={{
            textAlign: "center",
            color: isLight ? "#8C9196" : "rgba(255,255,255,0.5)",
            fontSize: "12px",
          }}>
            Cancel current plan to switch
          </div>
        ) : (
          <div style={{
            textAlign: "center",
            padding: "10px",
            background: "rgba(0,0,0,0.05)",
            borderRadius: "8px",
            color: "#6D7175",
            fontSize: "13px",
          }}>
            Free forever
          </div>
        )}
        {displayPlan.planKey && !isCurrent && (
          <div style={{ textAlign: "center", marginTop: "8px", color: isLight ? "#8C9196" : "rgba(255,255,255,0.5)", fontSize: "12px" }}>
            7-day free trial · Cancel anytime
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlansPage() {
  const { plan, usageCount, currentMonth } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const isSubmitting = navigation.state === "submitting";
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

        {actionData?.cancelled && (
          <Banner tone="info" title="Subscription cancelled">
            <p>Your plan has been cancelled and you&apos;ve been moved to the Free plan.</p>
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical"><p>{actionData.error}</p></Banner>
        )}

        {/* Usage summary — compact horizontal bar */}
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="600" wrap={false}>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Monthly Usage</Text>
                <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                  {currentDisplay?.label ?? plan.planName} Plan
                </Badge>
                {plan.currentPeriodEnd && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Renews {new Date(plan.currentPeriodEnd).toLocaleDateString()}
                  </Text>
                )}
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">{currentMonth}</Text>
            </BlockStack>

            <div style={{ flex: "1 1 300px", maxWidth: "400px" }}>
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">{usageCount} used</Text>
                <Text as="p" variant="bodySm" fontWeight="semibold"
                  tone={usagePct >= 90 ? "critical" : usagePct >= 70 ? undefined : "success"}>
                  {usageRemaining} remaining of {plan.monthlyLimit}
                </Text>
              </InlineStack>
              <Box paddingBlockStart="100">
                <ProgressBar
                  progress={usagePct}
                  tone={usagePct >= 90 ? "critical" : usagePct >= 70 ? "highlight" : "success"}
                  size="small"
                />
              </Box>
            </div>

            {usagePct >= 70 && plan.planName !== "pro" && (
              <Text as="p" variant="bodySm" tone={usagePct >= 90 ? "critical" : undefined}>
                {usagePct >= 90 ? "⚠️ Nearly at limit" : "Usage climbing — consider upgrading"}
              </Text>
            )}
          </InlineStack>
        </Card>

        {/* Horizontal plan cards */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingLg">Choose Your Plan</Text>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
            alignItems: "stretch",
          }}>
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
                  isSubmitting={isSubmitting}
                  submittingPlan={submittingPlan}
                />
              );
            })}
          </div>
        </BlockStack>

        {/* Feature comparison table */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Full Feature Comparison</Text>
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={[
                <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued" key="feature">Feature</Text>,
                "Free",
                "Starter",
                <Text as="span" variant="bodySm" fontWeight="semibold" tone="success" key="growth">Growth ⭐</Text>,
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
            <Text as="h2" variant="headingLg">Frequently Asked Questions</Text>
            {FAQ_ITEMS.map((item, i) => (
              <BlockStack key={i} gap="100">
                <Text as="p" variant="bodyMd" fontWeight="semibold">{item.q}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{item.a}</Text>
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
                <Text as="h2" variant="headingMd">Cancel Subscription</Text>
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

export { RouteError as ErrorBoundary } from "../components/RouteError";
