/**
 * The Start state — Phase 3 items 3.1 and 3.2.
 *
 * What a merchant sees on `/app` while `Shop.firstDraftSeenAt` is null. It is
 * the first-run experience the retired `/app/welcome` used to be, moved onto
 * Home so there is no redirect and no extra top-level route in the embedded
 * chain.
 *
 * The shape, and why:
 *
 *  - **No forms.** The old `/app/setup` asked five questions before the
 *    merchant saw anything the app could do. Brand voice is inferred and can be
 *    corrected later in Settings; nothing here blocks on input.
 *  - **The score reveal is the headline**, streamed behind a skeleton so the
 *    shell paints immediately. A real number about the merchant's own store,
 *    computed from their own catalogue — never a placeholder.
 *  - **Generation starts on its own**, three products in parallel, one fetcher
 *    each, so one slow product cannot hold up the other two and the first draft
 *    lands in seconds rather than after a form.
 *  - **The cost is stated before it is spent**, in the same sentence as the
 *    remaining quota. Auto-spending a merchant's credits without saying so
 *    would be indefensible; saying so plainly is the difference.
 *  - **Refreshing never re-charges.** The idempotency is server-side, keyed by
 *    shop + product (`reserveCredit` in quickStart.server.js): a recent draft is
 *    returned as-is, an in-flight credit is waited on, and a credit whose
 *    request died is reused rather than charged twice.
 *  - **A 55 s watchdog** turns a hung generation into a retry button rather
 *    than a spinner that never resolves.
 */
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useT } from "../i18n/react.jsx";
import { Await, useFetcher } from "react-router";
import { scoreTone } from "../utils/scoreBands.js";
import { languageName, languageSourceLabel } from "../utils/language.js";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Box,
  Badge,
  Banner,
  Spinner,
  Layout,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText,
  ProgressBar,
} from "@shopify/polaris";
import { GeoRubric } from "./GeoRubric.jsx";
import { WATCH_FROM_HERE } from "../utils/firstRun.js";
import { costSentence, uniformScoreNote } from "../utils/startCopy.js";

/** Never let a generation spin forever — flip to a retry the merchant can press. */
export const WATCHDOG_MS = 55_000;

function ScanSkeleton() {
  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <SkeletonDisplayText size="medium" />
          <SkeletonBodyText lines={2} />
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="400">
          <SkeletonDisplayText size="small" />
          <SkeletonBodyText lines={3} />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

/**
 * One of the three products, with its own fetcher.
 *
 * A component per target rather than three fetchers in the parent: each card
 * owns its request, its watchdog and its retry, so a failure is contained to
 * the card it belongs to.
 */
function TargetCard({ target, autoStart, onDraft }) {
  const t = useT();
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
  // become "Review your drafts" without waiting for the other two.
  useEffect(() => {
    if (data?.ok) onDraft?.(target.productId);
  }, [data, onDraft, target.productId]);

  const after = data?.ok ? (data.description || "").replace(/<[^>]+>/g, "").trim() : "";
  const lift = data?.ok && Number.isFinite(data.qualityScore) ? data.qualityScore - target.scoreBefore : null;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h3" variant="headingMd">
            {target.title}
          </Text>
          <InlineStack gap="200">
            <Badge tone={scoreTone(target.scoreBefore)}>{t("This product: {scoreBefore}/100", { scoreBefore: target.scoreBefore })}</Badge>
            {lift != null && lift > 0 && <Badge tone="success">{t("+{lift}", { lift })}</Badge>}
          </InlineStack>
        </InlineStack>

        <Layout>
          <Layout.Section variant="oneHalf">
            <Box padding="400" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                  BEFORE
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {target.beforeSnippet || "No description — invisible to AI answer engines."}
                </Text>
              </BlockStack>
            </Box>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Box padding="400" background="bg-surface-success-subdued" borderRadius="200">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="success">
                  AFTER
                </Text>

                {busy && !timedOut ? (
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" accessibilityLabel={t("Writing a draft")} />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("Writing a draft from your product…")}
                    </Text>
                  </InlineStack>
                ) : after ? (
                  <Text as="p" variant="bodySm">
                    {after.slice(0, 320)}…
                  </Text>
                ) : data?.limitReached ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Saved for later — you are out of credits this month.")}
                  </Text>
                ) : timedOut || data?.error || data?.inFlight ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {timedOut ? t("This one is taking longer than expected — no credit was used.") : data?.error || t("Still working on this one.")}
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
            </Box>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Card>
  );
}

function ScanFailed({ onRetry }) {
  const t = useT();
  return (
    <Card>
      <BlockStack gap="300">
        <Banner tone="warning">
          <p>{t("We couldn't read your catalogue just now. Nothing was generated and nothing was used.")}</p>
        </Banner>
        <InlineStack>
          <Button onClick={onRetry}>{t("Try again")}</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function StartBody({ scan, start, navigate, onRetry }) {
  const t = useT();
  const [drafted, setDrafted] = useState(() => new Set());
  const onDraft = useCallback((id) => {
    setDrafted((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  if (scan?.error) return <ScanFailed onRetry={onRetry} />;

  // Phase 2 item 2.10 — a store with no products is told the truth and given
  // the one action that helps, rather than a score of zero.
  if (scan?.empty && Number(start?.totalProducts) > 0) {
    // Phase 10 Part C — the ALL_DRAFT and B2B_ONLY shapes. The scan reads
    // Active products on the Online Store; this store has products and none
    // is there. "Add a product" would be false. Say what is true and name
    // the one thing that changes it.
    const n = Number(start.totalProducts);
    return (
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
            {t("Navaal scores and writes for products that are Active and available on the Online Store sales channel — that is where AI search reads them. Your store has {n} product{v} and none is there yet: they are drafts, archived, or sold through another channel only. Set one to Active, make it available to the Online Store, and check again.", { n, v: n === 1 ? "" : "s" })}
          </p>
        </EmptyState>
      </Card>
    );
  }

  if (scan?.empty) {
    return (
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
  });
  // FR8 (Phase 10) — on a uniform catalogue every product scores the same and
  // every row equals the store score by arithmetic; say so.
  const uniformNote = uniformScoreNote(targets, scan.totalScanned);
  const done = drafted.size;
  // P2.7 — the specific things holding this store back, from the first walk.
  const blockers = Array.isArray(start.blockers) ? start.blockers : [];

  return (
    <BlockStack gap="500">
      {/* The reveal */}
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            {/* A6 (Phase 8) — the headline is labelled for what it is (the GEO
                number), not painted red above the fold, and framed as a
                starting point: the score measures the page, and every draft
                below moves it. Traditional SEO is shown for comparison and
                said to be excluded. */}
            <Text as="p" variant="bodySm" tone="subdued">
              {t("Your AI-search (GEO) score, from the products we scanned just now")}
            </Text>
            <Text as="h2" variant="heading2xl" fontWeight="bold">
              {scan.storeScore}/100
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {t("Most stores start here: the score measures what is on your product pages, and every draft below moves it. These {v} products hurt it most; we scanned {totalScanned} of your products.", { v: Math.min(targets.length, start.targetCount), totalScanned: scan.totalScanned })}
            </Text>
            {scan.language?.code && (
              <Text as="p" variant="bodySm" tone="subdued">
                {t("Drafts are written in {languageName} — {languageSourceLabel}. Change it in Settings.", { languageName: languageName(scan.language.code), languageSourceLabel: languageSourceLabel(scan.language.source) })}
              </Text>
            )}
          </BlockStack>

          <InlineStack gap="600" wrap>
            <BlockStack gap="050">
              <Text as="p" variant="headingLg" tone={scoreTone(scan.storeGeo)}>
                {scan.storeGeo}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {t("AI search (GEO) — the score above")}
              </Text>
            </BlockStack>
            <BlockStack gap="050">
              <Text as="p" variant="headingLg" tone={scoreTone(scan.storeSeo)}>
                {scan.storeSeo}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {t("Traditional SEO — for comparison, not part of the score")}
              </Text>
            </BlockStack>
          </InlineStack>

          <Text as="p" variant="bodySm" tone="subdued">
            {t("GEO scores what is on your product pages. It scores your content, not whether you were cited — nothing inside an app can see that.")}
          </Text>

          <GeoRubric />
        </BlockStack>
      </Card>

      {/* P2.7 — the three specific things holding THIS store back, each with
          the one action that fixes it. The first is the primary action. */}
      {blockers.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              {blockers.length === 1 ? t("The one thing holding this store back") : t("The {length} things holding this store back", { length: blockers.length })}
            </Text>
            {blockers.map((b, i) => (
              <InlineStack key={b.key} align="space-between" blockAlign="center" wrap gap="300">
                <BlockStack gap="050">
                  <Text as="p" variant="bodyMd">
                    {b.line}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {b.grade === "blocking" ? t("A surface cannot list these as they stand.") : t("Listed, but shown worse.")}
                  </Text>
                </BlockStack>
                {b.fix &&
                  (b.fix.external ? (
                    <Button url={b.fix.to} target="_top" variant={i === 0 ? "primary" : undefined}>
                      {b.fix.label}
                    </Button>
                  ) : (
                    <Button variant={i === 0 ? "primary" : undefined} onClick={() => navigate(b.fix.to)}>
                      {b.fix.label}
                    </Button>
                  ))}
              </InlineStack>
            ))}
            <Text as="p" variant="bodySm" tone="subdued">
              {t("From the fields the OpenAI product feed and Google Search ask for, read from your own catalogue just now. A description of what is missing, not a promise about results.")}
            </Text>
          </BlockStack>
        </Card>
      )}

      {/* What this costs, said before it is spent */}
      <Box paddingInlineStart="200" paddingInlineEnd="200">
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            {sentence}
          </Text>
          {done > 0 && (
            <ProgressBar
              progress={Math.round((done / Math.max(1, canStart)) * 100)}
              size="small"
              tone="success"
            />
          )}
        </BlockStack>
      </Box>

      {targets.map((t) => (
        <TargetCard key={t.productId} target={t} autoStart={autoStartFor(t)} onDraft={onDraft} />
      ))}
      {uniformNote && (
        <Box paddingInlineStart="200" paddingInlineEnd="200">
          <Text as="p" variant="bodySm" tone="subdued">
            {uniformNote}
          </Text>
        </Box>
      )}

      {done > 0 && (
        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                {t("{done} draft{v} ready to review", { done, v: done === 1 ? "" : "s" })}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {t("Read them, edit anything you want, then publish. Nothing is live until you say so.")}
              </Text>
            </BlockStack>
            <Button variant="primary" size="large" onClick={() => navigate("/app/review")}>
              {t("Review and publish")}
            </Button>
          </InlineStack>
        </Card>
      )}

      {/* P2.7 — the sentence that names the subscription, on the screen a
          merchant sees once. */}
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            {WATCH_FROM_HERE.title}
          </Text>
          <Text as="p" variant="bodySm">
            {WATCH_FROM_HERE.body}
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

export function StartState({ start, navigate, onRetry }) {
  const t = useT();
  return (
    <Page title={t("Let's get your store found by AI")}>
      <Suspense fallback={<ScanSkeleton />}>
        <Await resolve={start.scan} errorElement={<ScanFailed onRetry={onRetry} />}>
          {(scan) => <StartBody scan={scan} start={start} navigate={navigate} onRetry={onRetry} />}
        </Await>
      </Suspense>
    </Page>
  );
}
