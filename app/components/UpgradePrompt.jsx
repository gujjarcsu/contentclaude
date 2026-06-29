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

  // Coloured border so the prompt reads as a distinct, can't-miss callout
  // instead of blending into the page as faint text.
  const border = tone === "warning" ? "2px solid #E1A500" : "2px solid #2C6ECB";

  if (compact) {
    return (
      <div style={{ borderRadius: 8, border }}>
        <Box padding="400" background={bg} borderRadius="200">
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <InlineStack gap="200" blockAlign="center">
              <Zap aria-hidden="true" size={18} color={iconColor} />
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {title || "Ready to scale?"}{message ? ` — ${message}` : ""}
              </Text>
            </InlineStack>
            <Button onClick={onUpgrade} variant="primary" tone="success">
              {ctaLabel}
            </Button>
          </InlineStack>
        </Box>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 8, border }}>
      <Box padding="500" background={bg} borderRadius="200">
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Zap aria-hidden="true" size={20} color={iconColor} />
            <Text as="p" variant="headingMd" fontWeight="bold">
              {title || "Ready to scale?"}
            </Text>
          </InlineStack>
          {message && (
            <Text as="p" variant="bodyMd">{message}</Text>
          )}
          <div>
            <Button onClick={onUpgrade} variant="primary" tone="success" size="large">
              {ctaLabel}
            </Button>
          </div>
        </BlockStack>
      </Box>
    </div>
  );
}
