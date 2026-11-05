/**
 * ReviewParts — the pieces of the Review screen that carry the brand tint
 * (redesign v2, Nov 2026; Tapita 083 / Smart SEO 111).
 *
 * The route file itself keeps no inline styles (polaris-only guard), so the
 * proposed-copy panel, the field's length readout and the empty state live
 * here. Colours are the --navaal-* tokens and Polaris tokens only.
 */
import { BlockStack, InlineStack, InlineGrid, Box, Card, Text, Button } from "@shopify/polaris";
import { useT } from "../i18n/react.jsx";
import { CharBar } from "./Kit.jsx";
import { IlluDrafts } from "./Illustrations.jsx";

/** Search-result limits, the same numbers the editor and the scorer use. */
export const FIELD_LIMITS = { metaTitle: 60, metaDescription: 155 };

/** Word and character count of a plain-text value. Pure. */
export function lengthOf(text) {
  const plain = String(text ?? "").trim();
  return { chars: plain.length, words: plain ? plain.split(/\s+/).length : 0 };
}

/**
 * The length under one column: a red / amber / green bar against the limit for
 * a page title or search description, a plain words · characters line for the
 * description and the answers.
 */
export function FieldLength({ type, text, id }) {
  const t = useT();
  const { chars, words } = lengthOf(text);
  const max = FIELD_LIMITS[type];
  if (max) return <CharBar count={chars} max={max} min={Math.round(max / 2)} id={id} />;
  return (
    <Text as="p" variant="bodySm" tone="subdued" numeric>
      {t("{words} words · {chars} characters", { words: t.number(words), chars: t.number(chars) })}
    </Text>
  );
}

/** The store's current copy: a neutral well. */
export function CurrentPanel({ children }) {
  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200" minHeight="100%">
      {children}
    </Box>
  );
}

/** The proposed copy: the brand tint marks what Navaal wrote. */
export function ProposedPanel({ children }) {
  return (
    <div style={{ background: "var(--navaal-brand-tint)", borderRadius: "var(--p-border-radius-200)", padding: "var(--p-space-300)", height: "100%" }}>
      {children}
    </div>
  );
}

/** No drafts waiting: a drawing of the Review card, the fact, and where to go next. */
export function ReviewEmpty({ heading, onProducts, onHome }) {
  const t = useT();
  return (
    <Card>
      <Box paddingBlock="600" paddingInline="400">
        <InlineGrid columns={{ xs: 1, md: "auto 1fr" }} gap="600" alignItems="center">
          <InlineStack align="center">
            <IlluDrafts width={220} />
          </InlineStack>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              {heading}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {t("No drafts are waiting. Nothing goes live until you publish it here.")}
            </Text>
            <InlineStack gap="200">
              <Button variant="primary" onClick={onProducts}>
                {t("Go to Products")}
              </Button>
              <Button variant="plain" onClick={onHome}>
                {t("Back to Home")}
              </Button>
            </InlineStack>
          </BlockStack>
        </InlineGrid>
      </Box>
    </Card>
  );
}
