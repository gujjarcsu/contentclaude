// app/routes/app.settings.jsx
// ContentPilot AI - Brand Voice Settings

import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Select,
  Button,
  Banner,
  Box,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { invalidateCache } from "../utils/cache.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const brandVoice = await prisma.brandVoice.findUnique({
    where: { shop },
  });

  return Response.json({
    brandVoice: brandVoice || {
      storeName: "",
      brandTone: "professional",
      targetAudience: "",
      keyDifferentiators: "",
      avoidPhrases: "",
      sampleContent: "",
      additionalNotes: "",
    },
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const VALID_TONES = new Set([
    "professional", "friendly", "premium", "bold",
    "scientific", "warm", "minimalist", "playful", "custom",
  ]);
  const rawTone = formData.get("brandTone") || "professional";
  const rawSample = (formData.get("sampleContent") || "").slice(0, 5000);

  const data = {
    storeName: (formData.get("storeName") || "").slice(0, 200),
    brandTone: VALID_TONES.has(rawTone) ? rawTone : "professional",
    targetAudience: (formData.get("targetAudience") || "").slice(0, 500),
    keyDifferentiators: (formData.get("keyDifferentiators") || "").slice(0, 500),
    avoidPhrases: (formData.get("avoidPhrases") || "").slice(0, 500),
    sampleContent: rawSample,
    additionalNotes: (formData.get("additionalNotes") || "").slice(0, 500),
  };

  await prisma.brandVoice.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });

  // Bust the cached brand voice so the next generation uses fresh settings
  await invalidateCache(`bv:${shop}`);

  return Response.json({ success: true, message: "Brand voice settings saved!" });
};

export default function SettingsPage() {
  const { brandVoice, hasApiKey } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const navigate = useNavigate();
  const isSaving = navigation.state === "submitting";

  const [storeName, setStoreName] = useState(brandVoice.storeName);
  const [brandTone, setBrandTone] = useState(brandVoice.brandTone);
  const [targetAudience, setTargetAudience] = useState(brandVoice.targetAudience);
  const [keyDifferentiators, setKeyDifferentiators] = useState(brandVoice.keyDifferentiators);
  const [avoidPhrases, setAvoidPhrases] = useState(brandVoice.avoidPhrases);
  const [sampleContent, setSampleContent] = useState(brandVoice.sampleContent);
  const [additionalNotes, setAdditionalNotes] = useState(brandVoice.additionalNotes);

  const toneOptions = [
    { label: "Professional & Trustworthy", value: "professional" },
    { label: "Friendly & Conversational", value: "friendly" },
    { label: "Premium & Luxurious", value: "premium" },
    { label: "Bold & Energetic", value: "bold" },
    { label: "Scientific & Technical", value: "scientific" },
    { label: "Warm & Nurturing", value: "warm" },
    { label: "Minimalist & Clean", value: "minimalist" },
    { label: "Fun & Playful", value: "playful" },
    { label: "Custom (describe in notes)", value: "custom" },
  ];

  return (
    <Page
      title="Brand Voice Settings"
      subtitle="Configure how ContentPilot writes for your brand"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner tone="success" title="Saved!">
            <p>{actionData.message}</p>
          </Banner>
        )}

        {!hasApiKey && (
          <Banner tone="critical" title="API Key Required">
            <p>
              Add your Anthropic API key to the .env file in your project root:
              ANTHROPIC_API_KEY=sk-ant-your-key-here
            </p>
          </Banner>
        )}

        <Form method="post">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* Basic Info */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Store Identity</Text>

                  <TextField
                    name="storeName"
                    label="Store Name"
                    value={storeName}
                    onChange={setStoreName}
                    placeholder="e.g., Elite Peps Australia"
                    helpText="Your brand name as it should appear in content"
                    autoComplete="off"
                  />

                  <Select
                    name="brandTone"
                    label="Brand Tone"
                    options={toneOptions}
                    value={brandTone}
                    onChange={setBrandTone}
                    helpText="The overall voice and personality of your brand"
                  />

                  <TextField
                    name="targetAudience"
                    label="Target Audience"
                    value={targetAudience}
                    onChange={setTargetAudience}
                    placeholder="e.g., Health-conscious Australians aged 25-55 looking for premium research peptides"
                    helpText="Who are your customers? Be specific — age, interests, needs, location"
                    multiline={3}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              {/* Differentiators */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">What Makes You Unique</Text>

                  <TextField
                    name="keyDifferentiators"
                    label="Key Differentiators"
                    value={keyDifferentiators}
                    onChange={setKeyDifferentiators}
                    placeholder="e.g., Australian lab tested, 99%+ purity guaranteed, same-day dispatch, locally owned"
                    helpText="What sets you apart from competitors? These will be woven into all content naturally."
                    multiline={3}
                    autoComplete="off"
                  />

                  <TextField
                    name="avoidPhrases"
                    label="Phrases & Styles to Avoid"
                    value={avoidPhrases}
                    onChange={setAvoidPhrases}
                    placeholder="e.g., Don't sound like a cheap dropshipper. Avoid hype words like 'amazing' or 'revolutionary'. Don't use emojis."
                    helpText="What should the AI NOT sound like? Be specific."
                    multiline={3}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              {/* Sample Content */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Train the AI on Your Voice</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Paste 2-3 of your best existing product descriptions below.
                    The AI will analyze your writing style and match it in all
                    future generations. This is the single most important setting
                    for content quality.
                  </Text>

                  <TextField
                    name="sampleContent"
                    label="Your Best Product Descriptions (paste 2-3)"
                    value={sampleContent}
                    onChange={setSampleContent}
                    placeholder="Paste your favorite product descriptions here. The ones you wrote yourself and are proud of. The AI will learn your voice from these..."
                    multiline={8}
                    autoComplete="off"
                  />

                  <TextField
                    name="additionalNotes"
                    label="Additional Notes or Guidelines"
                    value={additionalNotes}
                    onChange={setAdditionalNotes}
                    placeholder="e.g., Always mention that we ship from Sydney. Never make medical claims. Include storage instructions when relevant."
                    helpText="Any other rules the AI should follow when writing for your store"
                    multiline={3}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              <Button
                variant="primary"
                size="large"
                submit
                loading={isSaving}
                fullWidth
              >
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </BlockStack>
          </Layout.Section>

          {/* Right sidebar - tips */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Tips for Better Content</Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    <strong>Be specific with your audience.</strong> "Health-conscious
                    Australian men 30-50" is better than "everyone."
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Include real differentiators.</strong> "Australian lab
                    tested with COA available" is better than "high quality."
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Paste real examples.</strong> The sample descriptions
                    are the most powerful way to train the AI on your exact voice.
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Tell it what to avoid.</strong> "Don't sound like a
                    generic supplement store" gives the AI guardrails.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        </Form>
      </BlockStack>
    </Page>
  );
}
