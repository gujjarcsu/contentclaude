import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Box,
  ProgressBar,
  Badge,
  Divider,
} from "@shopify/polaris";
import { Check, Zap, Star, Rocket, Building2 } from "lucide-react";
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
    await billing.request({
      plan: planKey,
      isTest: BILLING_TEST,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/plans`,
    });
  }

  if (actionType === "cancel") {
    const { appSubscriptions } = await billing.check({
      plans: Object.values(BILLING_PLANS).map((p) => p.key),
      isTest: BILLING_TEST,
    });
    const activeSub = appSubscriptions.find((s) => s.status === "ACTIVE");
    if (activeSub) {
      await billing.cancel({
        subscriptionId: activeSub.id,
        isTest: BILLING_TEST,
        prorate: true,
      });
    }
    return Response.json({ cancelled: true });
  }

  return Response.json({ error: "Unknown action." });
};

const PLAN_DISPLAY = [
  {
    planName: "free",
    label: "Free",
    price: "$0",
    period: "forever",
    monthlyLimit: FREE_PLAN.monthlyLimit,
    icon: <Zap size={22} color="#8C9196" />,
    highlight: false,
    planKey: null,
    features: [
      `${FREE_PLAN.monthlyLimit} AI generations / month`,
      "Product descriptions",
      "Meta titles & descriptions",
      "FAQ content",
      "Image alt text",
      "Brand voice settings",
    ],
    notIncluded: ["Bulk generation jobs", "A/B variant testing", "Priority support"],
  },
  {
    planName: "starter",
    label: "Starter",
    price: "$9.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.starter.monthlyLimit,
    icon: <Star size={22} color="#1656AC" />,
    highlight: false,
    planKey: BILLING_PLANS.starter.key,
    features: [
      `${BILLING_PLANS.starter.monthlyLimit} AI generations / month`,
      "Everything in Free",
      "7-day free trial",
      "Content templates",
      "Version history",
      "Priority support",
    ],
    notIncluded: ["Bulk generation jobs", "A/B variant testing"],
  },
  {
    planName: "growth",
    label: "Growth",
    price: "$29.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.growth.monthlyLimit,
    icon: <Rocket size={22} color="#fff" />,
    highlight: true,
    planKey: BILLING_PLANS.growth.key,
    features: [
      `${BILLING_PLANS.growth.monthlyLimit} AI generations / month`,
      "Everything in Starter",
      "7-day free trial",
      "Bulk generation jobs",
      "A/B variant testing",
      "Autopilot mode",
    ],
    notIncluded: [],
  },
  {
    planName: "pro",
    label: "Professional",
    price: "$79.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.pro.monthlyLimit,
    icon: <Building2 size={22} color="#1656AC" />,
    highlight: false,
    planKey: BILLING_PLANS.pro.key,
    features: [
      `${BILLING_PLANS.pro.monthlyLimit} AI generations / month`,
      "Everything in Growth",
      "7-day free trial",
      "Dedicated account manager",
      "Custom onboarding",
      "SLA support",
    ],
    notIncluded: [],
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
  { feature: "A/B variant testing", free: false, starter: false, growth: true, pro: true },
  { feature: "Autopilot mode", free: false, starter: false, growth: true, pro: true },
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
    a: "Each time you generate content for a product (description, meta title/description, or FAQ) counts as one generation, regardless of how many content types are selected in that run.",
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

  return (
    <Page
      title="Plans & Billing"
      subtitle="Manage your ContentClaude subscription"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="600">

        {actionData?.cancelled && (
          <Banner tone="info" title="Subscription cancelled">
            <p>Your plan has been cancelled and you've been moved to the Free plan.</p>
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical"><p>{actionData.error}</p></Banner>
        )}

        {/* Current usage card */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Current Usage — {currentMonth}</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                    {PLAN_DISPLAY.find((p) => p.planName === plan.planName)?.label ?? plan.planName} Plan
                  </Badge>
                  {plan.currentPeriodEnd && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Renews {new Date(plan.currentPeriodEnd).toLocaleDateString()}
                    </Text>
                  )}
                </InlineStack>
              </BlockStack>
              <BlockStack gap="100" inlineAlign="end">
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {usageCount} / {plan.monthlyLimit}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {usageRemaining} generations remaining
                </Text>
              </BlockStack>
            </InlineStack>

            <ProgressBar
              progress={usagePct}
              tone={usagePct >= 90 ? "critical" : usagePct >= 70 ? "highlight" : "success"}
              size="medium"
            />

            {usagePct >= 90 && (
              <Banner tone="warning">
                <p>You're nearly at your monthly limit. Upgrade now to avoid interruption.</p>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Plan cards */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingLg">Choose Your Plan</Text>
          <Layout>
            {PLAN_DISPLAY.map((displayPlan) => {
              const isCurrent = displayPlan.planName === plan.planName;
              const planIndex = PLAN_ORDER.indexOf(displayPlan.planName);
              const isUpgrade = planIndex > currentPlanIndex;
              const isDowngrade = planIndex < currentPlanIndex;

              return (
                <Layout.Section variant="oneQuarter" key={displayPlan.planName}>
                  <Box
                    background={displayPlan.highlight ? "bg-fill-brand" : "bg-surface"}
                    borderRadius="300"
                    padding="400"
                    borderWidth="025"
                    borderColor={displayPlan.highlight ? "border-brand" : "border"}
                  >
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          {displayPlan.icon}
                          <InlineStack gap="100">
                            {displayPlan.highlight && (
                              <Badge tone={displayPlan.highlight ? "success" : "info"}>
                                Most Popular
                              </Badge>
                            )}
                            {isCurrent && <Badge tone="success">Current</Badge>}
                          </InlineStack>
                        </InlineStack>
                        <Text
                          as="h2"
                          variant="headingLg"
                          tone={displayPlan.highlight ? "text-inverse" : undefined}
                        >
                          {displayPlan.label}
                        </Text>
                        <InlineStack gap="100" blockAlign="baseline">
                          <Text
                            as="p"
                            variant="heading2xl"
                            fontWeight="bold"
                            tone={displayPlan.highlight ? "text-inverse" : undefined}
                          >
                            {displayPlan.price}
                          </Text>
                          <Text
                            as="p"
                            variant="bodySm"
                            tone={displayPlan.highlight ? "text-inverse" : "subdued"}
                          >
                            {displayPlan.period}
                          </Text>
                        </InlineStack>
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="200">
                        {displayPlan.features.map((f) => (
                          <InlineStack key={f} gap="200" blockAlign="start">
                            <Box paddingBlockStart="050">
                              <Check
                                size={14}
                                color={displayPlan.highlight ? "#fff" : "#00A047"}
                              />
                            </Box>
                            <Text
                              as="p"
                              variant="bodySm"
                              tone={displayPlan.highlight ? "text-inverse" : undefined}
                            >
                              {f}
                            </Text>
                          </InlineStack>
                        ))}
                      </BlockStack>

                      <Box paddingBlockStart="200">
                        {isCurrent ? (
                          <Button disabled fullWidth>Current Plan</Button>
                        ) : displayPlan.planKey && isUpgrade ? (
                          <Form method="post">
                            <input type="hidden" name="actionType" value="subscribe" />
                            <input type="hidden" name="planKey" value={displayPlan.planKey} />
                            <Button
                              variant={displayPlan.highlight ? "secondary" : "primary"}
                              fullWidth
                              submit
                              loading={isSubmitting && submittingPlan === displayPlan.planKey}
                            >
                              Upgrade to {displayPlan.label}
                            </Button>
                          </Form>
                        ) : isDowngrade ? (
                          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                            Cancel current plan to switch
                          </Text>
                        ) : (
                          <Button disabled fullWidth>Free Forever</Button>
                        )}
                      </Box>
                    </BlockStack>
                  </Box>
                </Layout.Section>
              );
            })}
          </Layout>
        </BlockStack>

        {/* Feature comparison table */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Feature Comparison</Text>
            <Box overflowX="scroll">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #e1e3e5" }}>
                      <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued">Feature</Text>
                    </th>
                    {["Free", "Starter", "Growth", "Pro"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "center",
                          padding: "8px 12px",
                          borderBottom: "1px solid #e1e3e5",
                          background: h === "Growth" ? "#f3f0ff" : undefined,
                        }}
                      >
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {h}
                        </Text>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_TABLE.map((row, i) => (
                    <tr key={row.feature} style={{ background: i % 2 === 0 ? undefined : "#fafafa" }}>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f2f3" }}>
                        <Text as="span" variant="bodySm">{row.feature}</Text>
                      </td>
                      {["free", "starter", "growth", "pro"].map((p) => (
                        <td
                          key={p}
                          style={{
                            textAlign: "center",
                            padding: "8px 12px",
                            borderBottom: "1px solid #f1f2f3",
                            background: p === "growth" ? "#f9f8ff" : undefined,
                          }}
                        >
                          <FeatureCell value={row[p]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
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

        {/* Cancel subscription */}
        {plan.planName !== "free" && (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Cancel Subscription</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  You'll be moved to the Free plan. Unused time is prorated.
                </Text>
              </BlockStack>
              <Form method="post">
                <input type="hidden" name="actionType" value="cancel" />
                <Button
                  tone="critical"
                  variant="plain"
                  submit
                  loading={isSubmitting && isCancelling}
                >
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
