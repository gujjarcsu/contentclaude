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
import { Card, InlineGrid, Box, BlockStack, Text, Link } from "@shopify/polaris";

/**
 * @param {object} props
 * @param {Array<{id: string, label: string, value: string|number|null, hint?: string, url?: string, onClick?: () => void}>} props.items
 */
export function StatStrip({ items }) {
  const cells = Array.isArray(items) ? items.filter(Boolean) : [];
  if (cells.length === 0) return null;
  const columns = { xs: Math.min(2, cells.length), sm: Math.min(2, cells.length), md: cells.length };
  return (
    <Card padding="0">
      <InlineGrid columns={columns}>
        {cells.map((cell, i) => {
          const last = i === cells.length - 1;
          const value = cell.value === null || cell.value === undefined || cell.value === "" ? "–" : String(cell.value);
          return (
            <Box key={cell.id ?? i} padding="400" borderInlineEndWidth={last ? "0" : "025"} borderColor="border-secondary">
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
              </BlockStack>
            </Box>
          );
        })}
      </InlineGrid>
    </Card>
  );
}

export default StatStrip;
