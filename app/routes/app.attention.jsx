/**
 * P2.3 · P2.2 · P2.1 — the list behind the number.
 *
 * Home says up to three lines: a crawler that cannot reach the storefront,
 * products missing what an AI surface asks for, and what changed since
 * yesterday. This page is where each lives — one section per method, every
 * row saying what it costs the merchant, graded and never "broken". A finding
 * whose reason is not stated is a number the merchant cannot check, so every
 * kind, field and crawler carries its note (catalogueWatch.js KIND_LABEL and
 * gradeProduct; crawlerAccess.js CRAWLER_NOTE).
 *
 * Not in the sidebar: that is five items by an earlier decision. Reached from
 * the Home banner, which is where the number is.
 */
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { Page, Card, Text, BlockStack, InlineStack, Badge, Button, EmptyState, Link } from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { KIND_LABEL, SURFACE_LABEL, parseAttention, parseFindings, homeAttentionLines } from "../utils/catalogueWatch.js";
import { CRAWLERS, CRAWLER_NOTE } from "../utils/crawlerAccess.js";
import { GSC_ANSWER, GSC_LABEL, GSC_TONE, GSC_SETTINGS_URL, GSC_RECHECK_DAYS } from "../utils/gscAiControl.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const { attentionFor, attentionList, blockingList } = await import("../utils/catalogueWatch.server.js");
  const [summary, rows, gaps] = await Promise.all([attentionFor(admin, shop), attentionList(shop), blockingList(shop)]);
  const numeric = (gid) => String(gid).split("/").pop();
  return Response.json({
    shopDomain: shop,
    summary,
    rows: rows.map((r) => ({
      productId: r.productId,
      numericId: numeric(r.productId),
      title: r.title,
      handle: r.handle,
      attention: parseAttention(r.attention),
      lastSeenAt: r.lastSeenAt,
    })),
    gaps: gaps.map((g) => ({
      productId: g.productId,
      numericId: numeric(g.productId),
      title: g.title,
      handle: g.handle,
      // Cosmetic findings are not listed here: nothing a surface asks for is missing.
      findings: parseFindings(g.grade).filter((f) => f.grade !== "cosmetic"),
      blocking: g.blocking,
      degrading: g.degrading,
    })),
  });
};

const TONE = { blocking: "critical", degrading: "warning", cosmetic: "info" };

function ProductHeader({ r, storeHandle, navigate }) {
  return (
    <InlineStack align="space-between" blockAlign="center" wrap>
      <Text as="h3" variant="headingSm">
        {r.title || r.handle || r.numericId}
      </Text>
      <InlineStack gap="200">
        <Button size="slim" onClick={() => navigate(`/app/products/${r.numericId}`)}>
          Open in Navaal
        </Button>
        <Link url={`https://admin.shopify.com/store/${storeHandle}/products/${r.numericId}`} target="_blank">
          Shopify admin
        </Link>
      </InlineStack>
    </InlineStack>
  );
}

/**
 * P2.5 — the one check no app can make. Verified 2026-09-14: the Search
 * Console API lists searchanalytics, sitemaps, sites and urlInspection and
 * nothing else, so the switch cannot be read. No gate on an unverified API:
 * the merchant answers, the answer is shown as theirs, and it is asked again
 * after GSC_RECHECK_DAYS.
 */
function GscCard({ gsc }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const answerForm = (value, label) => (
    <fetcher.Form method="post" action="/app/gsc-ai-control">
      <input type="hidden" name="answer" value={value} />
      <Button submit size="slim" loading={busy}>
        {label}
      </Button>
    </fetcher.Form>
  );
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingSm">
          Google's AI features — the one check we ask you to make
        </Text>
        <Text as="p" variant="bodySm">
          Google lets a site owner exclude a site from AI Overviews, AI Mode and AI in Discover: in
          Search Console, under Settings, the switch is called Search generative AI. No app can read
          it — Google offers no API for it — so this is the one check we ask you to make yourself. It
          takes thirty seconds, and an agency or a previous developer may have set it without saying so.
        </Text>
        {gsc?.answer ? (
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Badge tone={GSC_TONE[gsc.answer] ?? "info"}>{GSC_LABEL[gsc.answer] ?? gsc.answer}</Badge>
              <Text as="span" variant="bodySm" tone="subdued">
                your answer{gsc.answeredAt ? `, ${new Date(gsc.answeredAt).toLocaleDateString()}` : ""}
              </Text>
              {gsc.stale && <Badge tone="attention">worth a re-check</Badge>}
            </InlineStack>
            {gsc.excluded && (
              <Text as="p" variant="bodySm">
                While the switch is on, your pages do not appear in AI Overviews or AI Mode. Regular
                Google results are unaffected. If that was not your decision, switch it off in Search
                Console; it can take days to take effect.
              </Text>
            )}
            <InlineStack gap="200" wrap>
              <Link url={GSC_SETTINGS_URL} target="_blank">
                Open Search Console settings
              </Link>
              {answerForm("reset", "Check again")}
            </InlineStack>
          </BlockStack>
        ) : (
          <BlockStack gap="200">
            <Link url={GSC_SETTINGS_URL} target="_blank">
              Open Search Console settings
            </Link>
            <InlineStack gap="200" wrap>
              {answerForm(GSC_ANSWER.DEFAULT, "It's off — my store is included")}
              {answerForm(GSC_ANSWER.EXCLUDED, "It's on — my store is excluded")}
              {answerForm(GSC_ANSWER.NO_GSC, "I don't use Search Console")}
            </InlineStack>
          </BlockStack>
        )}
        <Text as="p" variant="bodySm" tone="subdued">
          Method: your answer, kept with its date and asked again after {GSC_RECHECK_DAYS} days. Nothing
          here is read from Google — there is no API that would let us.
        </Text>
      </BlockStack>
    </Card>
  );
}

export default function AttentionPage() {
  const { shopDomain, summary, rows, gaps } = useLoaderData();
  const navigate = useNavigate();
  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) return <AppSkeleton />;

  const storeHandle = String(shopDomain).split(".")[0];
  const crawler = summary.crawler ?? { available: false, blocked: [], newlyBlocked: [], checkedAt: null };
  const lines = homeAttentionLines(summary);
  const nothing = rows.length === 0 && gaps.length === 0 && crawler.blocked.length === 0 && !summary.gsc?.excluded;

  return (
    <Page
      title="Needs attention"
      subtitle={
        summary.available
          ? lines[0] ?? "Nothing needs you right now."
          : "We have not been able to read your catalogue yet."
      }
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="400">
        {summary.partial && (
          <Card>
            <Text as="p" variant="bodySm" tone="subdued">
              Your catalogue is larger than one check covers, so this page is from the products we
              reached. The daily check continues where it left off.
            </Text>
          </Card>
        )}

        {/* P2.1 — crawler access. One card, always present, because "all six
            reached you" is worth reading once and a blocked one is the most
            expensive line on the page. */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">
              Crawler access
            </Text>
            {!crawler.available ? (
              <Text as="p" variant="bodySm" tone="subdued">
                Checked every night against your storefront. The first result appears after tonight's
                check.
              </Text>
            ) : crawler.passwordProtected ? (
              <Text as="p" variant="bodySm">
                Your storefront is password-protected, so every crawler — and every shopper — gets the
                password page instead of your products. That is expected before launch. Remove the
                password when you open and we check again the same night.
              </Text>
            ) : crawler.blocked.length === 0 ? (
              <Text as="p" variant="bodySm">
                All six search and AI crawlers reached your storefront when we last checked
                {crawler.checkedAt ? ` (${new Date(crawler.checkedAt).toLocaleDateString()})` : ""}.
              </Text>
            ) : (
              crawler.blocked.map((agent) => (
                <BlockStack key={agent} gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="critical">{`${agent} blocked`}</Badge>
                    {crawler.newlyBlocked.includes(agent) && <Badge tone="attention">since the last check</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodySm">
                    {CRAWLER_NOTE[agent] ?? ""}
                  </Text>
                </BlockStack>
              ))
            )}
            <Text as="p" variant="bodySm" tone="subdued">
              Method: one read of robots.txt on your primary domain, then one request to your home
              page as each of {CRAWLERS.join(", ")}. A robots rule, a 403 or a 429 counts as blocked. A
              storefront that does not answer is recorded as unreachable, not as blocked.
            </Text>
          </BlockStack>
        </Card>

        <GscCard gsc={summary.gsc} />

        {nothing && (
          <Card>
            <EmptyState heading="Nothing needs attention" image="">
              <p>
                We check your catalogue every day for descriptions that collapse, alt text that
                disappears, changed URLs, missing product types, new products with nothing written
                yet, and anything an AI shopping surface asks for that a product lacks. When something
                changes, it appears here the same day.
              </p>
            </EmptyState>
          </Card>
        )}

        {/* P2.2 — eligibility, graded per surface. Blocking and degrading only;
            cosmetic lives on the product, not on a list. */}
        {gaps.length > 0 && (
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Missing what a surface asks for
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {summary.blocking} of {summary.graded} products cannot be listed by at least one surface
              as they stand; {summary.degrading} would be listed but shown worse.
              {crawler.passwordProtected
                ? " Your storefront is password-protected, so nothing is listed anywhere yet — this is what each surface will ask for the day it opens."
                : ""}
            </Text>
            {gaps.map((r) => (
              <Card key={r.productId}>
                <BlockStack gap="200">
                  <ProductHeader r={r} storeHandle={storeHandle} navigate={navigate} />
                  {r.findings.map((f) => (
                    <BlockStack key={`${f.surface}-${f.field}`} gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone={TONE[f.grade] ?? "info"}>{`${SURFACE_LABEL[f.surface] ?? "Shopify"} · ${f.field}`}</Badge>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {f.grade === "blocking" ? "cannot list without it" : "listed, but worse"}
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm">
                        {f.note}
                      </Text>
                    </BlockStack>
                  ))}
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        )}

        {/* P2.3 — what moved since yesterday. */}
        {rows.length > 0 && (
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Changed since we last looked
            </Text>
            {rows.map((r) => (
              <Card key={r.productId}>
                <BlockStack gap="200">
                  <ProductHeader r={r} storeHandle={storeHandle} navigate={navigate} />
                  {Object.entries(r.attention).map(([kind, since]) => {
                    const meta = KIND_LABEL[kind] ?? { title: kind, detail: "", grade: "cosmetic" };
                    return (
                      <BlockStack key={kind} gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={TONE[meta.grade] ?? "info"}>{meta.title}</Badge>
                          <Text as="span" variant="bodySm" tone="subdued">
                            since {new Date(since).toLocaleDateString()}
                          </Text>
                        </InlineStack>
                        <Text as="p" variant="bodySm">
                          {meta.detail}
                        </Text>
                      </BlockStack>
                    );
                  })}
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        )}

        <Text as="p" variant="bodySm" tone="subdued">
          Method: a daily read of every product in your catalogue — title, description, vendor,
          product type, featured image and its alt text, URL handle, first-variant barcode and option
          names. Each product is compared with the previous day, and measured against the fields the
          OpenAI product feed and Google Search ask for. Blocking means a surface cannot list the
          product without it; degrading means listed, but worse; Shopify's own fields are never
          called either. Drafts are not graded. Nothing here is a ranking claim.
        </Text>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
