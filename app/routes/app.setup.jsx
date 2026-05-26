import { useLoaderData, useActionData, useNavigation, useNavigate, redirect, Form } from "react-router";
import {
  Page, Card, Text, BlockStack, InlineStack,
  Button, TextField, Select, ProgressBar, Badge, Box, Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const TOTAL_STEPS = 4;

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const step = parseInt(url.searchParams.get("step") || "1", 10);

  const brandVoice = await prisma.brandVoice.findUnique({ where: { shop } });
  return Response.json({ brandVoice, step: Math.min(Math.max(step, 1), TOTAL_STEPS) });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const step = parseInt(formData.get("step") || "1", 10);

  const VALID_TONES = new Set(["professional","friendly","premium","bold","scientific","warm","minimalist","playful","custom"]);
  const VALID_LANGUAGES = new Set(["en","es","fr","de","it","pt","ja","zh","ko","ar","hi","nl"]);

  if (step === 1) {
    const storeName = (formData.get("storeName") || "").slice(0, 200);
    const rawTone = formData.get("brandTone") || "professional";
    const brandTone = VALID_TONES.has(rawTone) ? rawTone : "professional";
    await prisma.brandVoice.upsert({
      where: { shop },
      update: { storeName, brandTone },
      create: { shop, storeName, brandTone },
    });
    return redirect("/app/setup?step=2");
  }

  if (step === 2) {
    const targetAudience = (formData.get("targetAudience") || "").slice(0, 500);
    const keyDifferentiators = (formData.get("keyDifferentiators") || "").slice(0, 500);
    await prisma.brandVoice.upsert({
      where: { shop },
      update: { targetAudience, keyDifferentiators },
      create: { shop, targetAudience, keyDifferentiators },
    });
    return redirect("/app/setup?step=3");
  }

  if (step === 3) {
    const targetKeywords = (formData.get("targetKeywords") || "").slice(0, 500);
    const rawLang = formData.get("language") || "en";
    const language = VALID_LANGUAGES.has(rawLang) ? rawLang : "en";
    await prisma.brandVoice.upsert({
      where: { shop },
      update: { targetKeywords, language },
      create: { shop, targetKeywords, language },
    });
    return redirect("/app/setup?step=4");
  }

  if (step === 4) {
    // Final step — mark setup complete and redirect to products
    return redirect("/app/products");
  }

  return redirect("/app/setup?step=1");
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SetupPage() {
  const { brandVoice, step } = useLoaderData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSaving = navigation.state === "submitting";
  const progress = Math.round(((step - 1) / TOTAL_STEPS) * 100);

  // Step 1 state
  const [storeName, setStoreName] = useState(brandVoice?.storeName || "");
  const [brandTone, setBrandTone] = useState(brandVoice?.brandTone || "professional");

  // Step 2 state
  const [targetAudience, setTargetAudience] = useState(brandVoice?.targetAudience || "");
  const [keyDifferentiators, setKeyDifferentiators] = useState(brandVoice?.keyDifferentiators || "");

  // Step 3 state
  const [targetKeywords, setTargetKeywords] = useState(brandVoice?.targetKeywords || "");
  const [language, setLanguage] = useState(brandVoice?.language || "en");

  const toneOptions = [
    { label: "Professional & Trustworthy", value: "professional" },
    { label: "Friendly & Conversational", value: "friendly" },
    { label: "Premium & Luxurious", value: "premium" },
    { label: "Bold & Energetic", value: "bold" },
    { label: "Scientific & Technical", value: "scientific" },
    { label: "Warm & Nurturing", value: "warm" },
    { label: "Minimalist & Clean", value: "minimalist" },
    { label: "Fun & Playful", value: "playful" },
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

  const stepTitles = [
    "Brand Identity",
    "Your Audience",
    "SEO & Language",
    "You're all set!",
  ];

  return (
    <Page title="Welcome to ContentPilot AI" subtitle="Let's set up your brand voice in 4 quick steps">
      <BlockStack gap="500">
        {/* Progress bar */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Step {step} of {TOTAL_STEPS}: {stepTitles[step - 1]}
              </Text>
              <Badge tone={step === TOTAL_STEPS ? "success" : "info"}>{step}/{TOTAL_STEPS}</Badge>
            </InlineStack>
            <ProgressBar progress={progress} tone={step === TOTAL_STEPS ? "success" : "highlight"} />
          </BlockStack>
        </Card>

        <Form method="post">
          <input type="hidden" name="step" value={step} />

          {/* Step 1: Brand Identity */}
          {step === 1 && (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">What's your brand?</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  This tells ContentPilot who it's writing for. You can always update these later in Settings.
                </Text>
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
                  helpText="The voice and personality your content should have"
                />
                <Button variant="primary" size="large" submit loading={isSaving} fullWidth>
                  Continue →
                </Button>
              </BlockStack>
            </Card>
          )}

          {/* Step 2: Audience */}
          {step === 2 && (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Who are your customers?</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  The more specific you are, the better the AI can write for your audience.
                </Text>
                <TextField
                  name="targetAudience"
                  label="Target Audience"
                  value={targetAudience}
                  onChange={setTargetAudience}
                  placeholder="e.g., Health-conscious Australians aged 25-55 interested in peptides and biohacking"
                  helpText="Age, interests, location, motivations"
                  multiline={3}
                  autoComplete="off"
                />
                <TextField
                  name="keyDifferentiators"
                  label="What makes you different?"
                  value={keyDifferentiators}
                  onChange={setKeyDifferentiators}
                  placeholder="e.g., Australian lab-tested, 99%+ purity, same-day dispatch, locally owned"
                  helpText="Unique selling points — these get woven into every description"
                  multiline={3}
                  autoComplete="off"
                />
                <InlineStack gap="300">
                  <Button onClick={() => navigate("/app/setup?step=1")}>← Back</Button>
                  <Button variant="primary" submit loading={isSaving}>Continue →</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* Step 3: SEO & Language */}
          {step === 3 && (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">SEO keywords & language</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  These are applied to every product by default. You can override per-product too.
                </Text>
                <TextField
                  name="targetKeywords"
                  label="Target Keywords"
                  value={targetKeywords}
                  onChange={setTargetKeywords}
                  placeholder="e.g., peptides Australia, BPC-157, research peptides"
                  helpText="Comma-separated. Woven naturally into descriptions and meta tags."
                  autoComplete="off"
                />
                <Select
                  name="language"
                  label="Content Language"
                  options={languageOptions}
                  value={language}
                  onChange={setLanguage}
                  helpText="All generated content will be written in this language"
                />
                <InlineStack gap="300">
                  <Button onClick={() => navigate("/app/setup?step=2")}>← Back</Button>
                  <Button variant="primary" submit loading={isSaving}>Continue →</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <Card>
              <BlockStack gap="400" inlineAlign="center">
                <Box paddingBlockStart="400">
                  <Text as="h2" variant="headingXl" alignment="center">You're ready to go!</Text>
                </Box>
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  Your brand voice is set up. ContentPilot will now write all content in your exact voice.
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" alignment="center">What's next:</Text>
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    → Pick a product and generate your first description
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    → Or use One-Click Optimise to generate content for your whole store
                  </Text>
                </BlockStack>
                <InlineStack gap="300" align="center">
                  <Button variant="primary" size="large" submit loading={isSaving}>
                    Go to Products →
                  </Button>
                  <Button onClick={() => navigate("/app/optimize")}>
                    Optimise Entire Store
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}
        </Form>
      </BlockStack>
    </Page>
  );
}
