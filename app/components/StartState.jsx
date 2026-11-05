/**
 * The Start state — Phase 3 items 3.1 and 3.2.
 *
 * What a merchant sees on `/app` while `Shop.firstDraftSeenAt` is null. It is
 * the first-run experience the retired `/app/welcome` used to be, moved onto
 * Home so there is no redirect and no extra top-level route in the embedded
 * chain.
 *
 * Redesign (Nov 2026) — three screens ending in a number, the shape every top
 * app in the category uses (StoreSEO, Avada, SEOWILL: goal → scan → score):
 *
 *   1. Goal. One click between two outcomes. Nothing is typed and nothing
 *      waits on it: the scan was started by the loader and streams in
 *      behind this screen. The choice is not stored; it orders the "what to
 *      fix first" rows on the result and nothing else, so it promises nothing.
 *   2. Scan. The real scan, as a list of what it reads. All rows share the one
 *      state the promise has (reading → done); no step is ticked on a timer,
 *      because no step reports its own progress and a ticked row would be a
 *      claim nobody measured.
 *   3. Result. The score ring with its scope ("across 30 of 10,000+
 *      products"), the same number under the same name as Home's ring; what
 *      to fix first; and one primary: write the first three drafts.
 *
 * What did not change, and why it matters:
 *
 *  - **No forms.** Brand voice is inferred and can be corrected later in
 *    Settings; nothing here blocks on input.
 *  - **The cost is stated before it is spent**, in the same sentence as the
 *    remaining credits, directly under the button that spends them.
 *  - **Generation is per product**, one fetcher each, so one slow product
 *    cannot hold up the other two. It now starts when the merchant presses
 *    "Write the first 3 drafts" rather than on arrival.
 *  - **Refreshing never re-charges.** The idempotency is server-side, keyed by
 *    shop + product (`reserveCredit` in quickStart.server.js): a recent draft is
 *    returned as-is, an in-flight credit is waited on, and a credit whose
 *    request died is reused rather than charged twice. A merchant who comes
 *    back with drafts already inside that window lands on the result with the
 *    drafts showing.
 *  - **A 55 s watchdog** turns a hung generation into a retry button rather
 *    than a spinner that never resolves.
 */
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useT, useStoredT } from "../i18n/react.jsx";
import { Await, useFetcher } from "react-router";
import { scoreTone } from "../utils/scoreBands.js";
import { languageName, languageSourceLabel } from "../utils/language.js";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Button,
  Box,
  Badge,
  Banner,
  Spinner,
  Layout,
  EmptyState,
  Icon,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import { CheckCircleIcon, SearchIcon, CartIcon, ProductIcon, TextBlockIcon, TargetIcon } from "@shopify/polaris-icons";
import { StepDots, ChoiceCard, IconTile, SeverityCards } from "./Kit.jsx";
import { IlluScan } from "./Illustrations.jsx";
import { GeoRubric } from "./GeoRubric.jsx";
import { ScoreRing } from "./ScoreRing.jsx";
import { IssueList } from "./IssueList.jsx";
import { ProductThumb } from "./ProductThumb.jsx";
import { WATCH_FROM_HERE, BLOCKER_GROUPS, PASSWORD_BLOCKER, blockerLine, canRunFix } from "../utils/firstRun.js";
import { blockerRows } from "../utils/fixRows.js";
import { getEntitlements, cheapestPlanLabelWith } from "../utils/billing-plans.js";
import { costSentence, uniformScoreNote } from "../utils/startCopy.js";

/** Never let a generation spin forever — flip to a retry the merchant can press. */
export const WATCHDOG_MS = 55_000;

/** Every check the first-run walk makes: the feed's groups plus the storefront password. */
export const FIRST_RUN_CHECKS = Object.freeze([...BLOCKER_GROUPS, PASSWORD_BLOCKER]);

/** Critical / needs work / good over FIRST_RUN_CHECKS. One finding per check key. */
export function severityCounts(all) {
  const found = new Set(all.map((b) => b?.key));
  const of = (grade) => FIRST_RUN_CHECKS.filter((g) => g.grade === grade && found.has(g.key)).length;
  return { critical: of("blocking"), warning: of("degrading"), good: FIRST_RUN_CHECKS.filter((g) => !found.has(g.key)).length };
}

/** The two outcomes the goal screen offers. Search reads page content; AI shopping lists from feed fields. */
const GOALS = Object.freeze({ search: "search", shopping: "shopping" });

function usePlanLabel(planName) {
  const t = useT();
  const labels = { free: t("Free"), starter: t("Starter"), growth: t("Growth"), pro: t("Professional") };
  return labels[planName] ?? planName;
}

/** "10,000+ products · Free plan" — the same two facts Home's title row states. */
function useSubtitle(start) {
  const t = useT();
  const planLabel = usePlanLabel(start?.planName ?? "free");
  const n = Number(start?.totalProducts);
  const products = Number.isFinite(n) ? (start?.totalExact === false ? t("{count}+ products", { count: t.number(n) }) : t("{n, plural, one {# product} other {# products}}", { n })) : null;
  return [products, t("{plan} plan", { plan: planLabel })].filter(Boolean).join(" · ");
}

/* ── The onboarding card (Avada 030/031, SEOWILL 114/115) ────────────────── */

/**
 * A centred card on a soft brand-tint shape, step dots at the top. Goal and
 * scan sit in it; the result keeps the dots but takes the full width, because
 * it carries the ring, the severity cards and the rows side by side.
 */
function StartCard({ step, children }) {
  return (
    <div className="nv-stage">
      <Card>
        <Box padding="200">
          <BlockStack gap="500">
            <InlineStack align="center">
              <StepDots total={3} current={step} />
            </InlineStack>
            {children}
          </BlockStack>
        </Box>
      </Card>
    </div>
  );
}

/* ── Screen 1 — goal ─────────────────────────────────────────────────────── */

function GoalScreen({ start, onChoose }) {
  const t = useT();
  const subtitle = useSubtitle(start);
  const options = [
    { id: GOALS.search, icon: SearchIcon, title: t("Found in search"), body: t("Google, Bing and AI answers read your product pages.") },
    { id: GOALS.shopping, icon: CartIcon, title: t("Listed in AI shopping"), body: t("ChatGPT and Shop list products from your catalog's fields.") },
  ];
  return (
    <Page title={t("Home")} subtitle={subtitle} narrowWidth>
      <StartCard step={0}>
        <BlockStack gap="200" inlineAlign="center">
          <Text as="h2" variant="headingXl" alignment="center">
            {t("What do you want more of?")}
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
            {t("Pick one. Your catalog is already being read.")}
          </Text>
        </BlockStack>
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          {options.map((o) => (
            <ChoiceCard key={o.id} icon={o.icon} title={o.title} body={o.body} onSelect={() => onChoose(o.id)} />
          ))}
        </InlineGrid>
      </StartCard>
    </Page>
  );
}

/* ── Screen 2 — scan ─────────────────────────────────────────────────────── */

/**
 * What the scan reads, in order (StoreSEO 022). One state for all of them:
 * the promise's. No row is ticked on a timer, because no step reports its own
 * progress and a ticked row would be a claim nobody measured.
 */
function ScanList({ done, scanned }) {
  const t = useT();
  const rows = [
    { icon: ProductIcon, label: t("Reading your active products") },
    { icon: TextBlockIcon, label: t("Scoring descriptions, page titles and search descriptions") },
    { icon: CartIcon, label: t("Checking the fields the OpenAI product feed requires") },
    { icon: TargetIcon, label: t("Picking the three products to start with") },
  ];
  return (
    <StartCard step={1}>
      <BlockStack gap="100" inlineAlign="center">
        <Text as="h2" variant="headingXl" alignment="center">
          {done ? t("Scan complete") : t("Reading your catalog")}
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
          {done ? t("{n, plural, one {# product} other {# products}} read and scored", { n: scanned }) : t("Started when you opened the app")}
        </Text>
      </BlockStack>
      <Box borderWidth="025" borderColor="border" borderRadius="300" padding="300">
        <BlockStack gap="0">
          {rows.map((row, i) => (
            <Box key={row.label}>
              {i > 0 ? <Divider /> : null}
              <Box paddingBlock="300">
                <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                    <IconTile icon={row.icon} tone="brand" size="sm" />
                    <Text as="p" variant="bodyMd" tone={done ? undefined : "subdued"}>
                      {row.label}
                    </Text>
                  </InlineStack>
                  {/* Wrapped so the Polaris icon keeps its 20px beside the label. */}
                  <Box>{done ? <Icon source={CheckCircleIcon} tone="success" accessibilityLabel={t("Done")} /> : <Spinner size="small" accessibilityLabel={t("In progress")} />}</Box>
                </InlineStack>
              </Box>
            </Box>
          ))}
        </BlockStack>
      </Box>
    </StartCard>
  );
}

/* ── Screen 3 — the drafts ───────────────────────────────────────────────── */

/**
 * One of the three products, with its own fetcher.
 *
 * A component per target rather than three fetchers in the parent: each card
 * owns its request, its watchdog and its retry, so a failure is contained to
 * the card it belongs to.
 */
function TargetCard({ target, autoStart, onDraft }) {
  const t = useT();
  const st = useStoredT();
  const fetcher = useFetcher();
  const fired = useRef(false);
  const [timedOut, setTimedOut] = useState(false);

  const run = useCallback(() => {
    setTimedOut(false);
    const fd = new FormData();
    fd.append("productId", target.productId);
    fd.append("mode", "generate");
    fetcher.submit(fd, { method: "post", action: "/app/quick-start" });
  }, [fetcher, target.productId]);

  // Fire once. `fired` is a ref, not state, so a re-render cannot start a
  // second request — and the server refuses a duplicate anyway.
  useEffect(() => {
    if (!autoStart || fired.current) return;
    fired.current = true;
    run();
  }, [autoStart, run]);

  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (!busy) return undefined;
    const t = setTimeout(() => setTimedOut(true), WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [busy]);

  const data = fetcher.data;

  // Tell the parent the moment a real draft exists, so the primary action can
  // become "Review drafts" without waiting for the other two.
  useEffect(() => {
    if (data?.ok) onDraft?.(target.productId);
  }, [data, onDraft, target.productId]);

  const after = data?.ok ? (data.description || "").replace(/<[^>]+>/g, "").trim() : "";
  const lift = data?.ok && Number.isFinite(data.qualityScore) ? data.qualityScore - target.scoreBefore : null;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <ProductThumb url={target.imageUrl} />
            <Text as="h3" variant="headingMd">
              {target.title}
            </Text>
          </InlineStack>
          <InlineStack gap="200">
            <Badge tone={scoreTone(target.scoreBefore)}>{t("At first run: {scoreBefore}/100", { scoreBefore: target.scoreBefore })}</Badge>
            {lift != null && lift > 0 && <Badge tone="success">{t("+{lift}", { lift })}</Badge>}
          </InlineStack>
        </InlineStack>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              {t("On your store now")}
            </Text>
            <Text as="p" variant="bodyMd" tone={target.beforeSnippet ? undefined : "subdued"}>
              {target.beforeSnippet || t("No description yet")}
            </Text>
          </BlockStack>

          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              {t("Draft")}
            </Text>
            {busy && !timedOut ? (
              <InlineStack gap="200" blockAlign="center">
                <Spinner size="small" accessibilityLabel={t("Writing a draft")} />
                <Text as="p" variant="bodyMd" tone="subdued">
                  {t("Writing a draft from your product…")}
                </Text>
              </InlineStack>
            ) : after ? (
              <Text as="p" variant="bodyMd">
                {after.slice(0, 320)}…
              </Text>
            ) : data?.limitReached ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                {t("Saved for later — you are out of credits this month.")}
              </Text>
            ) : timedOut || data?.error || data?.inFlight ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  {timedOut ? t("This one is taking longer than expected — no credit was used.") : st(data?.error) || t("Still working on this one.")}
                </Text>
                <InlineStack>
                  <Button onClick={run}>{t("Retry")}</Button>
                </InlineStack>
              </BlockStack>
            ) : (
              <InlineStack>
                <Button onClick={run}>{t("Write a draft")}</Button>
              </InlineStack>
            )}
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Card>
  );
}

/** The scan could not run: the same stepped card, what happened, and the one way forward. */
function ScanFailed({ onRetry }) {
  const t = useT();
  return (
    <StartCard step={1}>
      <InlineStack align="center">
        <IlluScan width={180} />
      </InlineStack>
      <Banner tone="warning">
        <p>{t("We couldn't read your catalog just now. Nothing was generated and nothing was used.")}</p>
      </Banner>
      <InlineStack align="center">
        <Button onClick={onRetry}>{t("Try again")}</Button>
      </InlineStack>
    </StartCard>
  );
}

/**
 * Search reads page content first; AI shopping lists from the feed's required
 * fields first. Only the order of the rows changes — the rows themselves are
 * the walk's, unchanged. Stable for everything else.
 */
function orderForGoal(blockers, goal) {
  const list = Array.isArray(blockers) ? [...blockers] : [];
  if (goal !== GOALS.search) return list;
  const content = (b) => (/description|alt/.test(String(b?.key)) ? 0 : 1);
  return list.map((b, i) => ({ b, i })).sort((x, y) => content(x.b) - content(y.b) || x.i - y.i).map((x) => x.b);
}

function StartBody({ scan, start, navigate, onRetry, step, goal, onSeeResult, onBack, resume }) {
  const t = useT();
  const subtitle = useSubtitle(start);
  const [drafted, setDrafted] = useState(() => new Set());
  const [writing, setWriting] = useState(!!resume);
  const onDraft = useCallback((id) => {
    setDrafted((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  if (scan?.error) {
    return (
      <Page title={t("Home")} subtitle={subtitle} narrowWidth>
        <ScanFailed onRetry={onRetry} />
      </Page>
    );
  }

  // Phase 2 item 2.10 — a store with no products is told the truth and given
  // the one action that helps, rather than a score of zero.
  if (scan?.empty && Number(start?.totalProducts) > 0) {
    // Phase 10 Part C — the ALL_DRAFT and B2B_ONLY shapes. The scan reads
    // Active products on the Online Store; this store has products and none
    // is there. "Add a product" would be false. Say what is true and name
    // the one thing that changes it.
    const n = Number(start.totalProducts);
    return (
      <Page title={t("Home")} subtitle={subtitle}>
        <Card>
          <EmptyState
            heading={t("Your products aren't on your Online Store yet")}
            image="/empty-products.svg"
            action={{
              content: t("Open products in Shopify"),
              url: "shopify://admin/products",
              target: "_blank",
            }}
            secondaryAction={{ content: t("I've published one — check again"), onAction: onRetry }}
          >
            <p>
              {t("Navaal scores and writes for products that are Active and available on the Online Store sales channel — that is where AI search reads them. Your store has {n, plural, one {# product} other {# products}} and none is there yet: they are drafts, archived, or sold through another channel only. Set one to Active, make it available to the Online Store, and check again.", { n })}
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  if (scan?.empty) {
    return (
      <Page title={t("Home")} subtitle={subtitle}>
        <Card>
          <EmptyState
            heading={t("Add a product and we'll get started")}
            image="/empty-products.svg"
            action={{
              content: t("Add a product in Shopify"),
              url: "shopify://admin/products/new",
              target: "_blank",
            }}
            secondaryAction={{ content: t("I've added one — check again"), onAction: onRetry }}
          >
            <p>
              {t("Navaal writes AI-search-ready descriptions from your own products. As soon as your store has one, we'll score it and write the first draft for you. Adding a product opens Shopify in a new tab; come back to this one when it is saved and press check again — or just reopen the app, we look every time.")}
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  // Screen 2, finished: the list ticked, and the one step forward.
  if (step === "scan") {
    return (
      <Page title={t("Home")} subtitle={subtitle} narrowWidth primaryAction={{ content: t("See your score"), onAction: onSeeResult }}>
        <ScanList done scanned={scan.totalScanned} />
      </Page>
    );
  }

  const targets = scan?.targets ?? [];
  // A4/FR9 (Phase 8) — one unit, credits, and never a charge notice for a
  // draft that already exists. Targets inside the reuse window are shown at
  // no charge; only the fresh ones count against what is left.
  const draftedIds = new Set(Array.isArray(start.draftedIds) ? start.draftedIds : []);
  const alreadyDrafted = targets.filter((t) => draftedIds.has(t.productId)).length;
  const fresh = targets.length - alreadyDrafted;
  // Only start as many as the credits can actually pay for, so a merchant near
  // their limit is never shown three spinners that resolve into two refusals.
  const canStart = Math.max(0, Math.min(fresh, start.remaining));
  let freshStarted = 0;
  const autoStartFor = (t) => {
    if (!writing) return false;
    if (draftedIds.has(t.productId)) return true;
    if (freshStarted < canStart) {
      freshStarted += 1;
      return true;
    }
    return false;
  };
  // N1 (Phase 10) — the number stated is what the usage card will show AFTER
  // these drafts are written, from the card's own arithmetic (startCopy.js).
  const sentence = costSentence({
    targets: targets.length,
    fresh,
    canStart,
    remaining: start.remaining,
    monthlyCredits: start.monthlyCredits,
    planName: start.planName,
    alreadyDrafted,
    pending: !writing,
    t,
  });
  // FR8 (Phase 10) — on a uniform catalogue every product scores the same and
  // every row equals the store score by arithmetic; say so.
  const uniformNote = uniformScoreNote(targets, scan.totalScanned, t);
  const done = drafted.size;
  // P2.7 — the specific things holding this store back, from the first walk,
  // in the order the merchant's goal reads them.
  const blockers = orderForGoal(Array.isArray(start.blockers) ? start.blockers : [], goal);
  // Phase 15 — a fix this plan cannot run says which plan can (fixRows: one
  // sentence naming it, and a plain "See plans" link). None of these rows is
  // the page's primary: that is writing the drafts, which every plan with
  // credits can run, so the one dark button never refuses.
  const entitlements = getEntitlements(start.planName ?? "free");
  const bulkPlanLabel = cheapestPlanLabelWith("bulkJobs");
  const rows = blockerRows(blockers, { entitlements, t, navigate }).map((row, i) => {
    const b = blockers[i];
    return {
      ...row,
      // The "being written below" note only once the drafts really are below.
      title: blockerLine(b, t, { draftsBelow: writing }),
      // Every feed finding is about AI shopping eligibility (GEO); a locked storefront stops both.
      tag: String(b?.key).startsWith("openai") ? "geo" : "both",
      detail: b?.fix && !canRunFix(b.fix, entitlements) ? t("{plan} and above", { plan: bulkPlanLabel }) : row.detail,
    };
  });

  // The severity cards and the headline count every finding the walk made,
  // not only the three rows shown (SEOWILL 115). Good = the checks nothing
  // fails, out of the checks the walk runs: the feed's (BLOCKER_GROUPS) AND
  // the storefront-password check. Counting the password row as Critical but
  // leaving it out of the total made the cards add to 10 under "out of 9"
  // (found on a fresh install of the dev store, Nov 2026).
  const all = Array.isArray(start.allBlockers) ? start.allBlockers : Array.isArray(start.blockers) ? start.blockers : [];
  const { critical: criticalCount, warning: warningCount, good: goodCount } = severityCounts(all);
  const issueCount = criticalCount + warningCount;

  const nTotal = Number(start.totalProducts);
  const totalText = Number.isFinite(nTotal) ? (start.totalExact === false ? `${t.number(nTotal)}+` : t.number(nTotal)) : null;
  const scope = totalText
    ? t("across {scanned} of {total} products", { scanned: t.number(scan.totalScanned), total: totalText })
    : t("across {n, plural, one {# product} other {# products}} scanned", { n: scan.totalScanned });

  // One primary, by state; never disabled, absent while nothing is ready.
  let primaryAction;
  if (done > 0) {
    primaryAction = { content: t("Review {n, plural, one {# draft} other {# drafts}}", { n: done }), onAction: () => navigate("/app/review") };
  } else if (!writing && canStart > 0) {
    primaryAction = { content: t("Write the first {n, plural, one {# draft} other {# drafts}}", { n: canStart }), onAction: () => setWriting(true) };
  } else if (!writing && fresh > 0 && canStart === 0) {
    primaryAction = { content: t("See plans"), onAction: () => navigate("/app/plans") };
  } else if (!writing && fresh === 0 && targets.length > 0) {
    // Every target already has a draft from the reuse window: show them, free.
    primaryAction = { content: t("Show my drafts"), onAction: () => setWriting(true) };
  }
  // SEOWILL 115: Previous beside the primary, until anything has been written.
  const secondaryActions = !writing && done === 0 && onBack ? [{ content: t("Previous"), onAction: onBack }] : undefined;

  return (
    <Page title={t("Home")} subtitle={subtitle} primaryAction={primaryAction} secondaryActions={secondaryActions}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="500">
          <BlockStack gap="300" inlineAlign="center">
            <StepDots total={3} current={2} />
            <Text as="h2" variant="headingXl" alignment="center">
              {issueCount > 0
                ? t("We found {n, plural, one {# issue} other {# issues}} in your catalog", { n: issueCount })
                : t("Nothing in your catalog blocks a listing right now.")}
            </Text>
          </BlockStack>
          <Layout>
            <Layout.Section variant="oneThird">
              <BlockStack gap="300" inlineAlign="center">
                <ScoreRing value={scan.storeScore} size="large" label={t("Search readiness")} caption={scope} tint />
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  {t("Most stores start here. Every draft you publish moves it.")}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  {t("GEO scores what is on your product pages. It scores your content, not whether you were cited — nothing inside an app can see that.")}
                </Text>
                {/* A6 (Phase 8) — the number is the GEO score, and Traditional
                    SEO is shown beside it and said to be excluded. */}
                {/* Two compact label · figure rows, not two more centred
                    headline numbers under the ring that already shows the first. */}
                <Box width="100%">
                  <BlockStack gap="100">
                    <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("AI search (GEO) — the score above")}
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" numeric tone={scoreTone(scan.storeGeo)}>
                        {scan.storeGeo}
                      </Text>
                    </InlineStack>
                    <Divider />
                    <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("Traditional SEO — for comparison, not part of the score")}
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" numeric tone={scoreTone(scan.storeSeo)}>
                        {scan.storeSeo}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
                <GeoRubric />
              </BlockStack>
            </Layout.Section>
            <Layout.Section>
              <BlockStack gap="400">
                <SeverityCards critical={criticalCount} warning={warningCount} good={goodCount} scope={t("Out of {total} checks: the OpenAI product feed's, and whether your storefront is open", { total: FIRST_RUN_CHECKS.length })} />
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    {t("What to fix first")}
                  </Text>
                  <IssueList items={rows} emptyText={t("Nothing in your catalog blocks a listing right now.")} />
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Read from your catalog just now. What is missing, not a promise about results.")}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Layout.Section>
          </Layout>
          </BlockStack>
        </Card>

        {/* What this costs, said before it is spent, under the button that spends it. */}
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            {sentence}
          </Text>
          {scan.language?.code && (
            <Text as="p" variant="bodySm" tone="subdued">
              {t("Drafts are written in {languageName} — {languageSourceLabel}. Change it in Settings.", { languageName: t(languageName(scan.language.code)), languageSourceLabel: t(languageSourceLabel(scan.language.source)) })}
            </Text>
          )}
          {writing && done > 0 && (
            <BlockStack gap="100">
              <Text id="start-drafts-ready" as="p" variant="bodySm">
                {t("{n, plural, one {# draft} other {# drafts}} ready to review", { n: done })}
              </Text>
              <ProgressBar progress={Math.round((done / Math.max(1, canStart + alreadyDrafted)) * 100)} size="small" tone="success" ariaLabelledBy="start-drafts-ready" />
            </BlockStack>
          )}
        </BlockStack>

        {writing &&
          targets.map((t) => <TargetCard key={t.productId} target={t} autoStart={autoStartFor(t)} onDraft={onDraft} />)}
        {writing && uniformNote && (
          <Text as="p" variant="bodySm" tone="subdued">
            {uniformNote}
          </Text>
        )}

        {/* P2.7 — the sentence that names the subscription, on the screen a
            merchant sees once. */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              {t(WATCH_FROM_HERE.title)}
            </Text>
            <Text as="p" variant="bodyMd">
              {t(WATCH_FROM_HERE.body)}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export function StartState({ start, navigate, onRetry }) {
  const t = useT();
  const subtitle = useSubtitle(start);
  // A merchant who comes back with drafts already written (inside the reuse
  // window) skips straight to the result with them showing — no charge.
  const resume = Array.isArray(start?.draftedIds) && start.draftedIds.length > 0;
  const [step, setStep] = useState(resume ? "result" : "goal");
  const [goal, setGoal] = useState(null);

  if (step === "goal") {
    return (
      <GoalScreen
        start={start}
        onChoose={(g) => {
          setGoal(g);
          setStep("scan");
        }}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <Page title={t("Home")} subtitle={subtitle} narrowWidth>
          <ScanList done={false} />
        </Page>
      }
    >
      <Await
        resolve={start.scan}
        errorElement={
          <Page title={t("Home")} subtitle={subtitle} narrowWidth>
            <ScanFailed onRetry={onRetry} />
          </Page>
        }
      >
        {(scan) => <StartBody scan={scan} start={start} navigate={navigate} onRetry={onRetry} step={step} goal={goal} onSeeResult={() => setStep("result")} onBack={() => setStep("goal")} resume={resume} />}
      </Await>
    </Suspense>
  );
}
