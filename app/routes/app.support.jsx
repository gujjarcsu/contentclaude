/**
 * P6.2 — the support surface, because the listing already promises one.
 *
 * `12-OFFER.md` §6 put "Email support from the founder" and "Questions answered
 * within 1 business day" on the live App Store listing. What stood behind them
 * was a `mailto:` link, which fails silently in every direction that matters.
 *
 * This screen exists so a merchant's question is RECORDED before anything else
 * happens to it, and so the confirmation they read is true rather than
 * optimistic — see `app/utils/support.server.js` for why the ordering is the
 * whole design.
 */
import { useState } from "react";
import { useT } from "../i18n/react.jsx";
import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  TextField,
  Link,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
// The PURE module, not support.server.js: a route component that imports a
// .server.js pulls Prisma into the client bundle and the build refuses it.
import { SUBJECT_MAX, MESSAGE_MAX } from "../utils/support.js";
import { OPERATOR_EMAIL_PUBLIC } from "../utils/supportContact.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";

// NOT a second copy. I typed `const SUPPORT_EMAIL = "hello@navaal.ai"` here
// first — a literal address in a route, three hours after spending a phase
// removing literal prices from a route. It comes from supportContact.js, and a
// test asserts that matches what notify.server.js falls back to.
const SUPPORT_EMAIL = OPERATOR_EMAIL_PUBLIC;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { getOrCreatePlan } = await import("../utils/plans.server.js");
  const plan = await getOrCreatePlan(session.shop).catch(() => null);
  return Response.json({
    shopDomain: session.shop,
    planName: plan?.planName ?? "free",
    supportEmail: SUPPORT_EMAIL,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const { submitSupportRequest } = await import("../utils/support.server.js");
  const { getOrCreatePlan } = await import("../utils/plans.server.js");
  const plan = await getOrCreatePlan(session.shop).catch(() => null);

  const result = await submitSupportRequest({
    shop: session.shop,
    replyTo: formData.get("replyTo"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    planName: plan?.planName ?? null,
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  // TWO DIFFERENT TRUTHS, and the merchant gets the one that applies. Saying
  // "emailed" when it was not is the failure this whole screen exists to avoid.
  return Response.json({
    success: true,
    emailed: result.emailed,
    reference: result.id,
  });
};

export default function SupportPage() {
  const t = useT();
  const { planName, supportEmail } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const loadingThisRoute = useRouteLoading();
  const isSubmitting = navigation.state === "submitting";

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState("");

  if (loadingThisRoute) return <AppSkeleton />;

  return (
    <Page
      title={t("Get help")}
      subtitle={t("A real person reads every one of these.")}
      backAction={{ content: t("Dashboard"), onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical" title={t("That did not go through")}>
            <Text as="p" variant="bodyMd">
              {actionData.error}
            </Text>
          </Banner>
        )}

        {actionData?.success && (
          <Banner
            tone="success"
            title={actionData.emailed ? t("Got it — your question is with us") : t("Got it — your question is saved")}
          >
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                {actionData.emailed ? t("We aim to reply within one business day, to the address you gave us.") : "We have saved it and it will be picked up. The email notification did not go " +
                    "through on our side, so if you do not hear back within one business day, " +
                    `email ${supportEmail} and quote the reference below.`}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {t("Reference: {reference}", { reference: actionData.reference })}
              </Text>
            </BlockStack>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                {t("Ask us anything about the app")}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {t("Questions are answered within one business day. You are on the{v}", { v: " " })}
                <b>{planName}</b> {t("plan — we can see that, so you do not need to tell us.")}
              </Text>
            </BlockStack>

            <Form method="post">
              <BlockStack gap="400">
                <TextField
                  label={t("Your email")}
                  name="replyTo"
                  type="email"
                  value={replyTo}
                  onChange={setReplyTo}
                  autoComplete="email"
                  placeholder="you@yourstore.com"
                  helpText={t("Where we reply. It does not have to be the address on your Shopify account.")}
                  requiredIndicator
                />
                <TextField
                  label={t("Subject")}
                  name="subject"
                  value={subject}
                  onChange={setSubject}
                  autoComplete="off"
                  maxLength={SUBJECT_MAX}
                  showCharacterCount
                  requiredIndicator
                />
                <TextField
                  label={t("What is happening?")}
                  name="message"
                  value={message}
                  onChange={setMessage}
                  multiline={6}
                  autoComplete="off"
                  maxLength={MESSAGE_MAX}
                  showCharacterCount
                  helpText={t("If something looks wrong, tell us which screen and what you expected to see — that usually saves a round trip.")}
                  requiredIndicator
                />
                <InlineStack gap="300">
                  <Button submit variant="primary" loading={isSubmitting}>
                    {t("Send question")}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              {t("Other ways to reach us")}
            </Text>
            <List>
              <List.Item>
                {t("Email")} <Link url={`mailto:${supportEmail}`}>{supportEmail}</Link> {t("directly — it reaches the same inbox.")}
              </List.Item>
              <List.Item>
                <Link url="/privacy" target="_blank">
                  {t("Privacy policy")}
                </Link>{t("{v} — what we store and what we send to our AI provider.", { v: " " })}
              </List.Item>
              <List.Item>
                <Link url="/terms" target="_blank">
                  {t("Terms of service")}
                </Link>
              </List.Item>
            </List>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
