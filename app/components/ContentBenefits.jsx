import { Text, BlockStack, InlineStack, Box } from "@shopify/polaris";
import { Check, Sparkles } from "lucide-react";

/**
 * Explains, at the point of generation/review, exactly what makes the AI content
 * good — the GEO/SEO/AI benefits a merchant gets. Complements GeoValueBanner
 * (app-level value) by describing the OUTPUT's value. Placed on content surfaces
 * (product detail, review) so merchants always see "how good is this?".
 *
 * Props: title (override), compact (tighter spacing).
 */
const BENEFITS = [
  { b: "In your brand voice", d: "Trained on your tone, audience & differentiators — not generic AI filler." },
  { b: "Answer-first for AI search", d: "Structured so ChatGPT, Perplexity, Gemini & Google AI Overviews can quote your products." },
  { b: "SEO-optimized", d: "Keyword-rich copy + meta tags built to rank on Google and win the click." },
  { b: "FAQ schema (JSON-LD)", d: "Machine-readable structured data → citable by AI and eligible for Google rich results." },
  { b: "Discoverable by AI crawlers", d: "Your catalog is exposed via llms.txt so answer engines can find every product." },
];

export function ContentBenefits({ title = "What you're getting", compact = false }) {
  return (
    <Box padding={compact ? "300" : "400"} background="bg-surface-secondary" borderRadius="300" borderColor="border" borderWidth="025">
      <BlockStack gap={compact ? "200" : "300"}>
        <InlineStack gap="200" blockAlign="center">
          <Sparkles aria-hidden="true" size={16} color="#2C6ECB" />
          <Text as="h3" variant="headingSm">{title}</Text>
        </InlineStack>
        <BlockStack gap="200">
          {BENEFITS.map((item) => (
            <InlineStack key={item.b} gap="200" blockAlign="start" wrap={false}>
              <span style={{ flexShrink: 0, marginTop: 2 }}>
                <Check aria-hidden="true" size={15} color="#00A047" />
              </span>
              <Text as="p" variant="bodySm">
                <Text as="span" variant="bodySm" fontWeight="semibold">{item.b}</Text>
                {" — "}
                <Text as="span" variant="bodySm" tone="subdued">{item.d}</Text>
              </Text>
            </InlineStack>
          ))}
        </BlockStack>
      </BlockStack>
    </Box>
  );
}
