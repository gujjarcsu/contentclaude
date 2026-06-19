import { Button, Box, Text, InlineStack, BlockStack } from "@shopify/polaris";
import { Zap } from "lucide-react";

/**
 * Contextual upgrade prompt — appears anywhere usage limits are relevant.
 *
 * Props:
 *   title      – headline (default: "Ready to scale?")
 *   message    – body copy
 *   ctaLabel   – button text (default: "See Plans →")
 *   onUpgrade  – click handler (navigate to /app/plans)
 *   tone       – "warning" | "info" (default: "info")
 *   compact    – true = inline pill style, false = card style (default: false)
 */
export function UpgradePrompt({ title, message, ctaLabel = "See Plans →", onUpgrade, tone = "info", compact = false }) {
  const bg = tone === "warning" ? "bg-surface-warning-hover" : "bg-surface-info-hover";
  const iconColor = tone === "warning" ? "#916A00" : "#1656AC";

  if (compact) {
    return (
      <Box padding="300" background={bg} borderRadius="200">
        <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
          <InlineStack gap="200" blockAlign="center">
            <Zap aria-hidden="true" size={16} color={iconColor} />
            <Text as="p" variant="bodySm" fontWeight="semibold">
              {title || "Ready to scale?"}{message ? ` — ${message}` : ""}
            </Text>
          </InlineStack>
          <Button size="slim" onClick={onUpgrade} variant="plain">
            {ctaLabel}
          </Button>
        </InlineStack>
      </Box>
    );
  }

  return (
    <Box padding="400" background={bg} borderRadius="200">
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center">
          <Zap aria-hidden="true" size={18} color={iconColor} />
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            {title || "Ready to scale?"}
          </Text>
        </InlineStack>
        {message && (
          <Text as="p" variant="bodySm" tone="subdued">{message}</Text>
        )}
        <Button size="slim" onClick={onUpgrade}>
          {ctaLabel}
        </Button>
      </BlockStack>
    </Box>
  );
}
