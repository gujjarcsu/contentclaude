import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import { useT } from "../i18n/react.jsx";
import { tForRequest, T } from "../i18n/index.js";
import { PLAN_LABELS } from "../utils/planFit.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import { languageMismatch, languageName } from "../utils/language.js";
import { LIVE_UI_LOCALES, UI_LOCALE_NAMES, normaliseUiLocale } from "../i18n/index.js";
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
  const { keyStatusFor, canUseOwnKey} = await import("../utils/merchantKey.server.js");

  const [brandVoice, templates, plan] = await Promise.all([
    prisma.brandVoice.findUnique({ where: { shop } }),
    prisma.contentTemplate.findMany({ where: { shop }, orderBy: { createdAt: "asc" } }),
    getOrCreatePlan(shop),
  ]);

  // C0.7 — booleans and one timestamp. `keyStatusFor` is the only shape a
  // loader may use, and it is the only reader this module exposes: there is no
  // branch here that could serialise key material into the page, because the
  // function that would have to return it does not exist. 04-DECISIONS.md:
  // "never returned to the client — not the key, not a prefix, not a length."
  const aiKeyAvailable = canUseOwnKey(plan.planName);
  const aiKey = aiKeyAvailable
    ? await keyStatusFor(shop)
    : { configured: false, saved: false, validatedAt: null, failing: false };

  // P3.2 (Phase 8) — booleans, a timestamp and the site URL Bing verified.
  // Same rule as the AI key: no shape here can carry key material.
  const { bingKeyStatus } = await import("../utils/bing.server.js");
  const bing = await bingKeyStatus(shop);

  return Response.json({
    planName: plan.planName,
    entitlements: getEntitlements(plan.planName),
    aiKey,
    aiKeyAvailable,
    bing,
    // Phase 12 A6 — if what the app extracted from the store reads as another
    // language than the setting, say so where the setting is.
    languageMismatch: languageMismatch(`${brandVoice?.keyDifferentiators ?? ""} ${brandVoice?.sampleContent ?? ""}`, brandVoice?.language ?? "en"),
    // Phase 12 Part D — the display language, when the merchant chose one
    uiLocale: (await prisma.shop.findUnique({ where: { shop }, select: { uiLocale: true } }).catch(() => null))?.uiLocale ?? "",
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
      includeDraftProducts: false,
      autopilotContentTypes: "description,metaTitle,metaDescription",
    },
    templates,
  });
};

export const action = async ({ request }) => {
  const t = tForRequest(request);
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType") || "saveBrandVoice";

  const { invalidateCache } = await import("../utils/cache.server.js");
  const { checkEntitlement } = await import("../utils/plans.server.js");

  // Content templates are sold as Starter+ on the pricing table — the gate
  // must actually exist server-side (requirement 4.2.1: advertised == enforced).
  // ── C0.7 / P5.5 — the merchant's own AI key ────────────────────────────
  // P3.2 (Phase 8) — the Bing Webmaster key. The raw value is read here,
  // handed straight to saveBingKey, and never put anywhere else.
  if (actionType === "saveBingKey" || actionType === "removeBingKey" || actionType === "setBingEnabled") {
    const { saveBingKey, removeBingKey, setBingEnabled } = await import("../utils/bing.server.js");
    if (actionType === "removeBingKey") {
      await removeBingKey(shop);
      return Response.json({ ok: true, bingRemoved: true });
    }
    if (actionType === "setBingEnabled") {
      const r = await setBingEnabled(shop, formData.get("enabled") === "true");
      return Response.json(r.ok ? { ok: true, bingEnabled: formData.get("enabled") === "true" } : { error: r.reason }, { status: r.ok ? 200 : 400 });
    }
    const { storefrontOrigin } = await import("../utils/crawlerAccess.server.js");
    const { admin } = await authenticate.admin(request);
    const origin = await storefrontOrigin(admin.graphql, shop).catch(() => null);
    const r = await saveBingKey(shop, String(formData.get("bingKey") ?? ""), { storefrontOrigin: origin });
    return Response.json(r.ok ? { ok: true, bingSaved: true, bingSites: r.sites.length, bingSiteUrl: r.siteUrl } : { error: r.reason }, { status: r.ok ? 200 : 400 });
  }

  if (actionType === "saveAiKey" || actionType === "removeAiKey") {
    const { getOrCreatePlan } = await import("../utils/plans.server.js");
    const { canUseOwnKey, saveKey, removeKey } = await import("../utils/merchantKey.server.js");
    const plan = await getOrCreatePlan(shop);
    if (!canUseOwnKey(plan.planName)) {
      return Response.json(
        { error: t("Using your own AI key is available on the Professional plan.") },
        { status: 403 },
      );
    }

    if (actionType === "removeAiKey") {
      await removeKey(shop);
      return Response.json({ success: true, message: t("Your AI key was removed. Content is written with ours again.") });
    }

    // The raw value is read here, handed straight to saveKey, and never put in
    // a variable that outlives this expression. It is not logged, not echoed in
    // the response, and not in an error message on any branch below.
    const result = await saveKey(shop, String(formData.get("aiKey") ?? ""));
    if (result.ok) {
      return Response.json({
        success: true,
        message:
          t("Your key was checked against Anthropic and saved. Content written with it doesn't count against your monthly credits."),
      });
    }

    // Each reason maps to a fixed sentence chosen HERE. Anthropic's own error
    // text is never surfaced: an upstream error body can echo the request
    // headers, and this string goes on a merchant's screen.
    const REASONS = {
      empty: T("Paste your Anthropic API key first."),
      rejected: T("Anthropic rejected that key. Check you copied all of it and that the key is still active."),
      rate_limited: T("Anthropic rate-limited the check, so nothing was saved. Try again in a minute — the key may be fine."),
      upstream: T("Anthropic could not be reached to check the key. Nothing was saved. Try again shortly."),
      unreachable: T("We could not reach Anthropic to check the key. Nothing was saved."),
      storage: T("The key checked out but could not be saved, so nothing was stored. Please try again."),
      not_configured: T("Using your own AI key is not available on this deployment yet."),
    };
    return Response.json({ error: t(REASONS[result.reason] ?? REASONS.upstream) }, { status: 400 });
  }

  if (actionType === "saveTemplate" || actionType === "deleteTemplate") {
    const ent = await checkEntitlement(shop, "contentTemplates");
    if (!ent.allowed) {
      return Response.json({
        error: t("Content templates require the {v} plan. Upgrade to unlock this feature.", { v: PLAN_LABELS[ent.requiredPlan] ?? T("Starter") }),
        limitReached: true,
      });
    }
  }

  if (actionType === "saveTemplate") {
    const name = (formData.get("tplName") || "").slice(0, 100).trim();
    if (!name) return Response.json({ error: t("Template name is required.") });
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
    return Response.json({ success: true, message: t("Template saved!") });
  }

  if (actionType === "deleteTemplate") {
    const id = formData.get("templateId");
    await prisma.contentTemplate.deleteMany({ where: { id, shop } });
    return Response.json({ success: true, message: t("Template deleted.") });
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
  // Phase 12 Part D — the display language: a live locale, or empty = follow the admin
  const rawUi = String(formData.get("uiLocale") ?? "").trim();
  if (formData.has("uiLocale")) {
    const uiLocale = rawUi && LIVE_UI_LOCALES.includes(normaliseUiLocale(rawUi)) ? normaliseUiLocale(rawUi) : null;
    await prisma.shop.updateMany({ where: { shop }, data: { uiLocale } }).catch(() => {});
  }

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
      autopilotNotice = t("Your settings were saved, but Autopilot stays off — it requires the {plan} plan.", { plan: PLAN_LABELS[apEnt.requiredPlan] ?? T("Growth") });
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
    // A1.2 — which products every count and every action may touch.
    includeDraftProducts: formData.get("includeDraftProducts") === "true",
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
    message: autopilotNotice || t("Settings saved!"),
    autopilotBlocked: !!autopilotNotice,
  });
};

const TONE_CARDS = [
  { value: "professional", label: T("Professional"), desc: T("Authoritative & trustworthy") },
  { value: "friendly", label: T("Friendly"), desc: T("Warm & conversational") },
  { value: "premium", label: T("Premium"), desc: T("Luxury & aspirational") },
  { value: "bold", label: T("Bold"), desc: T("High energy & direct") },
  { value: "scientific", label: T("Scientific"), desc: T("Technical & evidence-based") },
  { value: "warm", label: T("Warm"), desc: T("Nurturing & empathetic") },
  { value: "minimalist", label: T("Minimalist"), desc: T("Clean & understated") },
  { value: "playful", label: T("Playful"), desc: T("Fun & engaging") },
  { value: "custom", label: T("Custom"), desc: T("Define your own tone") },
];

const languageOptions = [
  { label: T("English"), value: "en" },
  { label: T("Spanish"), value: "es" },
  { label: T("French"), value: "fr" },
  { label: T("German"), value: "de" },
  { label: T("Italian"), value: "it" },
  { label: T("Portuguese"), value: "pt" },
  { label: T("Japanese"), value: "ja" },
  { label: T("Chinese (Simplified)"), value: "zh" },
  { label: T("Korean"), value: "ko" },
  { label: T("Arabic"), value: "ar" },
  { label: T("Hindi"), value: "hi" },
  { label: T("Dutch"), value: "nl" },
];

const lengthOptions = [
  { label: T("Short (~100-150 words)"), value: "short" },
  { label: T("Standard (~200-300 words)"), value: "standard" },
  { label: T("Detailed (~400-500 words)"), value: "detailed" },
];

export default function SettingsPage() {
  const t = useT();
  const { languageMismatch: mismatch = null, uiLocale: savedUiLocale = "" } = useLoaderData();
  const [uiLocale, setUiLocale] = useState(savedUiLocale || "");
  const { brandVoice, templates, entitlements, aiKey, aiKeyAvailable, bing } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const loadingThisRoute = useRouteLoading();
  const navigate = useNavigate();
  const isSaving = navigation.state === "submitting";
  // C0.7 — the spinner stays on the button that was pressed. The form data is
  // read for the actionType only; the key field itself is never touched here.
  const isSavingAiKey = navigation.formData?.get("actionType") === "saveAiKey";
  const isSavingBing = navigation.formData?.get("actionType") === "saveBingKey";

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
  const [includeDraftProducts, setIncludeDraftProducts] = useState(brandVoice.includeDraftProducts || false);
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
    return <AppSkeleton title={t("Settings")} sections={3} layout="twoThird" />;
  }

  return (
    <Page
      title={t("Settings")}
      subtitle={t("Brand voice, autopilot, and content templates")}
      backAction={{ content: t("Dashboard"), onAction: () => navigate("/app") }}
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
          <input type="hidden" name="includeDraftProducts" value={includeDraftProducts.toString()} />
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
                {mismatch && (
                  <Banner tone="warning" title={t("Your content language setting looks wrong")}>
                    <Text as="p" variant="bodySm">
                      {t("Content Language is set to {languageName}, but the copy we read from your store looks like {languageName1}. If your products are written in {languageName2}, change Content Language below before you publish.", { languageName: languageName(mismatch.setting), languageName1: languageName(mismatch.detected), languageName2: languageName(mismatch.detected) })}
                    </Text>
                  </Banner>
                )}
                {/* Store Identity */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        {t("Store Identity")}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("Tell the AI who you are — the more specific, the better the output.")}
                      </Text>
                    </BlockStack>
                    <TextField
                      name="storeName"
                      label={t("Store Name")}
                      value={storeName}
                      onChange={setStoreName}
                      placeholder={t("e.g., Elite Botanics Australia")}
                      autoComplete="off"
                    />
                    <Select
                      name="language"
                      label={t("Content Language")}
                      options={languageOptions.map((o) => ({ ...o, label: t(o.label) }))}
                      value={language}
                      onChange={setLanguage}
                    />
                    <Select
                      name="uiLocale"
                      label={t("App language")}
                      helpText={t("The language of these screens. Content Language above is what we write in.")}
                      options={[{ label: t("Follow my Shopify admin language"), value: "" }, ...LIVE_UI_LOCALES.map((l) => ({ label: UI_LOCALE_NAMES[l] ?? l, value: l }))]}
                      value={uiLocale}
                      onChange={setUiLocale}
                    />
                    <TextField
                      name="targetAudience"
                      label={t("Target Audience")}
                      value={targetAudience}
                      onChange={setTargetAudience}
                      multiline={3}
                      autoComplete="off"
                      placeholder={t("e.g., Health-conscious Australians aged 25-55")}
                    />
                  </BlockStack>
                </Card>

                {/* Brand Tone — visual selector */}
                <Card>
                  <BlockStack gap="400">
                    <input type="hidden" name="brandTone" value={brandTone} />
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        {t("Brand Tone")}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("How should your content sound? Click to select.")}
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
                      title={t("Brand tone")}
                      titleHidden
                      choices={TONE_CARDS.map((card) => ({
                        label: t(card.label),
                        value: card.value,
                        helpText: t(card.desc),
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
                        {t("SEO Keyword Targeting")}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("These keywords are woven naturally into all generated content.")}
                      </Text>
                    </BlockStack>
                    <TextField
                      name="targetKeywords"
                      label={t("Target Keywords")}
                      value={targetKeywords}
                      onChange={setTargetKeywords}
                      autoComplete="off"
                      placeholder={t("e.g., organic skincare Australia, buy Vitamin C")}
                      helpText={t("Comma-separated. Override per-product on the Generate page.")}
                    />
                  </BlockStack>
                </Card>

                {/* Differentiators */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        {t("What Makes You Unique")}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("These details are injected into every piece of content to reinforce your brand.")}
                      </Text>
                    </BlockStack>
                    <TextField
                      name="keyDifferentiators"
                      label={t("Key Differentiators")}
                      value={keyDifferentiators}
                      onChange={setKeyDifferentiators}
                      multiline={3}
                      autoComplete="off"
                      placeholder={t("e.g., Australian lab tested, sustainably sourced, fast dispatch")}
                    />
                    <TextField
                      name="avoidPhrases"
                      label={t("Phrases & Styles to Avoid")}
                      value={avoidPhrases}
                      onChange={setAvoidPhrases}
                      multiline={3}
                      autoComplete="off"
                      placeholder={t("e.g., No hype words. No emojis. Never say 'revolutionary'.")}
                    />
                  </BlockStack>
                </Card>

                {/* Sample Content */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        {t("Train the AI on Your Voice")}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("Paste 2–3 of your best product descriptions. This is the most powerful way to match your exact voice.")}
                      </Text>
                    </BlockStack>
                    <TextField
                      name="sampleContent"
                      label={t("Your Best Product Descriptions")}
                      value={sampleContent}
                      onChange={setSampleContent}
                      multiline={8}
                      autoComplete="off"
                      placeholder={t("Paste your favorite product descriptions here...")}
                    />
                    <TextField
                      name="additionalNotes"
                      label={t("Additional Guidelines")}
                      value={additionalNotes}
                      onChange={setAdditionalNotes}
                      multiline={3}
                      autoComplete="off"
                      placeholder={t("e.g., Always mention free shipping. Never make unsubstantiated claims.")}
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
                          {t("Review before publishing")}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("Generated content is saved as a draft for you to read first.")}
                        </Text>
                      </BlockStack>
                      {publishWithoutReview && <Badge tone="attention">{t("Review is off")}</Badge>}
                    </InlineStack>

                    <Checkbox
                      label={t("Publish without review")}
                      checked={publishWithoutReview}
                      helpText={t("Content goes straight to your live storefront. Nothing is held for approval.")}
                      onChange={(value) => {
                        // Turning it ON asks first. Turning it OFF is the safe
                        // direction and needs no ceremony.
                        if (value) setConfirmPublishWithoutReview(true);
                        else setPublishWithoutReview(false);
                      }}
                    />

                    {/* A1.2 — the drafts opt-in.
                        The column and the read path shipped in 2d9c37d; this is
                        the half a merchant can reach. Without it the default was
                        not a default, it was a law: no shop could ever include
                        its drafts, however it merchandises.
                        Off by default because a draft has no public page, so
                        writing SEO copy for one spends a generation on a page
                        nobody can reach. On for the merchants who draft in bulk
                        and publish in batches — which is a real and ordinary way
                        to run a store, not an edge case.
                        Archived is deliberately NOT offered: an archived product
                        is not for sale and has no storefront page at all. */}
                    <Checkbox
                      label={t("Include draft products")}
                      checked={includeDraftProducts}
                      helpText={t("Counts and optimizes products that are still drafts. Off by default, because a draft has no public page yet. Archived products are never included.")}
                      onChange={setIncludeDraftProducts}
                    />
                  </BlockStack>
                </Card>
                {/* Autopilot */}
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingLg">
                          {t("Autopilot Mode")}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("Automatically generate content when a new product is added to your store.")}
                        </Text>
                      </BlockStack>
                      {autopilotEnabled && <Badge tone="success">{t("Active")}</Badge>}
                    </InlineStack>

                    <Checkbox
                      label={t("Enable Autopilot")}
                      checked={autopilotEnabled}
                      onChange={setAutopilotEnabled}
                      helpText={t("New products are picked up automatically once this is on.")}
                    />

                    {autopilotEnabled && (
                      <BlockStack gap="300">
                        <Divider />
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          {t("Content to auto-generate:")}
                        </Text>
                        <InlineStack gap="400" wrap>
                          <Checkbox label={t("Description")} checked={apDesc} onChange={setApDesc} />
                          <Checkbox label={t("Meta Title & Description")} checked={apMeta} onChange={setApMeta} />
                          <Checkbox label="FAQ" checked={apFaq} onChange={setApFaq} />
                        </InlineStack>
                        <Checkbox
                          label={t("Auto-publish immediately (skip review)")}
                          checked={autopilotAutoPublish}
                          onChange={setAutopilotAutoPublish}
                          helpText={t("Content goes live on Shopify without a review step")}
                        />
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>

                <Button variant="primary" size="large" submit loading={isSaving} fullWidth>
                  {isSaving ? t("Saving...") : t("Save Settings")}
                </Button>
              </BlockStack>
            </Layout.Section>

            {/* Sidebar */}
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      {t("Tips for Better Content")}
                    </Text>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        <strong>{t("Be specific with your audience.")}</strong> {t("\"Active women aged 25-45 who love outdoor sports\" beats \"everyone.\"")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>{t("Add real keywords.")}</strong> {t("Woven naturally — no keyword stuffing.")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>{t("Real differentiators win.")}</strong> {t("\"Lab tested with COA\" beats \"high quality.\"")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>{t("Paste real examples.")}</strong> {t("The single most powerful way to clone your voice.")}
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      {t("Tone Guide")}
                    </Text>
                    <BlockStack gap="200">
                      {TONE_CARDS.slice(0, 4).map((card) => (
                        <Text key={card.value} as="p" variant="bodySm">
                          <strong>{t(card.label)}</strong> — {t(card.desc)}
                        </Text>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </Form>

        {/* ── C0.7 / P5.5 — your own AI key, Professional only ──────────────
            The input is deliberately write-only. There is nothing to prefill it
            WITH: the loader never receives key material, so the field is empty
            even when a key is saved, and the card says "a key is saved" rather
            than showing any part of it. 04-DECISIONS.md: not the key, not a
            prefix, not a length. */}
        {aiKeyAvailable && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <Text as="h2" variant="headingLg">
                  {t("Use your own AI key")}
                </Text>
                {aiKey?.saved && !aiKey?.failing && (
                  <Badge tone="success">{aiKey?.validatedAt ? t("Active") : t("Saved, not checked")}</Badge>
                )}
                {aiKey?.failing && <Badge tone="critical">{t("Not working")}</Badge>}
              </InlineStack>

              <Text as="p" variant="bodySm" tone="subdued">
                {t("Paste an Anthropic API key and this app will generate on your account instead of ours.")} <b>{t("Content written with your key doesn't count against your monthly credits")}</b> {t("— you pay Anthropic for the usage and us for the software.")}
              </Text>

              {aiKey?.failing && (
                <Banner tone="critical" title={t("Your key stopped working")}>
                  <Text as="p" variant="bodySm">
                    {t("Anthropic rejected it, so jobs are paused rather than quietly running on our key and your credits. Save a working key below to resume.")}
                  </Text>
                </Banner>
              )}

              <Form method="post">
                <input type="hidden" name="actionType" value="saveAiKey" />
                <BlockStack gap="300">
                  <TextField
                    label={t("Anthropic API key")}
                    name="aiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={aiKey?.saved ? t("A key is saved — paste a new one to replace it") : "sk-ant-..."}
                    helpText={t("Checked against Anthropic when you save, so you find out now rather than halfway through a bulk job. Stored encrypted; never shown again, not even in part.")}
                  />
                  <InlineStack gap="200">
                    <Button submit variant="primary" loading={isSaving && isSavingAiKey}>
                      {aiKey?.saved ? t("Replace key") : t("Save key")}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>

              {aiKey?.saved && (
                <Form method="post">
                  <input type="hidden" name="actionType" value="removeAiKey" />
                  <Button submit variant="plain" tone="critical">
                    {t("Remove my key and use yours")}
                  </Button>
                </Form>
              )}
            </BlockStack>
          </Card>
        )}

        {/* P3.2 (Phase 8) — the merchant's Bing Webmaster key, for the crawl-time
            holdout. Stored like the AI key; the card only ever sees booleans. */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <Text as="h2" variant="headingLg">
                {t("Measure crawl time with Bing")}
              </Text>
              {bing?.saved && bing?.siteUrl && <Badge tone={bing?.enabled ? "success" : "info"}>{bing?.enabled ? t("Measuring") : t("Key saved, switched off")}</Badge>}
              {bing?.saved && !bing?.siteUrl && <Badge tone="critical">{t("Key cannot see this store")}</Badge>}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              {t("Add your Bing Webmaster Tools API key (Bing Webmaster Tools, Settings, API access) and switch measurement on. Each batch of product pages we publish is then split at random: half submitted to Bing through your key, half withheld, and the time to Bing's first crawl recorded for both — a causal result about your own store, usually inside 72 hours. Nothing is sent to Bing until you switch it on. Stored encrypted; never shown again, not even in part.")}
            </Text>
            {actionData?.error && (isSavingBing || navigation.formData?.get("actionType") === "setBingEnabled") && (
              <Banner tone="critical" title={actionData.error} />
            )}
            {actionData?.bingSaved && (
              <Banner tone={actionData.bingSiteUrl ? "success" : "warning"} title={actionData.bingSiteUrl ? t("Key saved — Bing knows this store as {bingSiteUrl}", { bingSiteUrl: actionData.bingSiteUrl }) : t("Key saved, but none of its {bingSites} site(s) is this storefront", { bingSites: actionData.bingSites })}>
                {!actionData.bingSiteUrl && (
                  <Text as="p" variant="bodySm">
                    {t("Add and verify your storefront domain in Bing Webmaster Tools, then save the key again.")}
                  </Text>
                )}
              </Banner>
            )}
            <Form method="post">
              <input type="hidden" name="actionType" value="saveBingKey" />
              <BlockStack gap="300">
                <TextField
                  label={t("Bing Webmaster API key")}
                  name="bingKey"
                  type="password"
                  autoComplete="off"
                  placeholder={bing?.saved ? t("A key is saved — paste a new one to replace it") : t("Paste your key")}
                  helpText={t("Checked against Bing when you save. Stored encrypted; never logged, never shown again.")}
                />
                <InlineStack gap="200">
                  <Button submit loading={isSaving && isSavingBing}>
                    {bing?.saved ? t("Replace key") : t("Save key")}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
            {bing?.saved && bing?.siteUrl && (
              <Form method="post">
                <input type="hidden" name="actionType" value="setBingEnabled" />
                <input type="hidden" name="enabled" value={bing?.enabled ? "false" : "true"} />
                <Button submit>
                  {bing?.enabled ? t("Switch measurement off") : t("Switch measurement on")}
                </Button>
              </Form>
            )}
            {bing?.saved && (
              <Form method="post">
                <input type="hidden" name="actionType" value="removeBingKey" />
                <Button submit variant="plain" tone="critical">
                  {t("Remove my Bing key")}
                </Button>
              </Form>
            )}
          </BlockStack>
        </Card>

        {/* P6.2 — support, where a confused merchant actually looks.
            It is NOT in the sidebar: that is five items by an earlier decision
            and navigation.test.js enforces it. The footer carries it on every
            page; this is the second place, because Settings is where someone
            goes when something is not behaving. */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              {t("Something not working?")}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {t("Ask us and a real person replies, within one business day.")}
            </Text>
            <InlineStack>
              <Button onClick={() => navigate("/app/support")}>{t("Get help")}</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Re-run wizard */}
        {/* Content Templates — Starter+ (matches the pricing table) */}
        {!entitlements?.contentTemplates ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">
                {t("Content Templates")}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {t("Save writing presets and apply them from any product page with one click. Available on the Starter plan and above.")}
              </Text>
              <InlineStack>
                <Button onClick={() => (window.location.href = "/app/plans")}>{t("Upgrade to unlock")}</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">
                  {t("Content Templates")}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("Save writing presets — apply from the product page with one click.")}
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
                            {tpl.isDefault && <Badge tone="success">{t("Default")}</Badge>}
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {tpl.contentLength} · {tpl.contentTypes.replace(/,/g, ",")}
                            {tpl.keywords && t(" · keywords: {keywords}", { keywords: tpl.keywords })}
                          </Text>
                        </BlockStack>
                        <Form method="post">
                          <input type="hidden" name="actionType" value="deleteTemplate" />
                          <input type="hidden" name="templateId" value={tpl.id} />
                          <Button tone="critical" variant="plain" size="slim" submit>
                            {t("Delete")}
                          </Button>
                        </Form>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}

              <Divider />
              <Text as="h3" variant="headingMd">
                {t("Add New Template")}
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
                    label={t("Template Name")}
                    value={tplName}
                    onChange={setTplName}
                    placeholder={t("e.g., Full SEO Package")}
                    autoComplete="off"
                  />
                  <Select
                    name="tplLength"
                    label={t("Description Length")}
                    options={lengthOptions.map((o) => ({ ...o, label: t(o.label) }))}
                    value={tplLength}
                    onChange={setTplLength}
                  />
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    {t("Content types:")}
                  </Text>
                  <InlineStack gap="400" wrap>
                    <Checkbox label={t("Description")} checked={tplDesc} onChange={setTplDesc} />
                    <Checkbox label={t("Meta Title & Description")} checked={tplMeta} onChange={setTplMeta} />
                    <Checkbox label="FAQ" checked={tplFaq} onChange={setTplFaq} />
                  </InlineStack>
                  <TextField
                    name="tplKeywords"
                    label={t("Keywords (optional)")}
                    value={tplKeywords}
                    onChange={setTplKeywords}
                    autoComplete="off"
                    placeholder={t("Override global keywords for this template")}
                  />
                  <TextField
                    name="tplInstructions"
                    label={t("Custom Instructions (optional)")}
                    value={tplInstructions}
                    onChange={setTplInstructions}
                    multiline={2}
                    autoComplete="off"
                    placeholder={t("e.g., Focus on clinical applications, always mention purity")}
                  />
                  <Checkbox label={t("Set as default template")} checked={tplDefault} onChange={setTplDefault} />
                  <Button submit loading={isSaving} disabled={!tplName.trim()}>
                    {t("Save Template")}
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
        title={t("Publish without reviewing first?")}
        primaryAction={{
          content: t("Turn off review"),
          destructive: true,
          onAction: () => {
            setPublishWithoutReview(true);
            setConfirmPublishWithoutReview(false);
          },
        }}
        secondaryActions={[{ content: t("Cancel"), onAction: () => setConfirmPublishWithoutReview(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              {t("Generated content will go straight to your live storefront, replacing what shoppers currently see. You will not get a chance to read it first.")}
            </Text>
            <Text as="p" variant="bodyMd">
              {t("Previous descriptions are kept, and you can restore any product from its History tab.")}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {t("You can turn review back on here at any time. Remember to save.")}
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
