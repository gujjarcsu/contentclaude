import { Card, BlockStack, InlineStack, Text, Button, Badge } from "@shopify/polaris";

/**
 * Phase 12 Part A (A4, FR8) — the first screen a new merchant sees is a
 * result, never a task for them.
 *
 * Frame 04's caption promised "the 3 things holding this store back"; the
 * largest element on the frame was an orange banner asking the merchant to
 * edit their theme. And FR8's three product scores lived only on the
 * write-time splash, which has no route back. This card is both fixes: until
 * the shop's first publish, Home leads with the three products the first run
 * scored lowest (durable, from ProductScore) and the specific things the walk
 * found; the theme step waits until there is published content to show.
 */
export function FirstRunFindingsCard({ findings = [], blockers = [], navigate }) {
  const rows = Array.isArray(findings) ? findings.filter((f) => Number.isFinite(Number(f?.scoreBefore))) : [];
  const lines = Array.isArray(blockers) ? blockers : [];
  if (rows.length === 0 && lines.length === 0) return null;
  const numericId = (gid) => String(gid ?? "").split("/").pop();
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {rows.length > 0 ? `The ${rows.length} product${rows.length === 1 ? "" : "s"} holding this store back` : "What is holding this store back"}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Scored on your first run. Each one has a draft written for it; the score moves when you publish.
          </Text>
        </BlockStack>
        {rows.map((f) => (
          <InlineStack key={f.productId} align="space-between" blockAlign="center" wrap gap="300">
            <BlockStack gap="050">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {f.productTitle || "Untitled product"}
              </Text>
              <Badge tone={Number(f.scoreBefore) < 40 ? "critical" : "attention"}>{`This product: ${f.scoreBefore}/100`}</Badge>
            </BlockStack>
            <Button size="slim" onClick={() => navigate(`/app/review?product=${numericId(f.productId)}`)}>
              Review its draft
            </Button>
          </InlineStack>
        ))}
        {lines.length > 0 && (
          <BlockStack gap="150">
            {lines.map((b) => (
              <Text key={b.key} as="p" variant="bodySm">
                {b.line}
              </Text>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
