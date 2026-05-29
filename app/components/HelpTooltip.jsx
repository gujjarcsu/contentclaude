import { useState } from "react";
import { Popover, Box, Text, BlockStack } from "@shopify/polaris";
import { HelpCircle } from "lucide-react";

/**
 * Inline help tooltip icon — hover/click shows a popover with title + body text.
 *
 * Usage:
 *   <HelpTooltip title="What is Brand Tone?" content="Brand tone controls the writing style..." />
 */
export function HelpTooltip({ title, content, width = "200px" }) {
  const [active, setActive] = useState(false);

  const activator = (
    <button
      type="button"
      onClick={() => setActive((v) => !v)}
      style={{
        background: "none",
        border: "none",
        padding: "2px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        verticalAlign: "middle",
        color: "#8C9196",
        lineHeight: 1,
      }}
      aria-label={title ? `Help: ${title}` : "Help"}
    >
      <HelpCircle size={15} />
    </button>
  );

  return (
    <Popover
      active={active}
      activator={activator}
      onClose={() => setActive(false)}
      preferredAlignment="left"
      preferredPosition="below"
    >
      <Box padding="300" maxWidth={width}>
        <BlockStack gap="100">
          {title && (
            <Text as="p" variant="bodySm" fontWeight="semibold">{title}</Text>
          )}
          <Text as="p" variant="bodySm" tone="subdued">{content}</Text>
        </BlockStack>
      </Box>
    </Popover>
  );
}
