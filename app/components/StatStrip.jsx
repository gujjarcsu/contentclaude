/**
 * StatStrip — a few headline numbers in ONE card, split by hairlines.
 *
 * Redesign (Nov 2026). The app had three KPI cards, each with an icon in a
 * circle, on Home and again on Products. The studied admin screens put a
 * label over a number in one divided container and no icon at all; that is
 * what this is. A cell may carry one link, so the number is also the way to
 * the list behind it.
 *
 * Every value is a string the caller has already formatted; the strip never
 * rounds, sums or invents (L3, L5). A value of null renders as a dash.
 */
import { isValidElement } from "react";
import { Card, InlineGrid, Box, BlockStack, Text, Link } from "@shopify/polaris";

/**
 * @param {object} props
 * @param {Array<{id: string, label: string, value: string|number|null|import("react").ReactElement, hint?: string, url?: string, onClick?: () => void,
 *   extra?: import("react").ReactNode}>} props.items
 *   value may be an element when the number needs an id (a progress bar in `extra` labelled by it).
 */
export function StatStrip({ items }) {
  const cells = Array.isArray(items) ? items.filter(Boolean) : [];
  if (cells.length === 0) return null;
  const columns = { xs: Math.min(2, cells.length), sm: Math.min(2, cells.length), md: cells.length };
  /* The hairlines are a 1px grid gap over a border-coloured ground, so they
     run both ways and follow the columns at every width — a per-cell border
     cannot know where the phone's two-column layout wraps. */
  return (
    <Card padding="0">
      <Box background="bg-surface-secondary-active">
        <InlineGrid columns={columns} gap="025">
          {cells.map((cell, i) => {
            const value = isValidElement(cell.value) ? cell.value : cell.value === null || cell.value === undefined || cell.value === "" ? "–" : String(cell.value);
            return (
              <Box key={cell.id ?? i} padding="400" background="bg-surface" minHeight="100%">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {cell.label}
                  </Text>
                  <Text as="p" variant="headingLg" fontWeight="semibold">
                    {cell.url || cell.onClick ? (
                      <Link url={cell.url} onClick={cell.onClick} removeUnderline monochrome>
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                  </Text>
                  {cell.hint ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {cell.hint}
                    </Text>
                  ) : null}
                  {cell.extra ?? null}
                </BlockStack>
              </Box>
            );
          })}
        </InlineGrid>
      </Box>
    </Card>
  );
}

export default StatStrip;
