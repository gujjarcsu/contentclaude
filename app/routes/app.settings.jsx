import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  Modal,
  ChoiceList,
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Banner,
  Box,
  Checkbox,
  Divider,
  Badge,
} from "@shopify/polaris";
import { useState, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const { getOrCreatePlan } = await import("../utils/plans.server.js");
  const { getEntitlements } = await import("../utils/billing-plans.js");

  const [brandVoice, templates, plan] = await Promise.all([
    prisma.brandVoice.findUnique({ where: { shop } }),
    prisma.contentTemplate.findMany({ where: { shop }, orderBy: { createdAt: "asc" } }),
    getOrCreatePlan(shop),
  ]);

  return Response.json({
    planName: plan.planName,
    entitlements: getEntitlements(plan.planName),
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
      autopilotEnabled: false,
      autopilotAutoPublish: false,
      publishWithoutReview: false,
      autopilotContentTypes: "description,metaTitle,metaDescription",
    },
    templates,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType") || "saveBrandVoice";

  const { invalidateCache } = await import("../utils/cache.server.js");
  const { checkEntitlement } = await import("../utils/plans.server.js");

  // Content templates are sold as Starter+ on the pricing table — the gate
  // must actually exist server-side (requirement 4.2.1: advertised == enforced).
  if (actionType === "saveTemplate" || actionType === "deleteTemplate") {
    const ent = await checkEntitlement(shop, "contentTemplates");
    if (!ent.allowed) {
      return Response.json({
        error: `Content templates require the ${ent.requiredPlan ?? "Starter"} plan. Upgrade to unlock this feature.`,
        limitReached: true,
      });
    }
  }

  if (actionType === "saveTemplate") {
    const name = (formData.get("tplName") || "").slice(0, 100).trim();
    if (!name) return Response.json({ error: "Template name is required." });
    const tplContentTypes =
      ["description", "metaTitle", "metaDescription", "faq"]
        .filter((t) => formData.get(`tpl_${t}`) === "true")
        .join(",") || "description,metaTitle,metaDescription";
    const isDefault = formData.get("tplDefault") === "true";
    if (isDefault) {
      await prisma.contentTemplate.updateMany({ where: { shop }, data: { isDefault: false } });
    }
    await prisma.contentTemplate.create({
      data: {
        shop,
        name,
        contentLength: formData.get("tplLength") || "standard",
        contentTypes: tplContentTypes,
        keywords: (formData.get("tplKeywords") || "").slice(0, 500),
        customInstructions: (formData.get("tplInstructions") || "").slice(0, 1000),
        isDefault,
      },
    });
    return Response.json({ success: true, message: "Template saved!" });
  }

  if (actionType === "deleteTemplate") {
    const id = formData.get("templateId");
    await prisma.contentTemplate.deleteMany({ where: { id, shop } });
    return Response.json({ success: true, message: "Template deleted." });
  }

  const VALID_TONES = new Set([
    "professional",
    "friendly",
    "premium",
    "bold",
    "scientific",
    "warm",
    "minimalist",
    "playful",
    "custom",
  ]);
  const VALID_LANGUAGES = new Set(["en", "es", "fr", "de", "it", "pt", "ja", "zh", "ko", "ar", "hi", "nl"]);

  const rawTone = formData.get("brandTone") || "professional";
  const rawLang = formData.get("language") || "en";

  const autopilotContentTypes =
    ["description", "metaTitle", "metaDescription", "faq"]
      .filter((t) => formData.get(`ap_${t}`) === "true")
      .join(",") || "description,metaTitle,metaDescription";

  // Autopilot is Growth+. If a free/starter plan tries to enable it, DON'T
  // reject the whole save (that silently lost the merchant's store name, tone,
  // etc. — a worse bug than the gate). Instead persist everything else, force
  // autopilot off, and return a soft notice.
  let autopilotEnabled = formData.get("autopilotEnabled") === "true";
  let autopilotNotice = null;
  if (autopilotEnabled) {
    const apEnt = await checkEntitlement(shop, "autopilot");
    if (!apEnt.allowed) {
      autopilotEnabled = false;
      autopilotNotice = `Your settings were saved, but Autopilot stays off — it requires the ${apEnt.requiredPlan ?? "Growth"} plan.`;
    }
  }

  const data = {
    storeName: (formData.get("storeName") || "").slice(0, 200),
    brandTone: VALID_TONES.has(rawTone) ? rawTone : "professional",
    targetAudience: (formData.get("targetAudience") || "").slice(0, 500),
    keyDifferentiators: (formData.get("keyDifferentiators") || "").slice(0, 500),
    avoidPhrases: (formData.get("avoidPhrases") || "").slice(0, 500),
    sampleContent: (formData.get("sampleContent") || "").slice(0, 5000),
    additionalNotes: (formData.get("additionalNotes") || "").slice(0, 500),
    targetKeywords: (formData.get("targetKeywords") || "").slice(0, 500),
    language: VALID_LANGUAGES.has(rawLang) ? rawLang : "en",
    autopilotEnabled,
    autopilotAutoPublish: autopilotEnabled && formData.get("autopilotAutoPublish") === "true",
    // Phase 2 item 2.6 - the ONE place auto-publish is decided.
    publishWithoutReview: formData.get("publishWithoutReview") === "true",
    autopilotContentTypes,
  };

  await prisma.brandVoice.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });

  await invalidateCache(`bv:${shop}`);
  return Response.json({
    success: true,
    message: autopilotNotice || "Settings saved!",
    autopilotBlocked: !!autopilotNotice,
  });
};

const TONE_CARDS = [
  { value: "professional", label: "Professional", desc: "Authoritative & trustworthy" },
  { value: "friendly", label: "Friendly", desc: "Warm & conversational" },
  { value: "premium", label: "Premium", desc: "Luxury & aspirational" },
  { value: "bold", label: "Bold", desc: "High energy & direct" },
  { value: "scientific", label: "Scientific", desc: "Technical & evidence-based" },
  { value: "warm", label: "Warm", desc: "Nurturing & empathetic" },
  { value: "minimalist", label: "Minimalist", desc: "Clean & understated" },
  { value: "playful", label: "Playful", desc: "Fun & engaging" },
  { value: "custom", label: "Custom", desc: "Define your own tone" },
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

const lengthOptions = [
  { label: "Short (~100-150 words)", value: "short" },
  { label: "Standard (~200-300 words)", value: "standard" },
  { label: "Detailed (~400-500 words)", value: "detailed" },
];

export default function SettingsPage() {
  const { brandVoice, templates, entitlements } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const loadingThisRoute = useRouteLoading();
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

  const [autopilotEnabled, setAutopilotEnabled] = useState(brandVoice.autopilotEnabled || false);
  const [publishWithoutReview, setPublishWithoutReview] = useState(brandVoice.publishWithoutReview || false);
  const [confirmPublishWithoutReview, setConfirmPublishWithoutReview] = useState(false);
  const [autopilotAutoPublish, setAutopilotAutoPublish] = useState(brandVoice.autopilotAutoPublish || false);
  const apTypes = (brandVoice.autopilotContentTypes || "description,metaTitle,metaDescription").split(",");
  const [apDesc, setApDesc] = useState(apTypes.includes("description"));
  const [apMeta, setApMeta] = useState(apTypes.includes("metaTitle"));
  const [apFaq, setApFaq] = useState(apTypes.includes("faq"));

  const [tplName, setTplName] = useState("");
  const [tplLength, setTplLength] = useState("standard");
  const [tplDesc, setTplDesc] = useState(true);
  const [tplMeta, setTplMeta] = useState(true);
  const [tplFaq, setTplFaq] = useState(false);
  const [tplKeywords, setTplKeywords] = useState("");
  const [tplInstructions, setTplInstructions] = useState("");
  const [tplDefault, setTplDefault] = useState(false);

  const prevActionData = useRef(null);

  useEffect(() => {
    if (actionData && actionData !== prevActionData.current) {
      prevActionData.current = actionData;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        if (actionData.success) {
          window.shopify.toast.show(actionData.message ?? "Saved!", { duration: 4000 });
        } else if (actionData.error) {
          window.shopify.toast.show(actionData.error, { duration: 5000, isError: true });
        }
      }
    }
  }, [actionData]);

  // Instant feedback while navigating into Settings — single page-level skeleton.
  if (loadingThisRoute) {
    return <AppSkeleton title="Settings" sections={3} layout="twoThird" />;
  }

  return (
    <Page
      title="Settings"
      subtitle="Brand voice, autopilot, and content templates"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {actionData?.error && !actionData?.success && (
          <Banner tone="critical">
            <p>{actionData.error}</p>
          </Banner>
        )}

        <Form method="post">
          <input type="hidden" name="actionType" value="saveBrandVoice" />
          <input type="hidden" name="autopilotEnabled" value={autopilotEnabled.toString()} />
          <input type="hidden" name="publishWithoutReview" value={publishWithoutReview.toString()} />
          <input type="hidden" name="autopilotAutoPublish" value={autopilotAutoPublish.toString()} />
          <input type="hidden" name="ap_description" value={apDesc.toString()} />
          {/* The checkbox says "Meta Title & Description" — it must submit BOTH
              fields, or Autopilot can never generate a meta description. */}
          <input type="hidden" name="ap_metaTitle" value={apMeta.toString()} />
          <input type="hidden" name="ap_metaDescription" value={apMeta.toString()} />
          <input type="hidden" name="ap_faq" value={apFaq.toString()} />

          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                {/* Store Identity */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        Store Identity
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Tell the AI who you are — the more specific, the better the output.
                      </Text>
                    </BlockStack>
                    <TextField
                      name="storeName"
                      label="Store Name"
                      value={storeName}
                      onChange={setStoreName}
                      placeholder="e.g., Elite Botanics Australia"
                      autoComplete="off"
                    />
                    <Select
                      name="language"
                      label="Content Language"
                      options={languageOptions}
                      value={language}
                      onChange={setLanguage}
                    />
                    <TextField
                      name="targetAudience"
                      label="Target Audience"
                      value={targetAudience}
                      onChange={setTargetAudience}
                      multiline={3}
                      autoComplete="off"
                      placeholder="e.g., Health-conscious Australians aged 25-55"
                    />
                  </BlockStack>
                </Card>

                {/* Brand Tone — visual selector */}
                <Card>
                  <BlockStack gap="400">
                    <input type="hidden" name="brandTone" value={brandTone} />
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        Brand Tone
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        How should your content sound? Click to select.
                      </Text>
                    </BlockStack>
                    {/* Phase 2 item 2.5 — this was a CSS grid of nine raw
                        <button style> elements with hard-coded hex, and the
                        selected one was indicated by color alone: a 1px grey
                        border became a 2px blue one and the background shifted
                        to #f3f7ff. Color-only status fails contrast and fails
                        anyone who cannot distinguish those two.

                        A Polaris ChoiceList is the component for "pick exactly
                        one of these", and it renders a real radio group: keyboard
                        arrows work, the selection is announced, and it needs no
                        styling at all. The emoji went with it (item 2.5) — a
                        briefcase and a microscope were carrying meaning that the
                        label and the description already carry. */}
                    <ChoiceList
                      title="Brand tone"
                      titleHidden
                      choices={TONE_CARDS.map((card) => ({
                        label: card.label,
                        value: card.value,
                        helpText: card.desc,
                      }))}
                      selected={[brandTone]}
                      onChange={([value]) => setBrandTone(value)}
                    />
                  </BlockStack>
                </Card>

                {/* SEO Keywords */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        SEO Keyword Targeting
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        These keywords are woven naturally into all generated content.
                      </Text>
                    </BlockStack>
                    <TextField
                      name="targetKeywords"
                      label="Target Keywords"
                      value={targetKeywords}
                      onChange={setTargetKeywords}
                      autoComplete="off"
                      placeholder="e.g., organic skincare Australia, buy Vitamin C"
                      helpText="Comma-separated. Override per-product on the Generate page."
                    />
                  </BlockStack>
                </Card>

                {/* Differentiators */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        What Makes You Unique
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        These details are injected into every piece of content to reinforce your brand.
                      </Text>
                    </BlockStack>
                    <TextField
                      name="keyDifferentiators"
                      label="Key Differentiators"
                      value={keyDifferentiators}
                      onChange={setKeyDifferentiators}
                      multiline={3}
                      autoComplete="off"
                      placeholder="e.g., Australian lab tested, sustainably sourced, fast dispatch"
                    />
                    <TextField
                      name="avoidPhrases"
                      label="Phrases & Styles to Avoid"
                      value={avoidPhrases}
                      onChange={setAvoidPhrases}
                      multiline={3}
                      autoComplete="off"
                      placeholder="e.g., No hype words. No emojis. Never say 'revolutionary'."
                    />
                  </BlockStack>
                </Card>

                {/* Sample Content */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        Train the AI on Your Voice
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Paste 2–3 of your best product descriptions. This is the most powerful way to match
                        your exact voice.
                      </Text>
                    </BlockStack>
                    <TextField
                      name="sampleContent"
                      label="Your Best Product Descriptions"
                      value={sampleContent}
                      onChange={setSampleContent}
                      multiline={8}
                      autoComplete="off"
                      placeholder="Paste your favorite product descriptions here..."
                    />
                    <TextField
                      name="additionalNotes"
                      label="Additional Guidelines"
                      value={additionalNotes}
                      onChange={setAdditionalNotes}
                      multiline={3}
                      autoComplete="off"
                      placeholder="e.g., Always mention free shipping. Never make unsubstantiated claims."
                    />
                  </BlockStack>
                </Card>

                {/* Phase 2 item 2.6 — auto-publish, in ONE place.

                    It used to be a per-run checkbox in five: the product page,
                    the Products bulk panel, the Generate All modal, and twice on
                    Optimize. The bulk panel had no confirmation at all, and a
                    bug on the product page skipped the confirm on five of its
                    seven generate paths — so the small grey "Regenerate" link
                    beside a description could overwrite the live storefront with
                    no dialog and no undo.

                    The App Store listing tells merchants nothing goes live until
                    they approve it. That promise cannot depend on which of five
                    checkboxes was last ticked. */}
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingLg">
                          Review before publishing
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Generated content is saved as a draft for you to read first.
                        </Text>
                      </BlockStack>
                      {publishWithoutReview && <Badge tone="attention">Review is off</Badge>}
                    </InlineStack>

                    <Checkbox
                      label="Publish without review"
                      checked={publishWithoutReview}
                      helpText="Content goes straight to your live storefront. Nothing is held for approval."
                      onChange={(value) => {
                        // Turning it ON asks first. Turning it OFF is the safe
                        // direction and needs no ceremony.
                        if (value) setConfirmPublishWithoutReview(true);
                        else setPublishWithoutReview(false);
                      }}
                    />
                  </BlockStack>
                </Card>
                {/* Autopilot */}
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingLg">
                          Autopilot Mode
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Automatically generate content when a new product is added to your store.
                        </Text>
                      </BlockStack>
                      {autopilotEnabled && <Badge tone="success">Active</Badge>}
                    </InlineStack>

                    <Checkbox
                      label="Enable Autopilot"
                      checked={autopilotEnabled}
                      onChange={setAutopilotEnabled}
                      helpText="New products are picked up automatically once this is on."
                    />

                    {autopilotEnabled && (
                      <BlockStack gap="300">
                        <Divider />
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Content to auto-generate:
                        </Text>
                        <InlineStack gap="400" wrap>
                          <Checkbox label="Description" checked={apDesc} onChange={setApDesc} />
                          <Checkbox label="Meta Title & Description" checked={apMeta} onChange={setApMeta} />
                          <Checkbox label="FAQ" checked={apFaq} onChange={setApFaq} />
                        </InlineStack>
                        <Checkbox
                          label="Auto-publish immediately (skip review)"
                          checked={autopilotAutoPublish}
                          onChange={setAutopilotAutoPublish}
                          helpText="Content goes live on Shopify without a review step"
                        />
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>

                <Button variant="primary" size="large" submit loading={isSaving} fullWidth>
                  {isSaving ? "Saving..." : "Save Settings"}
                </Button>
              </BlockStack>
            </Layout.Section>

            {/* Sidebar */}
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Tips for Better Content
                    </Text>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        <strong>Be specific with your audience.</strong> "Active women aged 25-45 who love
                        outdoor sports" beats "everyone."
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>Add real keywords.</strong> Woven naturally — no keyword stuffing.
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>Real differentiators win.</strong> "Lab tested with COA" beats "high quality."
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>Paste real examples.</strong> The single most powerful way to clone your
                        voice.
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Tone Guide
                    </Text>
                    <BlockStack gap="200">
                      {TONE_CARDS.slice(0, 4).map((card) => (
                        <Text key={card.value} as="p" variant="bodySm">
                          <strong>{card.label}</strong> — {card.desc}
                        </Text>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </Form>

        {/* Re-run wizard */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Brand Voice Setup Wizard
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Re-run the guided setup to update your brand voice settings.
              </Text>
            </BlockStack>
            <Button onClick={() => navigate("/app/setup")}>Re-run onboarding wizard</Button>
          </InlineStack>
        </Card>

        {/* Content Templates — Starter+ (matches the pricing table) */}
        {!entitlements?.contentTemplates ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">
                Content Templates
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Save generation presets and apply them from any product page with one click. Available on the
                Starter plan and above.
              </Text>
              <InlineStack>
                <Button onClick={() => (window.location.href = "/app/plans")}>Upgrade to unlock</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">
                  Content Templates
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Save generation presets — apply from the product page with one click.
                </Text>
              </BlockStack>

              {templates.length > 0 && (
                <BlockStack gap="200">
                  {templates.map((tpl) => (
                    <Box key={tpl.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {tpl.name}
                            </Text>
                            {tpl.isDefault && <Badge tone="success">Default</Badge>}
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {tpl.contentLength} · {tpl.contentTypes.replace(/,/g, ",")}
                            {tpl.keywords && ` · keywords: ${tpl.keywords}`}
                          </Text>
                        </BlockStack>
                        <Form method="post">
                          <input type="hidden" name="actionType" value="deleteTemplate" />
                          <input type="hidden" name="templateId" value={tpl.id} />
                          <Button tone="critical" variant="plain" size="slim" submit>
                            Delete
                          </Button>
                        </Form>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}

              <Divider />
              <Text as="h3" variant="headingMd">
                Add New Template
              </Text>

              <Form method="post">
                <input type="hidden" name="actionType" value="saveTemplate" />
                <input type="hidden" name="tpl_description" value={tplDesc.toString()} />
                {/* Same defect as Autopilot's: the "Meta Title & Description"
                  checkbox must submit both fields. */}
                <input type="hidden" name="tpl_metaTitle" value={tplMeta.toString()} />
                <input type="hidden" name="tpl_metaDescription" value={tplMeta.toString()} />
                <input type="hidden" name="tpl_faq" value={tplFaq.toString()} />
                <input type="hidden" name="tplDefault" value={tplDefault.toString()} />
                <BlockStack gap="300">
                  <TextField
                    name="tplName"
                    label="Template Name"
                    value={tplName}
                    onChange={setTplName}
                    placeholder="e.g., Full SEO Package"
                    autoComplete="off"
                  />
                  <Select
                    name="tplLength"
                    label="Description Length"
                    options={lengthOptions}
                    value={tplLength}
                    onChange={setTplLength}
                  />
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Content types:
                  </Text>
                  <InlineStack gap="400" wrap>
                    <Checkbox label="Description" checked={tplDesc} onChange={setTplDesc} />
                    <Checkbox label="Meta Title & Description" checked={tplMeta} onChange={setTplMeta} />
                    <Checkbox label="FAQ" checked={tplFaq} onChange={setTplFaq} />
                  </InlineStack>
                  <TextField
                    name="tplKeywords"
                    label="Keywords (optional)"
                    value={tplKeywords}
                    onChange={setTplKeywords}
                    autoComplete="off"
                    placeholder="Override global keywords for this template"
                  />
                  <TextField
                    name="tplInstructions"
                    label="Custom Instructions (optional)"
                    value={tplInstructions}
                    onChange={setTplInstructions}
                    multiline={2}
                    autoComplete="off"
                    placeholder="e.g., Focus on clinical applications, always mention purity"
                  />
                  <Checkbox label="Set as default template" checked={tplDefault} onChange={setTplDefault} />
                  <Button submit loading={isSaving} disabled={!tplName.trim()}>
                    Save Template
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
      {/* Phase 2 item 2.6 - turning review OFF is the consequential direction,
          so it asks once, in destructive tone, and says exactly what changes. */}
      <Modal
        open={confirmPublishWithoutReview}
        onClose={() => setConfirmPublishWithoutReview(false)}
        title="Publish without reviewing first?"
        primaryAction={{
          content: "Turn off review",
          destructive: true,
          onAction: () => {
            setPublishWithoutReview(true);
            setConfirmPublishWithoutReview(false);
          },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirmPublishWithoutReview(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Generated content will go straight to your live storefront, replacing what shoppers currently
              see. You will not get a chance to read it first.
            </Text>
            <Text as="p" variant="bodyMd">
              Previous descriptions are kept, and you can restore any product from its History tab.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              You can turn review back on here at any time. Remember to save.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
