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
  List,
} from "@shopify/polaris";
import { authenticate, BILLING_TEST } from "../shopify.server";
import { BILLING_PLANS, FREE_PLAN } from "../utils/billing-plans.js";
import { getOrCreatePlan, getMonthlyUsageCount, syncBillingToPlan } from "../utils/plans.server";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Sync Shopify subscription state into our DB on every Plans page load
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
    // billing.request throws a redirect to Shopify's billing confirmation page
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
    features: [
      `${FREE_PLAN.monthlyLimit} AI generations per month`,
      "Product descriptions",
      "Meta titles & descriptions",
      "FAQ content",
    ],
    highlight: false,
    planKey: null,
  },
  {
    planName: "starter",
    label: "Starter",
    price: "$9.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.starter.monthlyLimit,
    features: [
      `${BILLING_PLANS.starter.monthlyLimit} AI generations per month`,
      "Everything in Free",
      "7-day free trial",
      "Priority support",
    ],
    highlight: false,
    planKey: BILLING_PLANS.starter.key,
  },
  {
    planName: "growth",
    label: "Growth",
    price: "$29.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.growth.monthlyLimit,
    features: [
      `${BILLING_PLANS.growth.monthlyLimit} AI generations per month`,
      "Everything in Starter",
      "7-day free trial",
      "Bulk generation jobs",
    ],
    highlight: true,
    planKey: BILLING_PLANS.growth.key,
  },
  {
    planName: "pro",
    label: "Professional",
    price: "$79.99",
    period: "/ month",
    monthlyLimit: BILLING_PLANS.pro.monthlyLimit,
    features: [
      `${BILLING_PLANS.pro.monthlyLimit} AI generations per month`,
      "Everything in Growth",
      "7-day free trial",
      "Dedicated support",
    ],
    highlight: false,
    planKey: BILLING_PLANS.pro.key,
  },
];

const PLAN_ORDER = ["free", "starter", "growth", "pro"];

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
      subtitle="Manage your ContentPilot subscription"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">

        {actionData?.cancelled && (
          <Banner tone="info" title="Subscription cancelled">
            <p>Your plan has been cancelled. You have been moved to the Free plan.</p>
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
                  {usageRemaining} remaining this month
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
                <p>You are nearly at your monthly limit. Upgrade to keep generating content without interruption.</p>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Plan cards */}
        <Layout>
          {PLAN_DISPLAY.map((displayPlan) => {
            const isCurrent = displayPlan.planName === plan.planName;
            const planIndex = PLAN_ORDER.indexOf(displayPlan.planName);
            const isUpgrade = planIndex > currentPlanIndex;
            const isDowngrade = planIndex < currentPlanIndex;

            return (
              <Layout.Section variant="oneQuarter" key={displayPlan.planName}>
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text as="h2" variant="headingMd">{displayPlan.label}</Text>
                        {displayPlan.highlight && <Badge tone="info">Most Popular</Badge>}
                        {isCurrent && <Badge tone="success">Current</Badge>}
                      </InlineStack>
                      <InlineStack gap="100" blockAlign="baseline">
                        <Text as="p" variant="heading2xl" fontWeight="bold">{displayPlan.price}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{displayPlan.period}</Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <List type="bullet">
                      {displayPlan.features.map((f) => (
                        <List.Item key={f}>{f}</List.Item>
                      ))}
                    </List>

                    <Box paddingBlockStart="200">
                      {isCurrent ? (
                        <Button disabled fullWidth>Current Plan</Button>
                      ) : displayPlan.planKey && isUpgrade ? (
                        <Form method="post">
                          <input type="hidden" name="actionType" value="subscribe" />
                          <input type="hidden" name="planKey" value={displayPlan.planKey} />
                          <Button
                            variant="primary"
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
                </Card>
              </Layout.Section>
            );
          })}
        </Layout>

        {/* Cancel subscription */}
        {plan.planName !== "free" && (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Cancel Subscription</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  You will be moved to the Free plan immediately. Any unused time will be prorated.
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
