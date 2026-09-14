/**
 * P2.3 — the list behind the number.
 *
 * Home says "N products need attention, M since yesterday." This is where N
 * lives: one row per product, what changed, when we noticed, and what it costs
 * them — graded, never "broken". Every row names its method
 * (catalogueWatch.js KIND_LABEL), because a finding whose reason is not stated
 * is a number the merchant cannot check.
 *
 * Not in the sidebar: that is five items by an earlier decision. Reached from
 * the Home card, which is where the number is.
 */
import { useLoaderData, useNavigate } from "react-router";
import { Page, Card, Text, BlockStack, InlineStack, Badge, Button, EmptyState, Link } from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { KIND_LABEL, parseAttention, attentionSentence } from "../utils/catalogueWatch.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const { attentionFor, attentionList } = await import("../utils/catalogueWatch.server.js");
  const [summary, rows] = await Promise.all([attentionFor(admin, shop), attentionList(shop)]);
  return Response.json({
    shopDomain: shop,
    summary,
    rows: rows.map((r) => ({
      productId: r.productId,
      numericId: String(r.productId).split("/").pop(),
      title: r.title,
      handle: r.handle,
      attention: parseAttention(r.attention),
      lastSeenAt: r.lastSeenAt,
    })),
  });
};

const TONE = { degrading: "warning", cosmetic: "info" };

export default function AttentionPage() {
  const { shopDomain, summary, rows } = useLoaderData();
  const navigate = useNavigate();
  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) return <AppSkeleton />;

  const sentence = attentionSentence(summary);
  const storeHandle = String(shopDomain).split(".")[0];

  return (
    <Page
      title="Needs attention"
      subtitle={
        summary.available
          ? sentence ?? "Nothing needs you right now."
          : "We have not been able to read your catalogue yet."
      }
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="400">
        {summary.partial && (
          <Card>
            <Text as="p" variant="bodySm" tone="subdued">
              Your catalogue is larger than one check covers, so this list is from the products we
              reached. The daily check continues where it left off.
            </Text>
          </Card>
        )}

        {rows.length === 0 ? (
          <Card>
            <EmptyState heading="Nothing needs attention" image="">
              <p>
                We check your catalogue every day for descriptions that collapse, alt text that
                disappears, changed URLs, missing product types and new products with nothing
                written yet. When something changes, it appears here the same day.
              </p>
            </EmptyState>
          </Card>
        ) : (
          rows.map((r) => (
            <Card key={r.productId}>
              <BlockStack gap="200">
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
          ))
        )}

        <Text as="p" variant="bodySm" tone="subdued">
          Method: a daily read of every product in your catalogue — title, description length,
          product type, featured-image alt text and URL handle — compared with the previous day. A
          product appears here only when something moved against it, or arrived with nothing
          written. Nothing here is a ranking claim.
        </Text>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
