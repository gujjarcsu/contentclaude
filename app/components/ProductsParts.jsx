/**
 * ProductsParts — the Products screen's own pieces (redesign v2), kept out
 * of the route so the route exports only route members and each piece can be
 * tested on its own.
 */
import { Card, BlockStack, InlineStack, Box, Text, Button } from "@shopify/polaris";
import { MagicIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";
import { IconTile } from "./Kit.jsx";
import { IlluProducts } from "./Illustrations.jsx";

/**
 * One headline number as the category's metric card (Tapita 066, Smart SEO
 * 096): a tinted icon tile, the label, the figure, its scope, and a link to
 * the list behind it. `extra` carries the credits bar. A missing figure
 * prints a dash, never a zero (L5).
 */
export function ProductsMetric({ icon, tone = "brand", label, value, hint, onView, url, viewLabel, extra, valueVariant = "headingXl" }) {
  const t = useT();
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" gap="200" wrap={false}>
          <IconTile icon={icon} tone={tone} />
          {onView || url ? (
            <Button variant="plain" onClick={onView} url={url} accessibilityLabel={viewLabel}>
              {t("View")}
            </Button>
          ) : null}
        </InlineStack>
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" tone="subdued">
            {label}
          </Text>
          <Text as="p" variant={valueVariant} numeric>
            {value === null || value === undefined || value === "" ? "–" : value}
          </Text>
          {hint ? (
            <Text as="p" variant="bodySm" tone="subdued">
              {hint}
            </Text>
          ) : null}
          {extra ?? null}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

/**
 * What a bulk run costs, said on the confirmation before anything is spent.
 * A bulk generation bills one credit per product (the description, meta and
 * FAQ bundle is one call, credits.js creditsFor = the bundle's max, 1); the run
 * stops when the month's credits do, hence "up to".
 */
export function CreditSummary({ count, remaining, monthly }) {
  const t = useT();
  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="300">
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        <IconTile icon={MagicIcon} tone="brand" />
        <BlockStack gap="050">
          <Text as="p" variant="headingSm">
            {t("Uses up to {n, plural, one {# credit} other {# credits}}, one per product", { n: count })}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {t("{remaining} of {monthly} credits left this month", { remaining: t.number(remaining), monthly: t.number(monthly) })}
          </Text>
        </BlockStack>
      </InlineStack>
    </Box>
  );
}

/** The illustrated empty block: a drawing of the list itself, a heading, one line, one action. */
export function ProductsEmpty({ heading, body, action }) {
  return (
    <Box paddingBlock="1000" paddingInline="400">
      <BlockStack gap="300" inlineAlign="center">
        <Box width="200px">
          <IlluProducts width={200} />
        </Box>
        <Text as="h2" variant="headingMd" alignment="center">
          {heading}
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
          {body}
        </Text>
        {action ? <Button onClick={action.onAction}>{action.content}</Button> : null}
      </BlockStack>
    </Box>
  );
}

