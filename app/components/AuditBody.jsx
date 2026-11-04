/**
 * AuditBody — the Audit screen, from the loader's shape.
 *
 * Redesign (Nov 2026). The audit is its own destination in every top app in
 * the category (Tapita's Site Audit, SEOWILL's checker, Avada's checklist):
 * the score with its scope, the issues grouped Critical / Warning / Passed,
 * the products each issue touches, and the place it is fixed. That is the
 * order here:
 *
 *   1. two cards — Search readiness (the store score and how its points fall
 *      per rubric dimension) and AI shopping eligibility (the share of
 *      scanned products the OpenAI feed can list, and the field that stops
 *      the rest);
 *   2. the issues, by severity, each row a finding, its count over the
 *      scanned products and its one action; the count opens the affected
 *      products, and "show all" filters the breakdown below to them;
 *   3. the product breakdown, worst first, with each product's own photo.
 *
 * It lives in a component, not the route module, because a route file may
 * export only route members (tests render this directly).
 *
 * Laws kept (00-CONSTITUTION L5): every count says what it counts over; a
 * locked bulk fix is a lock, one sentence naming the plan and a plain link;
 * a partial scan is named in the subtitle and raises at most one notice.
 */
import { useState } from "react";
import { useNavigate, useNavigation, useRevalidator } from "react-router";
import {
  EmptyState,
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
  Tabs,
  IndexTable,
  Pagination,
  Divider,
  Icon,
  Collapsible,
  ProgressBar,
  Tag,
  SkeletonBodyText,
  useBreakpoints,
} from "@shopify/polaris";
import { AlertDiamondIcon, AlertTriangleIcon, CheckCircleIcon, LockIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";
import { T } from "../i18n/index.js";
import { ScoreRing } from "./ScoreRing.jsx";
import { ProductThumb } from "./ProductThumb.jsx";
import { blockerRows } from "../utils/fixRows.js";
import { blockerLines, BLOCKER_GROUPS } from "../utils/firstRun.js";
import { getEntitlements } from "../utils/billing-plans.js";

const TABLE_PAGE_SIZE = 50;
/** Affected products listed under an opened issue before "show all". */
const AFFECTED_PREVIEW = 5;

const SEVERITY = {
  critical: { icon: AlertDiamondIcon, tone: "critical" },
  warning: { icon: AlertTriangleIcon, tone: "caution" },
  passed: { icon: CheckCircleIcon, tone: "success" },
};

/**
 * The partial-audit sentence, one place. This page shows at most one notice,
 * and only when the scan did not cover the whole catalogue.
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
  // The cap is not a failure: the subtitle already says "Scored 500 of
  // 10,000 products · partial scan", and a banner on every load of every
  // large store would be the one notice this page allows, spent on nothing.
  return null;
}

/**
 * The fields the OpenAI product feed reads, in the eligibility card. Required
 * fields block a listing; recommended ones only weaken it. Each count is the
 * daily walk's grader run over the scanned products (feedFindings in the
 * loader), so it is the same tally the Critical and Warning tabs count.
 */
const FEED_FIELDS = [
  { key: "openai·title·blocking", label: T("Title"), required: true },
  { key: "openai·description·blocking", label: T("Description"), required: true },
  { key: "openai·brand·blocking", label: T("Brand"), required: true },
  { key: "openai·image_link·blocking", label: T("Image"), required: true },
  { key: "openai·description·degrading", label: T("Description long enough to quote"), required: false },
  { key: "openai·image alt·degrading", label: T("Image alt text"), required: false },
];

/** The checks every scanned product passes, for the Passed tab. */
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
    planName,
  } = data;
  const tally = rawTally ?? {};
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = navigation.state === "loading" || revalidator.state === "loading";
  const entitlements = getEntitlements(planName);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const [openRow, setOpenRow] = useState(null);
  const [filter, setFilter] = useState(null); // { id, label } — the issue the breakdown is narrowed to
  const { smDown } = useBreakpoints();

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
  const tabs = [
    { id: "critical", content: t("Critical ({n})", { n: critical.length }), rows: critical, empty: t("Nothing blocks a scanned product from being listed.") },
    { id: "warning", content: t("Warning ({n})", { n: warning.length }), rows: warning, empty: t("Nothing is holding a scanned product back.") },
    { id: "passed", content: t("Passed ({n})", { n: passed.length }), rows: passed, empty: t("No check is passed by every scanned product yet.") },
  ];
  const activeTab = tabs[Math.min(tab, tabs.length - 1)];

  const eligiblePct = scannedCount > 0 ? Math.round((eligibleCount / scannedCount) * 100) : null;

  // ── The title row ─────────────────────────────────────────────────────────
  const scanned = t.number(scannedCount);
  const subtitle = pending
    ? t("Scored the first {n, plural, one {# product} other {# products}} — the rest of your catalog is still being read", { n: products.length })
    : [
        catalogueCount === null || catalogueCount < scannedCount
          ? t("Scored {n, plural, one {# product} other {# products}}", { n: scannedCount })
          : t("Scored {scanned} of {total} products", { scanned, total: t.number(catalogueCount) }),
        truncatedReason || scanFailed ? t("partial scan") : null,
      ]
        .filter(Boolean)
        .join(" · ");
  const notice = partialNotice({ scanFailed, truncatedReason, scannedCount }, t);

  // ── The product breakdown, worst first, optionally narrowed to one issue ─
  const tableProducts = filter ? affectedBy(filter.id, products) : products;
  const pageCount = Math.max(1, Math.ceil(tableProducts.length / TABLE_PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = tableProducts.slice(pageIndex * TABLE_PAGE_SIZE, (pageIndex + 1) * TABLE_PAGE_SIZE);
  const showAllInTable = (row) => {
    setFilter({ id: row.id, label: row.title });
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
            <EmptyState heading={t("Nothing to audit yet")} image="/empty-seo.svg">
              <p>{t("Add products to your store, and this is where you generate content for them.")}</p>
            </EmptyState>
          </Card>
        ) : (
          <>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              {/* Search readiness: the store score, and how its points fall. */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {t("Search readiness")}
                  </Text>
                  <InlineGrid columns={{ xs: 1, sm: "auto 1fr" }} gap="500" alignItems="start">
                    <ScoreRing
                      value={totalScore}
                      size="large"
                      label={t("Search readiness")}
                      caption={t("across {n, plural, one {# product} other {# products}} scanned", { n: scannedCount })}
                    />
                    <BlockStack gap="300">
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
                          <ProgressBar progress={d.max > 0 ? Math.round((d.points / d.max) * 100) : 0} size="small" tone="primary" animated={false} />
                        </BlockStack>
                      ))}
                    </BlockStack>
                  </InlineGrid>
                </BlockStack>
              </Card>

              {/* AI shopping eligibility: the share of scanned products the
                  OpenAI product feed could list as they stand, and the field
                  that stops each of the rest. */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {t("AI shopping eligibility")}
                  </Text>
                  <InlineGrid columns={{ xs: 1, sm: "auto 1fr" }} gap="500" alignItems="start">
                    <ScoreRing
                      value={eligiblePct}
                      size="large"
                      label={t("AI shopping eligibility")}
                      caption={t("{eligible} of {scanned} scanned can be listed", { eligible: t.number(eligibleCount), scanned })}
                    />
                    <BlockStack gap="300">
                      <FeedFieldGroup heading={t("Required by the OpenAI feed")} fields={FEED_FIELDS.filter((f) => f.required)} tally={tally} />
                      <FeedFieldGroup heading={t("Recommended")} fields={FEED_FIELDS.filter((f) => !f.required)} tally={tally} />
                    </BlockStack>
                  </InlineGrid>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* The issues, by severity. */}
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="baseline" gap="300" wrap>
                  <Text as="h2" variant="headingMd">
                    {t("Issues")}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Counted over the {n} products scanned", { n: scanned })}
                  </Text>
                </InlineStack>
                <Tabs
                  tabs={tabs.map(({ id, content }) => ({ id, content }))}
                  selected={tab}
                  onSelect={(i) => {
                    setTab(i);
                    setOpenRow(null);
                  }}
                />
                {activeTab.rows.length === 0 ? (
                  <Box paddingBlock="300">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {activeTab.empty}
                    </Text>
                  </Box>
                ) : (
                  <BlockStack gap="0">
                    {activeTab.rows.map((row, i) => (
                      <Box key={row.id}>
                        {i > 0 ? <Divider /> : null}
                        <IssueRow
                          row={row}
                          affected={row.severity === "passed" || pending ? [] : affectedBy(row.id, products)}
                          open={openRow === row.id}
                          onToggle={() => setOpenRow(openRow === row.id ? null : row.id)}
                          onShowAll={() => showAllInTable(row)}
                          navigate={navigate}
                        />
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* The product breakdown: the expensive half of this page, so the
                half that waits. A skeleton the size of the table it replaces. */}
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
                          {t("Product breakdown")}
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
                      { id: "thumb", title: t("Image"), hidden: true },
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
                                <ScoreRing value={p.score} size="xs" label={t("Score")} />
                              </InlineStack>
                              <MissingBadges product={p} />
                            </BlockStack>
                          </Box>
                        </IndexTable.Row>
                      ) : (
                        <IndexTable.Row id={p.id} key={p.id} position={index}>
                          <IndexTable.Cell>
                            <ProductThumb url={p.imageUrl} />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" variant="bodyMd" fontWeight="medium">
                              {p.title}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <ScoreRing value={p.score} size="xs" label={t("Score")} />
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

/** One group of feed fields: the field, and how many scanned products lack it. */
function FeedFieldGroup({ heading, fields, tally }) {
  const t = useT();
  return (
    <BlockStack gap="100">
      <Text as="h3" variant="headingSm">
        {heading}
      </Text>
      {fields.map((f) => {
        const n = tally[f.key] ?? 0;
        return (
          <InlineStack key={f.key} align="space-between" blockAlign="center" gap="300" wrap={false}>
            <Text as="span" variant="bodySm">
              {t(f.label)}
            </Text>
            <Text as="span" variant="bodySm" numeric tone={n === 0 ? "subdued" : f.required ? "critical" : "caution"}>
              {t("{n} missing", { n: t.number(n) })}
            </Text>
          </InlineStack>
        );
      })}
    </BlockStack>
  );
}

/**
 * One finding: severity, the sentence, its count, its one action. The count
 * opens the scanned products the finding is about, each with its photo and
 * its Edit; past five, "Show all" narrows the breakdown table to them.
 */
function IssueRow({ row, affected, open, onToggle, onShowAll, navigate }) {
  const t = useT();
  const sev = SEVERITY[row.severity] ?? SEVERITY.warning;
  const severityLabel = { critical: t("Critical"), warning: t("Warning"), passed: t("Passed") }[row.severity] ?? t("Warning");
  const collapsibleId = `audit-issue-${row.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const canOpen = affected.length > 0;
  return (
    <Box paddingBlock="300">
      <InlineStack gap="300" blockAlign="start" wrap={false}>
        <Box paddingBlockStart="050">
          <Icon source={sev.icon} tone={sev.tone} accessibilityLabel={severityLabel} />
        </Box>
        <Box width="100%">
          <BlockStack gap="200">
            <InlineGrid columns={{ xs: "1fr", sm: "1fr auto" }} gap="300" alignItems="center">
              <BlockStack gap="050">
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  {row.title}
                </Text>
                {row.detail ? (
                  <InlineStack gap="100" blockAlign="center" wrap={false}>
                    {row.locked ? (
                      <span>
                        <Icon source={LockIcon} tone="subdued" accessibilityLabel={t("Locked")} />
                      </span>
                    ) : null}
                    <Text as="p" variant="bodySm" tone="subdued">
                      {row.detail}
                    </Text>
                  </InlineStack>
                ) : null}
              </BlockStack>
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                {row.count ? (
                  canOpen ? (
                    <Button variant="monochromePlain" disclosure={open ? "up" : "down"} onClick={onToggle} ariaExpanded={open} ariaControls={collapsibleId}>
                      {row.count}
                    </Button>
                  ) : (
                    <Text as="span" variant="bodyMd" tone="subdued" numeric>
                      {row.count}
                    </Text>
                  )
                ) : null}
                {row.action ? (
                  <Button
                    size="slim"
                    variant={row.locked ? "plain" : undefined}
                    url={row.action.url}
                    onClick={row.action.onAction}
                    external={row.action.external}
                    target={row.action.external ? "_blank" : undefined}
                  >
                    {row.action.content}
                  </Button>
                ) : null}
              </InlineStack>
            </InlineGrid>
            {canOpen ? (
              <Collapsible id={collapsibleId} open={open} transition={{ duration: "150ms", timingFunction: "ease-in-out" }}>
                <BlockStack gap="0">
                  {affected.slice(0, AFFECTED_PREVIEW).map((p) => (
                    <Box key={p.id} paddingBlock="150">
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <ProductThumb url={p.imageUrl} size="extraSmall" />
                        <Box width="100%">
                          <Text as="span" variant="bodySm" truncate>
                            {p.title}
                          </Text>
                        </Box>
                        <Button variant="plain" onClick={() => navigate(`/app/products/${p.numericId}`)}>
                          {t("Edit")}
                        </Button>
                      </InlineStack>
                    </Box>
                  ))}
                  {affected.length > AFFECTED_PREVIEW ? (
                    <Box paddingBlockStart="150">
                      <Button variant="plain" onClick={onShowAll}>
                        {t("Show all {n} in the breakdown", { n: t.number(affected.length) })}
                      </Button>
                    </Box>
                  ) : null}
                </BlockStack>
              </Collapsible>
            ) : null}
          </BlockStack>
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
