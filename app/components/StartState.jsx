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
import { Await, useFetcher } from "react-router";
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

/** Never let a generation spin forever — flip to a retry the merchant can press. */
export const WATCHDOG_MS = 55_000;

/** >=70 green, 40-69 amber, <40 red. The same rule the rest of the app uses. */
function scoreTone(v) {
  return v >= 70 ? "success" : v >= 40 ? "caution" : "critical";
}

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
            <Badge tone={scoreTone(target.scoreBefore)}>{`Now ${target.scoreBefore}/100`}</Badge>
            {lift != null && lift > 0 && <Badge tone="success">{`+${lift}`}</Badge>}
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
                    <Spinner size="small" accessibilityLabel="Writing a draft" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Writing a draft from your product…
                    </Text>
                  </InlineStack>
                ) : after ? (
                  <Text as="p" variant="bodySm">
                    {after.slice(0, 320)}…
                  </Text>
                ) : data?.limitReached ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Saved for later — you are out of free generations this month.
                  </Text>
                ) : timedOut || data?.error || data?.inFlight ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {timedOut
                        ? "This one is taking longer than expected — no generation was used."
                        : data?.error || "Still working on this one."}
                    </Text>
                    <InlineStack>
                      <Button onClick={run}>Retry</Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <InlineStack>
                    <Button onClick={run}>Write a draft</Button>
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
  return (
    <Card>
      <BlockStack gap="300">
        <Banner tone="warning">
          <p>We couldn&apos;t read your catalogue just now. Nothing was generated and nothing was used.</p>
        </Banner>
        <InlineStack>
          <Button onClick={onRetry}>Try again</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function StartBody({ scan, start, navigate, onRetry }) {
  const [drafted, setDrafted] = useState(() => new Set());
  const onDraft = useCallback((id) => {
    setDrafted((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  if (scan?.error) return <ScanFailed onRetry={onRetry} />;

  // Phase 2 item 2.10 — a store with no products is told the truth and given
  // the one action that helps, rather than a score of zero.
  if (scan?.empty) {
    return (
      <Card>
        <EmptyState
          heading="Add a product and we'll get started"
          image="/empty-products.svg"
          action={{
            content: "Add a product in Shopify",
            url: "shopify://admin/products/new",
            target: "_top",
          }}
        >
          <p>
            Navaal writes AI-search-ready descriptions from your own products. As soon as your store has one,
            we&apos;ll score it and write the first draft for you.
          </p>
        </EmptyState>
      </Card>
    );
  }

  const targets = scan?.targets ?? [];
  // Only start as many as the quota can actually pay for, so a merchant near
  // their limit is never shown three spinners that resolve into two refusals.
  const canStart = Math.max(0, Math.min(targets.length, start.remaining));
  const done = drafted.size;

  return (
    <BlockStack gap="500">
      {/* The reveal */}
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="h2" variant="heading2xl" fontWeight="bold" tone={scoreTone(scan.storeScore)}>
              Your store scores {scan.storeScore}/100
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {`These ${Math.min(targets.length, start.targetCount)} products hurt that score most. We scanned ${scan.totalScanned} of your products just now.`}
            </Text>
          </BlockStack>

          <InlineStack gap="600" wrap>
            <BlockStack gap="050">
              <Text as="p" variant="headingLg" tone={scoreTone(scan.storeGeo)}>
                {scan.storeGeo}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                AI search (GEO)
              </Text>
            </BlockStack>
            <BlockStack gap="050">
              <Text as="p" variant="headingLg" tone={scoreTone(scan.storeSeo)}>
                {scan.storeSeo}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Traditional SEO
              </Text>
            </BlockStack>
          </InlineStack>

          <Text as="p" variant="bodySm" tone="subdued">
            GEO measures how ready your products are to be cited by ChatGPT, Perplexity, Gemini and Google AI
            Overviews.
          </Text>
        </BlockStack>
      </Card>

      {/* What this costs, said before it is spent */}
      <Box paddingInlineStart="200" paddingInlineEnd="200">
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            {canStart > 0
              ? `Writing ${canStart} draft${canStart === 1 ? "" : "s"} now — that uses ${canStart} of your ${start.remaining} remaining free generations this month. Nothing is published until you approve it.`
              : "You have no free generations left this month. Your drafts are still here to review and publish."}
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

      {targets.map((t, i) => (
        <TargetCard key={t.productId} target={t} autoStart={i < canStart} onDraft={onDraft} />
      ))}

      {done > 0 && (
        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                {`${done} draft${done === 1 ? "" : "s"} ready to review`}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Read them, edit anything you want, then publish. Nothing is live until you say so.
              </Text>
            </BlockStack>
            <Button variant="primary" size="large" onClick={() => navigate("/app/review")}>
              Review and publish
            </Button>
          </InlineStack>
        </Card>
      )}
    </BlockStack>
  );
}

export function StartState({ start, navigate, onRetry }) {
  return (
    <Page title="Let's get your store found by AI">
      <Suspense fallback={<ScanSkeleton />}>
        <Await resolve={start.scan} errorElement={<ScanFailed onRetry={onRetry} />}>
          {(scan) => <StartBody scan={scan} start={start} navigate={navigate} onRetry={onRetry} />}
        </Await>
      </Suspense>
    </Page>
  );
}
