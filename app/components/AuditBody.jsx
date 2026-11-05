/**
 * AuditBody — the Audit screen, from the loader's shape.
 *
 * Redesign v2 (Nov 2026), matched against Tapita's Site Audit (077 score
 * cards, 074 summary, 075 affected pages), SEOWILL's checker (122/123/127)
 * and Avada's checklist (045):
 *
 *   1. three score cards — Search readiness, AI shopping eligibility and audit
 *      coverage — each a ring on a soft tint with its "Based on n of N" line;
 *   2. the score broken down: the rubric's points per dimension beside the
 *      fields the OpenAI product feed reads, each with a coloured status icon;
 *   3. the issues: three severity cards (Critical · Needs work · Good) that
 *      choose the list below; each row a SEO / GEO / Both chip, the finding,
 *      Details · Fix, and how many scanned products it touches;
 *   4. a bulk fix this plan cannot run, as a blurred preview under a lock card;
 *   5. the products: worst first, real photos, filled by an issue's Details.
 *
 * It lives in a component, not the route module, because a route file may
 * export only route members (tests render this directly).
 *
 * Laws kept (00-CONSTITUTION L5): every number says what it counts over;
 * Shopify's capped count reads "10,000+", never a floor presented as a total;
 * an unknown catalog size is a dash, never 0; a partial scan is named in the
 * subtitle and raises at most one notice; findings are visible on every plan.
 */
import { useState } from "react";
import { useNavigate, useNavigation, useRevalidator } from "react-router";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Button,
  Badge,
  Box,
  Banner,
  IndexTable,
  Pagination,
  Divider,
  Icon,
  Tag,
  SkeletonBodyText,
  useBreakpoints,
} from "@shopify/polaris";
import { LockIcon, ChartVerticalIcon, CartIcon, ProductIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";
import { T } from "../i18n/index.js";
import { ScoreRing } from "./ScoreRing.jsx";
import { ProductThumb } from "./ProductThumb.jsx";
import { IconTile, StatusIcon, TagChip, SeverityCards, LockedPreview } from "./Kit.jsx";
import { IlluAllGood, IlluScan } from "./Illustrations.jsx";
import { blockerRows } from "../utils/fixRows.js";
import { blockerLines, BLOCKER_GROUPS } from "../utils/firstRun.js";
import { getEntitlements, cheapestPlanLabelWith } from "../utils/billing-plans.js";

const TABLE_PAGE_SIZE = 50;

/**
 * Which kind of visibility a finding is about (the tag chip, Tapita 074).
 * GEO: only AI shopping feeds read it. SEO: only search results show it.
 * Both: search engines and AI shopping feeds both need it.
 */
const SURFACE_OF = {
  "openai·title·blocking": "both",
  "openai·description·blocking": "both",
  "openai·image_link·blocking": "both",
  "openai·brand·blocking": "geo",
  "openai·link·blocking": "both",
  "openai·description·degrading": "geo",
  "openai·image alt·degrading": "both",
  "openai·variant options·degrading": "geo",
  "openai·gtin·degrading": "geo",
  "meta-title": "seo",
  "meta-desc": "seo",
  alt: "both",
  stale: "both",
  "passed-title": "both",
  "passed-description": "both",
  "passed-brand": "geo",
  "passed-image": "both",
  "passed-meta": "seo",
  "passed-alt": "both",
  "passed-fresh": "both",
};
const surfaceOf = (id) => SURFACE_OF[id] ?? "both";

/**
 * The partial-audit sentence, one place. This page shows at most one notice,
 * and only when the scan did not cover the whole catalog.
 */
function partialNotice({ scanFailed, truncatedReason, scannedCount }, t) {
  const n = t.number(scannedCount);
  if (scanFailed) {
    return t("Shopify stopped answering while the rest of your catalog was being read, so only the {n} most recently updated products were analyzed. Scores and counts below cover only that portion — rescan to try the rest again.", { n });
  }
  if (truncatedReason === "timeout") {
    return t("The scan hit its time limit after {n} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Try again during a quieter period, or audit sections of your catalog from the Products page.", { n });
  }
  if (truncatedReason === "error") {
    return t("Shopify stopped answering after {n} products — your remaining products were NOT analyzed. Scores and counts below cover only the scanned portion. Rescan to try the rest again.", { n });
  }
  // The cap is not a failure: the subtitle already says "partial scan".
  return null;
}

/**
 * The fields the OpenAI product feed reads. Required fields block a listing;
 * recommended ones only weaken it. Each count is the daily walk's grader run
 * over the scanned products, the same tally the issue rows count.
 */
const FEED_FIELDS = [
  { key: "openai·title·blocking", label: T("Title"), required: true },
  { key: "openai·description·blocking", label: T("Description"), required: true },
  { key: "openai·brand·blocking", label: T("Brand"), required: true },
  { key: "openai·image_link·blocking", label: T("Image"), required: true },
  { key: "openai·description·degrading", label: T("Description long enough to quote"), required: false },
  { key: "openai·image alt·degrading", label: T("Image alt text"), required: false },
];

/** The checks every scanned product passes, for the Good list. */
function passedRows({ tally, missingMeta, missingMetaDesc, missingAltText, staleCount, scannedCount }, t) {
  const all = t("{n} of {scanned} scanned", { n: t.number(scannedCount), scanned: t.number(scannedCount) });
  const checks = [
    { id: "title", failing: tally["openai·title·blocking"] ?? 0, title: t("Every product has a title") },
    { id: "description", failing: (tally["openai·description·blocking"] ?? 0) + (tally["openai·description·degrading"] ?? 0), title: t("Every product has a description an answer can quote") },
    { id: "brand", failing: tally["openai·brand·blocking"] ?? 0, title: t("Every product has a brand") },
    { id: "image", failing: (tally["openai·image_link·blocking"] ?? 0) + (tally["openai·image alt·degrading"] ?? 0), title: t("Every product has an image with alt text") },
    { id: "meta", failing: missingMeta + missingMetaDesc, title: t("Every product has a page title and search description") },
    { id: "alt", failing: missingAltText, title: t("Every image on every product has alt text") },
    { id: "fresh", failing: staleCount, title: t("No published description is older than six months") },
  ];
  return checks.filter((c) => c.failing === 0).map((c) => ({ id: `passed-${c.id}`, severity: "passed", title: c.title, count: all }));
}

/**
 * Which scanned products an issue row is about. Feed rows match on the
 * grader's own finding keys (so the list is exactly the products the count
 * counted); the page-level rows match on the same checks that counted them.
 */
function affectedBy(rowId, products) {
  const byCheck = {
    "meta-title": (p) => !p.checks.hasMetaTitle,
    "meta-desc": (p) => !p.checks.hasMetaDesc,
    alt: (p) => !!p.checks.missingAltText,
    stale: (p) => !!p.isStale,
  };
  const match = byCheck[rowId] ?? ((p) => Array.isArray(p.findingKeys) && p.findingKeys.includes(rowId));
  return products.filter(match);
}

/** A ring in the brand colour for a share that is not a quality score (coverage). */
function ShareRing({ value, label }) {
  const t = useT();
  const px = 112, stroke = 9, r = (px - stroke) / 2, c = 2 * Math.PI * r;
  const n = value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.max(0, Math.min(100, Math.round(Number(value))));
  const name = n === null ? t("{label}: not known", { label }) : t("{label}: {n}%", { label, n });
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} role="img" aria-label={name}>
      <circle cx={px / 2} cy={px / 2} r={r - stroke / 2} style={{ fill: "var(--navaal-brand-tint)" }} />
      <circle cx={px / 2} cy={px / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: "var(--p-color-border-secondary)" }} />
      {n !== null && n > 0 && (
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * n) / 100} ${c}`} transform={`rotate(-90 ${px / 2} ${px / 2})`} style={{ stroke: "var(--navaal-brand)" }} />
      )}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="26" fontWeight="600" style={{ fill: "var(--p-color-text)", fontFamily: "inherit" }}>
        {n === null ? "–" : `${n}%`}
      </text>
    </svg>
  );
}

/** One of the three score cards across the top (Tapita 077). */
function ScoreCard({ icon, title, children, lines }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <IconTile icon={icon} size="sm" />
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
        </InlineStack>
        <BlockStack gap="150" inlineAlign="center">
          {children}
          {lines.filter(Boolean).map((line, i) => (
            <Text key={i} as="p" variant={i === 0 ? "bodyMd" : "bodySm"} fontWeight={i === 0 ? "medium" : undefined} tone={i === 0 ? undefined : "subdued"} alignment="center">
              {line}
            </Text>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

/** A soft bar in the brand colour for one rubric dimension. */
function DimensionBar({ points, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((points / max) * 100))) : 0;
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--p-color-bg-fill-tertiary)", overflow: "hidden" }} aria-hidden="true">
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: "var(--navaal-brand)" }} />
    </div>
  );
}

/** A panel with a small drawing of the feature, a heading, one line and one action. */
function EmptyPanel({ illustration, heading, children, action }) {
  return (
    <Box paddingBlock="600" paddingInline="400">
      <BlockStack gap="300" inlineAlign="center">
        <Box maxWidth="220px" width="100%">
          {illustration}
        </Box>
        <Text as="h2" variant="headingMd" alignment="center">
          {heading}
        </Text>
        <Box maxWidth="460px">
          <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
            {children}
          </Text>
        </Box>
        {action ?? null}
      </BlockStack>
    </Box>
  );
}

export function AuditBody({ data, pending = false, scanFailed = false }) {
  const t = useT();
  const {
    products,
    totalScore,
    missingMeta,
    missingMetaDesc,
    missingAltText,
    staleCount,
    eligibleCount,
    tally: rawTally,
    dimensions,
    truncatedReason,
    scannedCount,
    catalogueCount,
    catalogueExact = true,
    planName,
  } = data;
  const tally = rawTally ?? {};
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = navigation.state === "loading" || revalidator.state === "loading";
  const entitlements = getEntitlements(planName);
  const [chosenSeverity, setSeverity] = useState(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState(null); // { id, label } — the issue the products table is narrowed to
  const { smDown } = useBreakpoints();
  const bulkPlan = cheapestPlanLabelWith("bulkJobs");

  // ── The issue rows ────────────────────────────────────────────────────────
  // The feed findings, through the same mapping Home uses, so the two screens
  // name a finding with the same sentence and the same button.
  const scopeCount = (b) => (b.count === null ? undefined : t("{n} of {scanned} scanned", { n: t.number(b.count), scanned: t.number(scannedCount) }));
  const feedRows = blockerRows(blockerLines(tally, { max: BLOCKER_GROUPS.length, t }), { entitlements, t, navigate, count: scopeCount });
  const optimize = { content: t("Optimize store"), onAction: () => navigate("/app/optimize") };
  // The per-product checks that are not feed findings.
  const seoRows = [
    missingMeta > 0 && {
      id: "meta-title",
      severity: "warning",
      title: t("{n, plural, one {# product has} other {# products have}} no page title, so search engines make one up.", { n: missingMeta }),
      count: scopeCount({ count: missingMeta }),
      action: optimize,
    },
    missingMetaDesc > 0 && {
      id: "meta-desc",
      severity: "warning",
      title: t("{n, plural, one {# product has} other {# products have}} no search description, so the snippet is whatever Google picks.", { n: missingMetaDesc }),
      count: scopeCount({ count: missingMetaDesc }),
      action: optimize,
    },
    missingAltText > 0 && {
      id: "alt",
      severity: "warning",
      title: t("{n, plural, one {# product has} other {# products have}} images without alt text.", { n: missingAltText }),
      count: scopeCount({ count: missingAltText }),
      action: optimize,
    },
    staleCount > 0 && {
      id: "stale",
      severity: "warning",
      title: t("{staleCount, plural, one {# product has} other {# products have}} content older than 6 months", { staleCount }),
      count: scopeCount({ count: staleCount }),
      action: optimize,
    },
  ].filter(Boolean);
  const critical = feedRows.filter((r) => r.severity === "critical");
  const warning = [...feedRows.filter((r) => r.severity === "warning"), ...seoRows];
  const passed = passedRows({ tally, missingMeta, missingMetaDesc, missingAltText, staleCount, scannedCount }, t);
  const lists = {
    critical: { heading: t("Critical ({n})", { n: critical.length }), rows: critical, empty: t("Nothing blocks a scanned product from being listed.") },
    warning: { heading: t("Needs work ({n})", { n: warning.length }), rows: warning, empty: t("Nothing is holding a scanned product back.") },
    good: { heading: t("Good ({n})", { n: passed.length }), rows: passed, empty: t("No check is passed by every scanned product yet.") },
  };
  // Open on the first list with something to fix: an empty "Critical (0)" as
  // the first thing a merchant sees hides the warnings beside it.
  const severity = chosenSeverity ?? (critical.length > 0 ? "critical" : warning.length > 0 ? "warning" : "good");
  const active = lists[severity];
  const lockedRows = feedRows.filter((r) => r.locked);
  const nothingToFix = critical.length === 0 && warning.length === 0;

  // ── The numbers, each with its scope ──────────────────────────────────────
  const scanned = t.number(scannedCount);
  const catalogKnown = catalogueCount !== null && catalogueCount !== undefined;
  const totalText = catalogKnown ? (catalogueExact === false ? `${t.number(catalogueCount)}+` : t.number(catalogueCount)) : null;
  const scoredOfTotal = catalogKnown && catalogueCount >= scannedCount;
  const basedOn = scoredOfTotal ? t("Based on {scanned} of {total} products", { scanned, total: totalText }) : t("Based on {n, plural, one {# product} other {# products}} scanned", { n: scannedCount });
  const eligiblePct = scannedCount > 0 ? Math.round((eligibleCount / scannedCount) * 100) : null;
  // Coverage is a share of an exact total only; against "10,000+" it is not known.
  const coveragePct = scoredOfTotal && catalogueExact !== false && catalogueCount > 0 ? Math.round((scannedCount / catalogueCount) * 100) : null;
  const issueCount = critical.length + warning.length;

  const subtitle = pending
    ? t("Scored the first {n, plural, one {# product} other {# products}} — the rest of your catalog is still being read", { n: products.length })
    : [
        scoredOfTotal ? t("Scored {scanned} of {total} products", { scanned, total: totalText }) : t("Scored {n, plural, one {# product} other {# products}}", { n: scannedCount }),
        truncatedReason || scanFailed ? t("partial scan") : null,
      ]
        .filter(Boolean)
        .join(" · ");
  const notice = partialNotice({ scanFailed, truncatedReason, scannedCount }, t);

  // ── The products, worst first, optionally narrowed to one issue ───────────
  const tableProducts = filter ? affectedBy(filter.id, products) : products;
  const pageCount = Math.max(1, Math.ceil(tableProducts.length / TABLE_PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = tableProducts.slice(pageIndex * TABLE_PAGE_SIZE, (pageIndex + 1) * TABLE_PAGE_SIZE);
  const showInTable = (row) => {
    if (filter?.id === row.id) {
      setFilter(null);
    } else {
      setFilter({ id: row.id, label: row.title });
    }
    setPage(0);
    if (typeof document !== "undefined") document.getElementById("audit-breakdown")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Page
      title={t("Audit")}
      subtitle={subtitle}
      primaryAction={optimize}
      secondaryActions={[
        {
          content: t("Rescan"),
          onAction: () => revalidator.revalidate(),
          loading: isLoading,
          disabled: isLoading,
        },
      ]}
    >
      <BlockStack gap="500">
        {notice && (
          <Banner tone="warning" title={t("This is a partial audit")}>
            <p>{notice}</p>
          </Banner>
        )}

        {/* Phase 2 item 2.10 — an empty store is not a store that scores 0. */}
        {products.length === 0 ? (
          <Card>
            <EmptyPanel illustration={<IlluScan />} heading={t("Nothing to audit yet")} action={<Button url="shopify://admin/products/new" target="_blank">{t("Add a product in Shopify")}</Button>}>
              {t("Add products to your store, and this is where you generate content for them.")}
            </EmptyPanel>
          </Card>
        ) : (
          <>
            {/* 1. The three score cards (Tapita 077). */}
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              <ScoreCard
                icon={ChartVerticalIcon}
                title={t("Search readiness")}
                lines={[nothingToFix ? t("Nothing to fix in the products scanned") : t("{n, plural, one {# issue} other {# issues}} to fix", { n: issueCount }), basedOn]}
              >
                <ScoreRing value={totalScore} size="large" tint label={t("Search readiness")} />
              </ScoreCard>
              <ScoreCard icon={CartIcon} title={t("AI shopping eligibility")} lines={[t("{eligible} of {scanned} scanned can be listed", { eligible: t.number(eligibleCount), scanned }), t("Checked against the OpenAI product feed")]}>
                <ScoreRing value={eligiblePct} size="large" tint label={t("AI shopping eligibility")} />
              </ScoreCard>
              <ScoreCard
                icon={ProductIcon}
                title={t("Audit coverage")}
                lines={[
                  scoredOfTotal ? t("{scanned} of {total} products audited", { scanned, total: totalText }) : t("{n, plural, one {# product} other {# products}} audited", { n: scannedCount }),
                  catalogKnown ? t("Active products on your Online Store") : t("We could not read your catalog size from Shopify just now"),
                ]}
              >
                <ShareRing value={coveragePct} label={t("Audit coverage")} />
              </ScoreCard>
            </InlineGrid>

            {/* 2. The score, broken down: the rubric beside the feed fields. */}
            <Card>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="600">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="baseline" gap="200" wrap>
                    <Text as="h2" variant="headingMd">
                      {t("Search readiness, by part")}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {basedOn}
                    </Text>
                  </InlineStack>
                  {dimensions.map((d) => (
                    <BlockStack key={d.key} gap="100">
                      <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                        <Text as="span" variant="bodySm">
                          {t(d.label)}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued" numeric>
                          {t("{points} of {max}", { points: d.points, max: d.max })}
                        </Text>
                      </InlineStack>
                      <DimensionBar points={d.points} max={d.max} />
                    </BlockStack>
                  ))}
                </BlockStack>
                <BlockStack gap="300">
                  <FeedFieldGroup heading={t("Required by the OpenAI feed")} fields={FEED_FIELDS.filter((f) => f.required)} tally={tally} />
                  <FeedFieldGroup heading={t("Recommended")} fields={FEED_FIELDS.filter((f) => !f.required)} tally={tally} />
                </BlockStack>
              </InlineGrid>
            </Card>

            {/* 3. The issues (Tapita 074, SEOWILL 122). */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="baseline" gap="300" wrap>
                  <Text as="h2" variant="headingMd">
                    {t("Issues")}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Counted over the {n} products scanned", { n: scanned })}
                  </Text>
                </InlineStack>
                <SeverityCards critical={critical.length} warning={warning.length} good={passed.length} selected={severity} onSelect={setSeverity} />
                {nothingToFix ? (
                  <EmptyPanel illustration={<IlluAllGood />} heading={t("Nothing to fix in the products scanned")}>
                    {t("Every scanned product has what search engines and AI shopping feeds need. The products you have not scanned yet may still have gaps.")}
                  </EmptyPanel>
                ) : null}
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    {active.heading}
                  </Text>
                  {active.rows.length === 0 ? (
                    <Box paddingBlock="300">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {active.empty}
                      </Text>
                    </Box>
                  ) : (
                    <BlockStack gap="0">
                      {active.rows.map((row, i) => (
                        <Box key={row.id}>
                          {i > 0 ? <Divider /> : null}
                          <IssueRow
                            row={row}
                            bulkPlan={bulkPlan}
                            canShow={row.severity !== "passed" && !pending && affectedBy(row.id, products).length > 0}
                            showing={filter?.id === row.id}
                            onDetails={() => showInTable(row)}
                          />
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* 4. A bulk fix this plan cannot run: the real thing, blurred. */}
            {lockedRows.length > 0 && (
              <Card>
                <LockedPreview title={t("Fix these in one run")} sentence={t("Fixing many products at once is on {plan} and above.", { plan: bulkPlan })} onSeePlans={() => navigate("/app/plans")}>
                  <BlockStack gap="300">
                    {lockedRows.map((row) => (
                      <InlineStack key={row.id} align="space-between" blockAlign="center" gap="300" wrap={false}>
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <StatusIcon status={row.severity} />
                          <Text as="span" variant="bodyMd">
                            {row.title}
                          </Text>
                        </InlineStack>
                        <Button size="slim">{t("Fix all")}</Button>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </LockedPreview>
              </Card>
            )}

            {/* 5. The products: the expensive half of the page, so the half that
                waits. A skeleton the size of the table it replaces. */}
            {pending ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("Product breakdown")}
                  </Text>
                  <SkeletonBodyText lines={12} />
                </BlockStack>
              </Card>
            ) : (
              <div id="audit-breakdown">
                <Card padding="0">
                  <Box padding="400" paddingBlockEnd="200">
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="baseline" gap="300" wrap>
                        <Text as="h2" variant="headingMd">
                          {filter ? t("Products with this issue") : t("Product breakdown")}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("{n, plural, one {# product} other {# products}}, lowest score first", { n: tableProducts.length })}
                        </Text>
                      </InlineStack>
                      {filter ? (
                        <InlineStack>
                          <Tag
                            onRemove={() => {
                              setFilter(null);
                              setPage(0);
                            }}
                          >
                            {filter.label}
                          </Tag>
                        </InlineStack>
                      ) : null}
                    </BlockStack>
                  </Box>
                  <IndexTable
                    resourceName={{ singular: t("product"), plural: t("products") }}
                    itemCount={pageRows.length}
                    selectable={false}
                    condensed={smDown}
                    headings={[
                      { id: "product", title: t("Product") },
                      { id: "score", title: t("Score") },
                      { id: "missing", title: t("Missing") },
                      { id: "edit", title: t("Edit"), hidden: true },
                    ]}
                  >
                    {pageRows.map((p, index) =>
                      smDown ? (
                        // On a phone the row is one block: photo, title and
                        // score on a line, what is missing under it.
                        <IndexTable.Row id={p.id} key={p.id} position={index} onClick={() => navigate(`/app/products/${p.numericId}`)}>
                          <Box padding="300" width="100%">
                            <BlockStack gap="200">
                              <InlineStack gap="300" blockAlign="center" wrap={false}>
                                <ProductThumb url={p.imageUrl} />
                                <Box width="100%">
                                  <Text as="span" variant="bodyMd" fontWeight="medium">
                                    {p.title}
                                  </Text>
                                </Box>
                                <ScoreRing value={p.score} size="xs" tint label={t("Score")} />
                              </InlineStack>
                              <MissingBadges product={p} />
                            </BlockStack>
                          </Box>
                        </IndexTable.Row>
                      ) : (
                        <IndexTable.Row id={p.id} key={p.id} position={index}>
                          <IndexTable.Cell>
                            {/* Photo and name in one cell, as the category's lists do. */}
                            <InlineStack gap="300" blockAlign="center" wrap={false}>
                              <ProductThumb url={p.imageUrl} />
                              <Text as="span" variant="bodyMd" fontWeight="medium">
                                {p.title}
                              </Text>
                            </InlineStack>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <ScoreRing value={p.score} size="xs" tint label={t("Score")} />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <MissingBadges product={p} />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <InlineStack align="end">
                              <Button size="slim" onClick={() => navigate(`/app/products/${p.numericId}`)}>
                                {t("Edit")}
                              </Button>
                            </InlineStack>
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ),
                    )}
                  </IndexTable>
                  {pageCount > 1 && (
                    <Box padding="400">
                      <InlineStack align="center">
                        <Pagination
                          label={t("Page {page} of {pages}", { page: pageIndex + 1, pages: pageCount })}
                          hasPrevious={pageIndex > 0}
                          hasNext={pageIndex < pageCount - 1}
                          onPrevious={() => setPage(pageIndex - 1)}
                          onNext={() => setPage(pageIndex + 1)}
                        />
                      </InlineStack>
                    </Box>
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}

/** One group of feed fields: a coloured status, the field, and how many scanned products lack it. */
function FeedFieldGroup({ heading, fields, tally }) {
  const t = useT();
  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm">
        {heading}
      </Text>
      {fields.map((f) => {
        const n = tally[f.key] ?? 0;
        return (
          <InlineStack key={f.key} align="space-between" blockAlign="center" gap="300" wrap={false}>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <span style={{ display: "inline-flex", flexShrink: 0 }}>
                <StatusIcon status={n === 0 ? "good" : f.required ? "critical" : "warning"} />
              </span>
              <Text as="span" variant="bodySm">
                {t(f.label)}
              </Text>
            </InlineStack>
            {/* The count never wraps: "0 / missing" on two lines reads as two values. */}
            <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              <Text as="span" variant="bodySm" numeric tone={n === 0 ? "subdued" : f.required ? "critical" : "caution"}>
                {t("{n} missing", { n: t.number(n) })}
              </Text>
            </span>
          </InlineStack>
        );
      })}
    </BlockStack>
  );
}

/**
 * One finding (Tapita 074, SEOWILL 122): its status, a SEO / GEO / Both chip,
 * the sentence, Details · Fix, and how many scanned products it touches.
 * Details fills the products table underneath with exactly those products.
 */
function IssueRow({ row, bulkPlan, canShow, showing, onDetails }) {
  const t = useT();
  const status = row.severity === "passed" ? "good" : row.severity;
  return (
    <Box paddingBlock="300">
      <InlineStack gap="300" blockAlign="start" wrap={false}>
        <Box paddingBlockStart="050">
          <StatusIcon status={status} />
        </Box>
        <Box width="100%">
          <InlineGrid columns={{ xs: "1fr", sm: "1fr auto" }} gap="300" alignItems="start">
            <BlockStack gap="150">
              <InlineStack gap="200" blockAlign="start" wrap={false}>
                <Box paddingBlockStart="025">
                  <TagChip kind={surfaceOf(row.id)} />
                </Box>
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  {row.title}
                </Text>
              </InlineStack>
              {row.locked ? (
                <InlineStack gap="100" blockAlign="center" wrap={false}>
                  <span style={{ display: "inline-flex" }}>
                    <Icon source={LockIcon} tone="subdued" accessibilityLabel={t("Locked")} />
                  </span>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Fixing many at once: {plan} and above", { plan: bulkPlan })}
                  </Text>
                </InlineStack>
              ) : null}
              {canShow || row.action ? (
                <InlineStack gap="400" blockAlign="center">
                  {canShow ? (
                    <Button variant="plain" onClick={onDetails} ariaControls="audit-breakdown" pressed={showing}>
                      {showing ? t("Hide details") : t("Details")}
                    </Button>
                  ) : null}
                  {row.action ? (
                    <Button variant="plain" url={row.action.url} onClick={row.action.onAction} external={row.action.external} target={row.action.external ? "_blank" : undefined}>
                      {row.action.content}
                    </Button>
                  ) : null}
                </InlineStack>
              ) : null}
            </BlockStack>
            {row.count ? (
              <span style={{ whiteSpace: "nowrap" }}>
                <Text as="span" variant="bodyMd" tone="subdued" numeric>
                  {row.count}
                </Text>
              </span>
            ) : null}
          </InlineGrid>
        </Box>
      </InlineStack>
    </Box>
  );
}

/**
 * What a scanned product is missing, as words. A row carries only what is
 * wrong with it, and a row with nothing wrong says so.
 */
function MissingBadges({ product }) {
  const t = useT();
  const { checks, feedBlocking, isStale } = product;
  const items = [
    !checks.hasDescription && t("No description"),
    !checks.hasMetaTitle && t("No page title"),
    !checks.hasMetaDesc && t("No search description"),
    checks.noImages ? t("No images") : checks.missingAltText ? t("Alt text missing") : null,
    isStale && t("Older than 6 months"),
  ].filter(Boolean);
  if (feedBlocking > 0 && items.length === 0) items.push(t("Feed cannot list it"));
  if (items.length === 0) {
    return <Badge tone="success">{t("Nothing missing")}</Badge>;
  }
  return (
    <InlineStack gap="100" wrap>
      {items.map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
    </InlineStack>
  );
}

export default AuditBody;
