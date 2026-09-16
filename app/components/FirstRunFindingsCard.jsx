import { Card, BlockStack, InlineStack, Text, Button, Badge } from "@shopify/polaris";
import { blockerLine } from "../utils/firstRun.js";
import { uniformScoreNote } from "../utils/startCopy.js";
import { useT } from "../i18n/react.jsx";

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
export function FirstRunFindingsCard({ findings = [], blockers = [], scanned = null, navigate }) {
  const t = useT();
  const rows = Array.isArray(findings) ? findings.filter((f) => Number.isFinite(Number(f?.scoreBefore))) : [];
  const lines = Array.isArray(blockers) ? blockers : [];
  if (rows.length === 0 && lines.length === 0) return null;
  const numericId = (gid) => String(gid ?? "").split("/").pop();
  // FR8 (Phase 14) — when every row scores the same they also equal the store
  // score, by arithmetic, and three identical badges beside an identical store
  // number read as fabricated. The splash has said why since Phase 10; this
  // card, which is where a merchant actually meets those numbers, did not.
  const uniformNote = uniformScoreNote(rows, scanned, t);
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {rows.length > 0 ? t("The {n, plural, one {# product} other {# products}} holding this store back", { n: rows.length }) : t("What is holding this store back")}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {t("Scored on your first run. Each one has a draft written for it; the score moves when you publish.")}
          </Text>
          {uniformNote && (
            <Text as="p" variant="bodySm" tone="subdued">
              {uniformNote}
            </Text>
          )}
        </BlockStack>
        {rows.map((f) => (
          <InlineStack key={f.productId} align="space-between" blockAlign="center" wrap gap="300">
            <BlockStack gap="050">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {f.productTitle || "Untitled product"}
              </Text>
              {/* FR8 (Phase 14) — "This product: 21/100" asserts a CURRENT
                  per-product number. It is neither: `scoreBefore` is frozen at
                  the row's creation (storeScore.server.js keeps it out of the
                  upsert's `update`), so on navaal-shape-fr three rows read 35
                  beside a store score of 39 — the previous score, on a screen
                  claiming to describe the product now. Name the moment and the
                  badge is true in both cases. */}
              <Badge tone={Number(f.scoreBefore) < 40 ? "critical" : "attention"}>{t("At first run: {scoreBefore}/100", { scoreBefore: f.scoreBefore })}</Badge>
            </BlockStack>
            <Button size="slim" onClick={() => navigate(`/app/review?product=${numericId(f.productId)}`)}>
              {t("Review its draft")}
            </Button>
          </InlineStack>
        ))}
        {lines.length > 0 && (
          <BlockStack gap="150">
            {lines.map((b) => (
              <Text key={b.key} as="p" variant="bodySm">
                {blockerLine(b, t)}
              </Text>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
