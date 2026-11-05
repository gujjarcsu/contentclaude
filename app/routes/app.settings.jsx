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
  Link,
  Tabs,
  Tag,
  InlineGrid,
} from "@shopify/polaris";
import { StoreIcon, EyeCheckMarkIcon, ChatIcon, MegaphoneIcon, TargetIcon, CheckCircleIcon, TextBlockIcon, AutomationIcon, QuestionCircleIcon, PageIcon, ChartVerticalIcon, CreditCardIcon, KeyIcon } from "@shopify/polaris-icons";
import { IconTile, LockedPreview } from "../components/Kit.jsx";
import { IlluBrandVoice } from "../components/Illustrations.jsx";
import { LockedRow } from "../components/LockedRow.jsx";
import { cheapestPlanLabelWith } from "../utils/billing-plans.js";
import { CONTACT_EMAIL } from "../utils/legal.js";
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


/** "description,metaTitle,metaDescription,faq" → the words a merchant chose, deduped. */
function templateTypes(csv, t) {
  const words = [];
  for (const type of String(csv ?? "").split(",")) {
    const w = type === "description" ? t("Description") : type === "metaTitle" || type === "metaDescription" ? t("Meta Title & Description") : type === "faq" ? "FAQ" : null;
    if (w && !words.includes(w)) words.push(w);
  }
  return words.join(" · ");
}

/** A section title with its icon tile and an optional status chip (Avada 056). */
function SectionTitle({ icon, tone = "brand", title, status }) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <IconTile icon={icon} tone={tone} size="md" />
      <InlineStack gap="200" blockAlign="center" wrap>
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {status ?? null}
      </InlineStack>
    </InlineStack>
  );
}

/** On / Off as a chip beside a toggle's section: green when on, neutral when off. */
function OnOff({ on, onLabel, offLabel, offTone }) {
  const t = useT();
  return on ? <Badge tone="success">{onLabel ?? t("On")}</Badge> : <Badge tone={offTone}>{offLabel ?? t("Off")}</Badge>;
}

/*
 * Redesign v2 (Nov 2026) — Settings in four tabs, the way Avada's settings
 * (056/058) split General · Email · Integrations · Subscription: General ·
 * Brand voice · Automation · Plan. Each section keeps the annotated layout,
 * now with an icon tile and, on a toggle, an On / Off chip.
 *
 * No field ever unmounts. The brand-voice form posts every field in ONE
 * submit, so its three tabs are panels inside that one <Form>, switched with
 * the HTML `hidden` attribute: a hidden panel's inputs are still in the form
 * and still post their saved values (a tab that unmounted its fields would
 * post them empty and blank the merchant's settings). The template, key and
 * Bing forms are separate <Form>s outside it, shown on their own tab.
 */
const TABS = [
  { id: "general", label: T("General") },
  { id: "voice", label: T("Brand voice") },
  { id: "automation", label: T("Automation") },
  { id: "plan", label: T("Plan") },
];

export default function SettingsPage() {
  const t = useT();
  const { languageMismatch: mismatch = null, uiLocale: savedUiLocale = "" } = useLoaderData();
  const [uiLocale, setUiLocale] = useState(savedUiLocale || "");
  const { brandVoice, templates, entitlements, aiKey, aiKeyAvailable, bing, planName } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const loadingThisRoute = useRouteLoading();
  const navigate = useNavigate();
  const isSaving = navigation.state === "submitting";
  // C0.7 — the spinner stays on the button that was pressed. The form data is
  // read for the actionType only; the key field itself is never touched here.
  const isSavingAiKey = navigation.formData?.get("actionType") === "saveAiKey";
  const isSavingBing = navigation.formData?.get("actionType") === "saveBingKey";
  const isSavingVoice = isSaving && (navigation.formData?.get("actionType") ?? "saveBrandVoice") === "saveBrandVoice";
  const isSavingTemplate = isSaving && navigation.formData?.get("actionType") === "saveTemplate";
  const [tab, setTab] = useState(0);

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

  // Autopilot is gated server-side (the action refuses it below Growth). The
  // checkbox used to be offered on every plan and the save then said it was
  // refused. On a plan without it, the control is a lock row — unless it is
  // already on, in which case the merchant must still be able to turn it off.
  const autopilotLocked = !entitlements?.autopilot && !autopilotEnabled;
  const autopilotPlan = cheapestPlanLabelWith("autopilot");
  const templatesPlan = cheapestPlanLabelWith("contentTemplates");
  // Errors from the Bing forms are shown inside the Bing card; everything else
  // is the page's one notice.
  const bingFormActive = isSavingBing || navigation.formData?.get("actionType") === "setBingEnabled";
  const pageError = actionData?.error && !actionData?.success && !actionData?.bingSaved ? actionData.error : null;
  // Only the brand-voice save returns `autopilotBlocked`, so this is the
  // confirmation for the Save button the merchant just pressed, not another form's.
  const voiceSaved = !!actionData?.success && "autopilotBlocked" in actionData && !isSavingVoice;
  const toneCard = TONE_CARDS.find((c) => c.value === brandTone) ?? TONE_CARDS[0];
  const keywordList = String(targetKeywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 8);
  const planLabel = t(PLAN_LABELS[planName] ?? planName ?? "Free");
  const panel = (i) => ({ id: `settings-panel-${TABS[i].id}`, role: "tabpanel", "aria-labelledby": `settings-tab-${TABS[i].id}`, hidden: tab !== i });

  return (
    <Page
      title={t("Settings")}
      backAction={{ content: t("Home"), onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {pageError && (
          <Banner tone="critical">
            <p>{pageError}</p>
          </Banner>
        )}

        <Tabs
          tabs={TABS.map((x) => ({ id: `settings-tab-${x.id}`, content: t(x.label), panelID: `settings-panel-${x.id}` }))}
          selected={tab}
          onSelect={setTab}
        />

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
          <input type="hidden" name="brandTone" value={brandTone} />

          {/* ── General ─────────────────────────────────────────────────── */}
          <div {...panel(0)}>
            <Layout>
              <Layout.AnnotatedSection title={<SectionTitle icon={StoreIcon} title={t("Store")} />} description={t("Your store's name and the language your drafts are written in.")}>
                <Card>
                  <BlockStack gap="400">
                    {/* Phase 12 A6 — said where the setting is, not as a page banner. */}
                    {mismatch && (
                      <Banner tone="warning" title={t("Your content language setting looks wrong")}>
                        <Text as="p" variant="bodySm">
                          {t("Content Language is set to {languageName}, but the copy we read from your store looks like {languageName1}. If your products are written in {languageName2}, change Content Language below before you publish.", { languageName: languageName(mismatch.setting), languageName1: languageName(mismatch.detected), languageName2: languageName(mismatch.detected) })}
                        </Text>
                      </Banner>
                    )}
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
                  </BlockStack>
                </Card>
              </Layout.AnnotatedSection>

              {/* Phase 2 item 2.6 — auto-publish, in ONE place. It used to be a
                  per-run checkbox in five, and a bug skipped the confirm on five
                  of seven generate paths. The listing promises nothing goes live
                  until the merchant approves it; that cannot depend on which of
                  five checkboxes was last ticked. */}
              <Layout.AnnotatedSection
                title={<SectionTitle icon={EyeCheckMarkIcon} title={t("Review before publishing")} status={<OnOff on={!publishWithoutReview} offLabel={t("Review is off")} offTone="attention" />} />}
                description={t("Generated content is saved as a draft for you to read first.")}
              >
                <Card>
                  <BlockStack gap="400">
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

                    {/* A1.2 — the drafts opt-in. Off by default because a draft
                        has no public page; on for merchants who draft in bulk
                        and publish in batches. Archived is deliberately NOT
                        offered: an archived product has no storefront page. */}
                    <Checkbox
                      label={t("Include draft products")}
                      checked={includeDraftProducts}
                      helpText={t("Counts and optimizes products that are still drafts. Off by default, because a draft has no public page yet. Archived products are never included.")}
                      onChange={setIncludeDraftProducts}
                    />
                  </BlockStack>
                </Card>
              </Layout.AnnotatedSection>
            </Layout>
          </div>

          {/* ── Brand voice ─────────────────────────────────────────────── */}
          <div {...panel(1)}>
            <Layout>
              {/* What the brand voice produces, from the merchant's own inputs
                  only: every draft is written with exactly these. No sample
                  copy is invented here, so nothing on this card can be untrue. */}
              <Layout.AnnotatedSection title={<SectionTitle icon={ChatIcon} title={t("What every draft is given")} />} description={t("Updates as you type. Save to use it on the next draft.")}>
                <Card>
                  <InlineGrid columns={{ xs: 1, md: ["twoThirds", "oneThird"] }} gap="400" alignItems="center">
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center" wrap>
                        <Text as="p" variant="headingMd">
                          {storeName?.trim() || t("Your store")}
                        </Text>
                        <Badge tone="info">{t(toneCard.label)}</Badge>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t(toneCard.desc)}
                      </Text>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          {t("Written for")}
                        </Text>
                        <Text as="p" variant="bodySm" tone={targetAudience?.trim() ? undefined : "subdued"}>
                          {targetAudience?.trim() || t("No audience set yet")}
                        </Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          {t("Keywords")}
                        </Text>
                        {keywordList.length > 0 ? (
                          <InlineStack gap="100" wrap>
                            {keywordList.map((k) => (
                              <Tag key={k}>{k}</Tag>
                            ))}
                          </InlineStack>
                        ) : (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {t("No keywords set yet")}
                          </Text>
                        )}
                      </BlockStack>
                    </BlockStack>
                    <Box>
                      <IlluBrandVoice width={200} />
                    </Box>
                  </InlineGrid>
                </Card>
              </Layout.AnnotatedSection>

              <Layout.AnnotatedSection title={<SectionTitle icon={MegaphoneIcon} title={t("Brand tone")} />} description={t("How every draft should sound.")}>
                <Card>
                  {/* Phase 2 item 2.5 — a Polaris ChoiceList, a real radio group:
                      keyboard arrows work and the selection is announced. */}
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
                </Card>
              </Layout.AnnotatedSection>

              <Layout.AnnotatedSection title={<SectionTitle icon={TargetIcon} title={t("Audience and keywords")} />} description={t("Who you sell to, and the words woven naturally into every draft.")}>
                <Card>
                  <BlockStack gap="400">
                    <TextField
                      name="targetAudience"
                      label={t("Target Audience")}
                      value={targetAudience}
                      onChange={setTargetAudience}
                      multiline={3}
                      autoComplete="off"
                      placeholder={t("e.g., Health-conscious Australians aged 25-55")}
                      helpText={t("\"Active women aged 25-45 who love outdoor sports\" beats \"everyone.\"")}
                    />
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
              </Layout.AnnotatedSection>

              <Layout.AnnotatedSection title={<SectionTitle icon={CheckCircleIcon} tone="success" title={t("What makes you different")} />} description={t("Facts every description can repeat, and words it must never use.")}>
                <Card>
                  <BlockStack gap="400">
                    <TextField
                      name="keyDifferentiators"
                      label={t("Key Differentiators")}
                      value={keyDifferentiators}
                      onChange={setKeyDifferentiators}
                      multiline={3}
                      autoComplete="off"
                      placeholder={t("e.g., Australian lab tested, sustainably sourced, fast dispatch")}
                      helpText={t("\"Lab tested with COA\" beats \"high quality.\"")}
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
              </Layout.AnnotatedSection>

              <Layout.AnnotatedSection title={<SectionTitle icon={TextBlockIcon} title={t("Your voice")} />} description={t("Paste 2–3 of your best product descriptions. This is the most powerful way to match your exact voice.")}>
                <Card>
                  <BlockStack gap="400">
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
              </Layout.AnnotatedSection>
            </Layout>
          </div>

          {/* ── Automation ──────────────────────────────────────────────── */}
          <div {...panel(2)}>
            <Layout>
              <Layout.AnnotatedSection
                title={<SectionTitle icon={AutomationIcon} title={t("Autopilot")} status={autopilotLocked ? null : <OnOff on={autopilotEnabled} />} />}
                description={t("Automatically generate content when a new product is added to your store.")}
              >
                <Card>
                  {autopilotLocked ? (
                    <LockedRow sentence={t("Autopilot is on {plan} and above.", { plan: autopilotPlan })} onSeePlans={() => navigate("/app/plans")} />
                  ) : (
                    <BlockStack gap="400">
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
                  )}
                </Card>
              </Layout.AnnotatedSection>
            </Layout>
          </div>

          {/* One save for every brand-voice field, on the three tabs that hold
              them. The Plan tab's forms each save themselves. */}
          <div hidden={tab === 3}>
            <Box paddingBlockStart="400">
              <InlineStack align="end" gap="300" blockAlign="center">
                {voiceSaved && (
                  <Text as="p" variant="bodySm" tone={actionData?.autopilotBlocked ? "caution" : "success"}>
                    {actionData.message}
                  </Text>
                )}
                <Button variant="primary" submit loading={isSavingVoice}>
                  {t("Save")}
                </Button>
              </InlineStack>
            </Box>
          </div>
        </Form>

        {/* ── General, outside the form: support ────────────────────────── */}
        {/* P6.2 — support, where a confused merchant actually looks. Not in
            the sidebar (navigation.test.js holds it to six one-word items);
            the footer carries it on every page and this is the second
            place, because Settings is where someone goes when something is
            not behaving. */}
        <div hidden={tab !== 0}>
          <Layout>
            <Layout.AnnotatedSection title={<SectionTitle icon={QuestionCircleIcon} tone="info" title={t("Something not working?")} />} description={t("Ask us and a real person replies, within one business day.")}>
              <Card>
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <Link url={`mailto:${CONTACT_EMAIL}`} removeUnderline>
                    {CONTACT_EMAIL}
                  </Link>
                  <Button onClick={() => navigate("/app/support")}>{t("Get help")}</Button>
                </InlineStack>
              </Card>
            </Layout.AnnotatedSection>
          </Layout>
        </div>

        {/* ── Brand voice, outside the form: content templates ──────────── */}
        <div hidden={tab !== 1}>
          <Layout>
            {/* Content Templates — Starter+ (matches the pricing table) */}
            <Layout.AnnotatedSection
              title={<SectionTitle icon={PageIcon} title={t("Content templates")} status={entitlements?.contentTemplates ? <Badge>{t("{n, plural, one {# saved} other {# saved}}", { n: templates.length })}</Badge> : null} />}
              description={t("Save writing presets — apply from the product page with one click.")}
            >
              <Card>
                {!entitlements?.contentTemplates ? (
                  /* The feature, blurred, under a lock card (Tapita 074): a
                     merchant sees what a template is before deciding. */
                  <LockedPreview title={t("Content templates")} sentence={t("Content templates are on {plan} and above.", { plan: templatesPlan })} onSeePlans={() => navigate("/app/plans")}>
                    <BlockStack gap="300">
                      {[t("Full SEO Package"), t("Short and punchy")].map((name) => (
                        <InlineStack key={name} align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {name}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {t("Standard (~200-300 words)")}
                            </Text>
                          </BlockStack>
                          <Badge>{t("Default")}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </LockedPreview>
                ) : (
                  <BlockStack gap="400">
                    {templates.length > 0 && (
                      <BlockStack gap="0">
                        {templates.map((tpl, i) => (
                          <Box key={tpl.id}>
                            {i > 0 ? <Divider /> : null}
                            <Box paddingBlock="300">
                              <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                                <BlockStack gap="050">
                                  <InlineStack gap="200" blockAlign="center">
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                      {tpl.name}
                                    </Text>
                                    {tpl.isDefault && <Badge>{t("Default")}</Badge>}
                                  </InlineStack>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {[t(lengthOptions.find((o) => o.value === tpl.contentLength)?.label ?? tpl.contentLength), templateTypes(tpl.contentTypes, t)].filter(Boolean).join(" · ")}
                                    {tpl.keywords && t(" · keywords: {keywords}", { keywords: tpl.keywords })}
                                  </Text>
                                </BlockStack>
                                <Form method="post">
                                  <input type="hidden" name="actionType" value="deleteTemplate" />
                                  <input type="hidden" name="templateId" value={tpl.id} />
                                  <Button tone="critical" variant="plain" size="slim" submit accessibilityLabel={t("Delete {name}", { name: tpl.name })}>
                                    {t("Delete")}
                                  </Button>
                                </Form>
                              </InlineStack>
                            </Box>
                          </Box>
                        ))}
                        <Divider />
                      </BlockStack>
                    )}

                    <Text as="h3" variant="headingSm">
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
                        {/* A name is the one thing a template needs; with none,
                            the button stays and the field says why. */}
                        <InlineStack align="end">
                          <Button submit loading={isSavingTemplate} disabled={!tplName.trim()}>
                            {t("Save Template")}
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Form>
                  </BlockStack>
                )}
              </Card>
            </Layout.AnnotatedSection>
          </Layout>
        </div>

        {/* ── Automation, outside the form: Bing measurement ────────────── */}
        <div hidden={tab !== 2}>
          <Layout>
            {/* P3.2 (Phase 8) — the merchant's Bing Webmaster key, for the
                crawl-time holdout. Stored like the AI key; the card only ever
                sees booleans. */}
            <Layout.AnnotatedSection
              title={<SectionTitle icon={ChartVerticalIcon} title={t("Measure crawl time with Bing")} status={bing?.saved ? <OnOff on={!!bing?.enabled && !!bing?.siteUrl} onLabel={t("Measuring")} offLabel={bing?.siteUrl ? t("Key saved, switched off") : t("Key cannot see this store")} offTone={bing?.siteUrl ? undefined : "critical"} /> : null} />}
              description={t("A randomised test of how fast Bing crawls the pages we publish, on your own store.")}
            >
              <Card>
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm">
                    {t("Add your Bing Webmaster Tools API key (Bing Webmaster Tools, Settings, API access) and switch measurement on. Each batch of product pages we publish is then split at random: half submitted to Bing through your key, half withheld, and the time to Bing's first crawl recorded for both — a causal result about your own store, usually inside 72 hours. Nothing is sent to Bing until you switch it on. Stored encrypted; never shown again, not even in part.")}
                  </Text>
                  {actionData?.error && bingFormActive && (
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
                      <InlineStack align="end">
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
            </Layout.AnnotatedSection>
          </Layout>
        </div>

        {/* ── Plan ──────────────────────────────────────────────────────── */}
        <div {...panel(3)}>
          <Layout>
            <Layout.AnnotatedSection title={<SectionTitle icon={CreditCardIcon} title={t("Your plan")} />} description={t("What your plan includes, and where to change it.")}>
              <Card>
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="p" variant="headingLg">
                        {planLabel}
                      </Text>
                      <Badge tone="success">{t("Current plan")}</Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {[
                        entitlements?.bulkJobs ? t("Bulk runs") : null,
                        entitlements?.contentTemplates ? t("Content templates") : null,
                        entitlements?.autopilot ? t("Autopilot mode") : null,
                        entitlements?.blogPosts ? t("Blog posts") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("Product descriptions, meta tags, FAQ and alt text")}
                    </Text>
                  </BlockStack>
                  <Button onClick={() => navigate("/app/plans")}>{t("Compare plans")}</Button>
                </InlineStack>
              </Card>
            </Layout.AnnotatedSection>

            {/* ── C0.7 / P5.5 — your own AI key, Professional only ──────────────
                The input is deliberately write-only. The loader never receives
                key material, so the field is empty even when a key is saved, and
                the card says "a key is saved" rather than showing any part of
                it. 04-DECISIONS.md: not the key, not a prefix, not a length. */}
            <Layout.AnnotatedSection
              title={<SectionTitle icon={KeyIcon} title={t("Use your own AI key")} status={aiKeyAvailable && (aiKey?.saved || aiKey?.failing) ? (aiKey?.failing ? <Badge tone="critical">{t("Not working")}</Badge> : <Badge tone="success">{aiKey?.validatedAt ? t("Active") : t("Saved, not checked")}</Badge>) : null} />}
              description={t("Generate on your Anthropic account instead of ours.")}
            >
              <Card>
                {!aiKeyAvailable ? (
                  <LockedPreview title={t("Use your own AI key")} sentence={t("Using your own AI key is available on the Professional plan.")} onSeePlans={() => navigate("/app/plans")}>
                    <BlockStack gap="300">
                      <Text as="p" variant="bodySm">
                        {t("Paste an Anthropic API key and this app will generate on your account instead of ours.")}
                      </Text>
                      <TextField label={t("Anthropic API key")} labelHidden value="" onChange={() => {}} autoComplete="off" disabled placeholder="sk-ant-..." />
                    </BlockStack>
                  </LockedPreview>
                ) : (
                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm">
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
                        <InlineStack align="end">
                          <Button submit loading={isSaving && isSavingAiKey}>
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
                )}
              </Card>
            </Layout.AnnotatedSection>
          </Layout>
        </div>
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
