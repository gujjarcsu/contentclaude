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

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const brandVoice = await prisma.brandVoice.findUnique({ where: { shop } });

  return Response.json({
    brandVoice: brandVoice || {
      storeName: "",
      brandTone: "professional",
      targetAudience: "",
      keyDifferentiators: "",
      avoidPhrases: "",
      sampleContent: "",
      additionalNotes: "",
      targetKeywords: "",
      language: "en",
    },
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  // Dynamic import keeps cache.server out of the client bundle
  const { invalidateCache } = await import("../utils/cache.server.js");

  const VALID_TONES = new Set([
    "professional", "friendly", "premium", "bold",
    "scientific", "warm", "minimalist", "playful", "custom",
  ]);
  const VALID_LANGUAGES = new Set([
    "en", "es", "fr", "de", "it", "pt", "ja", "zh", "ko", "ar", "hi", "nl",
  ]);

  const rawTone = formData.get("brandTone") || "professional";
  const rawLang = formData.get("language") || "en";

  const data = {
    storeName:          (formData.get("storeName") || "").slice(0, 200),
    brandTone:          VALID_TONES.has(rawTone) ? rawTone : "professional",
    targetAudience:     (formData.get("targetAudience") || "").slice(0, 500),
    keyDifferentiators: (formData.get("keyDifferentiators") || "").slice(0, 500),
    avoidPhrases:       (formData.get("avoidPhrases") || "").slice(0, 500),
    sampleContent:      (formData.get("sampleContent") || "").slice(0, 5000),
    additionalNotes:    (formData.get("additionalNotes") || "").slice(0, 500),
    targetKeywords:     (formData.get("targetKeywords") || "").slice(0, 500),
    language:           VALID_LANGUAGES.has(rawLang) ? rawLang : "en",
  };

  await prisma.brandVoice.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });

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
  const [targetKeywords, setTargetKeywords] = useState(brandVoice.targetKeywords || "");
  const [language, setLanguage] = useState(brandVoice.language || "en");

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

  const languageOptions = [
    { label: "English", value: "en" },
    { label: "Spanish", value: "es" },
    { label: "French", value: "fr" },
    { label: "German", value: "de" },
    { label: "Italian", value: "it" },
    { label: "Portuguese", value: "pt" },
    { label: "Japanese", value: "ja" },
    { label: "Chinese (Simplified)", value: "zh" },
    { label: "Korean", value: "ko" },
    { label: "Arabic", value: "ar" },
    { label: "Hindi", value: "hi" },
    { label: "Dutch", value: "nl" },
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
              Add your Anthropic API key to the .env file: ANTHROPIC_API_KEY=sk-ant-your-key-here
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

                    <Select
                      name="language"
                      label="Content Language"
                      options={languageOptions}
                      value={language}
                      onChange={setLanguage}
                      helpText="All generated content will be written in this language"
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

                {/* SEO Keywords */}
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingLg">SEO Keyword Targeting</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Global keywords the AI will naturally incorporate into all generated content.
                      You can also set per-product keywords on the product detail page.
                    </Text>

                    <TextField
                      name="targetKeywords"
                      label="Target Keywords"
                      value={targetKeywords}
                      onChange={setTargetKeywords}
                      placeholder="e.g., peptides Australia, research peptides, buy BPC-157"
                      helpText="Comma-separated. These will be woven naturally into descriptions and meta tags."
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
                      helpText="What sets you apart? These will be woven into all content naturally."
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
                      Paste 2-3 of your best existing product descriptions.
                      The AI will analyze your writing style and match it in all future generations.
                    </Text>

                    <TextField
                      name="sampleContent"
                      label="Your Best Product Descriptions (paste 2-3)"
                      value={sampleContent}
                      onChange={setSampleContent}
                      placeholder="Paste your favorite product descriptions here…"
                      multiline={8}
                      autoComplete="off"
                    />

                    <TextField
                      name="additionalNotes"
                      label="Additional Notes or Guidelines"
                      value={additionalNotes}
                      onChange={setAdditionalNotes}
                      placeholder="e.g., Always mention that we ship from Sydney. Never make medical claims."
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

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Tips for Better Content</Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      <strong>Be specific with your audience.</strong> "Health-conscious
                      Australian men 30-50" beats "everyone."
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Add real keywords.</strong> Keywords are naturally woven
                      into descriptions and meta tags — no stuffing.
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Include real differentiators.</strong> "Australian lab
                      tested with COA available" beats "high quality."
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Paste real examples.</strong> Sample descriptions are
                      the most powerful way to match your exact voice.
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Use the language selector</strong> to generate content
                      in Spanish, French, German, and 8 other languages.
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
