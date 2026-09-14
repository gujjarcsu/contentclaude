/**
 * P3.1 (Phase 8) — Proof. The trial's hero moment, shown honestly.
 *
 * One card per crawl-time experiment: both arms, the interval, the seed, and
 * the per-page table. Never a point estimate alone; never a verdict below
 * MIN_PER_ARM; a page not crawled by day CENSOR_DAYS is counted at that and
 * said to be. Every number carries its method in the paragraph beneath it.
 *
 * Not in the sidebar (five items). Reached from Home's Proof card and the
 * weekly report.
 */
import { useLoaderData, useNavigate } from "react-router";
import { Page, Card, Text, BlockStack, InlineStack, Badge, EmptyState, Link } from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { verdictSentence, formatHours, MIN_PER_ARM, CENSOR_DAYS } from "../utils/crawlHoldout.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { experimentsFor } = await import("../utils/crawlHoldout.server.js");
  const { bingKeyStatus } = await import("../utils/bing.server.js");
  const { lockConfigured } = await import("../utils/remediation.server.js");
  const [experiments, bing] = await Promise.all([experimentsFor(shop), bingKeyStatus(shop)]);
  return Response.json({ shopDomain: shop, experiments, bing, lockConfigured: lockConfigured() });
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

export default function ProofPage() {
  const { experiments, bing, lockConfigured } = useLoaderData();
  const navigate = useNavigate();
  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) return <AppSkeleton />;

  return (
    <Page title="Proof" subtitle="A causal result about your own store: does submitting changed pages to Bing get them crawled sooner?" backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}>
      <BlockStack gap="400">
        {!bing.enabled && (
          <Card>
            <EmptyState heading="Turn on Bing measurement to start" image="" action={{ content: "Open Settings", onAction: () => navigate("/app/settings") }}>
              <p>
                Add your Bing Webmaster Tools API key in Settings and switch measurement on. From then, each batch of product pages
                we publish is split at random: half submitted to Bing, half withheld, and the time to Bing's first crawl recorded
                for both. The first result usually reads out inside 72 hours.
              </p>
            </EmptyState>
          </Card>
        )}

        {bing.enabled && !lockConfigured && (
          <Card>
            <Text as="p" variant="bodySm" tone="subdued">
              Measurement is switched on but nothing is being submitted yet: the operator has not finished configuring this
              deployment. Nothing is sent to Bing until that is done.
            </Text>
          </Card>
        )}

        {bing.enabled && experiments.length === 0 && (
          <Card>
            <Text as="p">
              Nothing to measure yet. The next time you publish content for two or more products, a batch starts that night.
            </Text>
          </Card>
        )}

        {experiments.map((e) => {
          const s = e.summary;
          return (
            <Card key={e.id}>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <Text as="h2" variant="headingMd">
                    Batch started {fmtDate(e.startedAt)}
                  </Text>
                  <InlineStack gap="200">
                    <Badge tone={e.status === "reported" ? (s.favourable ? "success" : "info") : "attention"}>
                      {e.status === "reported" ? (s.enough ? "Reported" : "Reported — too few") : `Day ${s.dayOf} of ${CENSOR_DAYS}`}
                    </Badge>
                    <Badge>{`seed ${e.seed}`}</Badge>
                  </InlineStack>
                </InlineStack>

                <InlineStack gap="600" wrap>
                  <BlockStack gap="050">
                    <Text as="p" variant="headingLg">
                      {formatHours(s.submit.medianHours)}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Submitted — median time to first crawl ({s.submit.crawled} of {s.submit.n} crawled)
                    </Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="headingLg">
                      {formatHours(s.hold.medianHours)}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Withheld — median time to first crawl ({s.hold.crawled} of {s.hold.n} crawled)
                    </Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="headingLg">
                      {s.enough ? `${formatHours(s.lo)} to ${formatHours(s.hi)}` : "—"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      95% interval on the difference (withheld minus submitted)
                    </Text>
                  </BlockStack>
                </InlineStack>

                <Text as="p" variant="bodyMd">
                  {verdictSentence(s)}
                </Text>

                <BlockStack gap="100">
                  {e.urls.map((u) => (
                    <InlineStack key={u.url} gap="300" blockAlign="center" wrap>
                      <Badge tone={u.arm === "submit" ? "info" : undefined}>{u.arm === "submit" ? "submitted" : "withheld"}</Badge>
                      <Text as="span" variant="bodySm">
                        {u.url.replace(/^https?:\/\/[^/]+/, "")}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        changed {fmtDate(u.changedAt)} · {u.firstCrawledAt ? `crawled ${fmtDate(u.firstCrawledAt)}` : "not crawled yet"}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          );
        })}

        <Text as="p" variant="bodySm" tone="subdued">
          Method: when we publish content for a batch of product pages, a seeded random half is submitted to Bing through your own
          Bing Webmaster API key (Bing's URL Submission API — the same crawl scheduler IndexNow feeds; a Shopify store cannot host
          an IndexNow key file at its root, so that channel is not available to an app) and the other half is withheld. Each day we
          ask Bing when it last crawled each page; the first crawl after the change is the page's time. Both arms are shown with
          their medians, and the difference carries a 95% bootstrap interval — a batch under {MIN_PER_ARM} pages per arm gets no
          verdict. A page not crawled by day {CENSOR_DAYS} is counted at {CENSOR_DAYS} days and the sentence says so. The seed is
          stored so the split can be reproduced. Crawl timing is not ranking; nothing here is a ranking claim.
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          The two AI-visibility reports that have no API — Google&apos;s generative-AI report and Bing&apos;s AI Performance — are
          taught, not scraped: <Link url="/app/ai-reports">the two reports you read yourself</Link>.
        </Text>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
