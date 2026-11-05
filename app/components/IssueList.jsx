/**
 * IssueList — findings as rows, grouped by severity, one action each.
 *
 * Redesign (Nov 2026). Every top app lists what to fix as rows: a severity
 * mark, the finding, how many products it touches, and one button that goes
 * to the place it is fixed. Navaal said the same things as sentences inside a
 * warning banner. Same facts, the category's form.
 *
 * Rules the rows keep (09-DOCTRINE, 00-CONSTITUTION L5):
 *   - a count states what it counts ("5 products have no description"), the
 *     caller writes the sentence, this component only lays it out;
 *   - severity is a word, not only a colour: the icon has an accessible label;
 *   - a row with nothing to do has no button, never a disabled one.
 */
import { BlockStack, InlineStack, InlineGrid, Box, Text, Button, Icon, Divider } from "@shopify/polaris";
import { AlertDiamondIcon, AlertTriangleIcon, InfoIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";

const SEVERITY = {
  critical: { icon: AlertDiamondIcon, tone: "critical" },
  warning: { icon: AlertTriangleIcon, tone: "caution" },
  info: { icon: InfoIcon, tone: "info" },
  passed: { icon: CheckCircleIcon, tone: "success" },
};

/**
 * @param {object} props
 * @param {Array<{id: string, severity: "critical"|"warning"|"info"|"passed", title: string,
 *   detail?: string, count?: string, action?: {content: string, url?: string, onAction?: () => void, external?: boolean}}>} props.items
 * @param {string} [props.emptyText] shown when there is nothing in the list
 */
export function IssueList({ items, emptyText }) {
  const t = useT();
  const severityLabel = {
    critical: t("Critical"),
    warning: t("Warning"),
    info: t("Optional"),
    passed: t("Passed"),
  };
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (rows.length === 0) {
    return (
      <Box paddingBlock="300">
        <Text as="p" variant="bodyMd" tone="subdued">
          {emptyText ?? t("Nothing to fix right now.")}
        </Text>
      </Box>
    );
  }
  return (
    <BlockStack gap="0">
      {rows.map((row, i) => {
        const sev = SEVERITY[row.severity] ?? SEVERITY.info;
        return (
          <Box key={row.id ?? i}>
            {i > 0 ? <Divider /> : null}
            <Box paddingBlock="300">
              <InlineStack gap="300" blockAlign="start" wrap={false}>
                <Box paddingBlockStart="050">
                  <Icon source={sev.icon} tone={sev.tone} accessibilityLabel={severityLabel[row.severity] ?? severityLabel.info} />
                </Box>
                <Box width="100%">
                  {/* Text grows, the action hugs the right edge on every row —
                      a button that sits beside a short sentence and under a
                      long one reads as two different components. On a phone
                      the action drops under the text. */}
                  <InlineGrid columns={{ xs: "1fr", sm: "1fr auto" }} gap="300" alignItems="center">
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        {row.title}
                      </Text>
                      {row.detail ? (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {row.detail}
                        </Text>
                      ) : null}
                    </BlockStack>
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      {row.count ? (
                        <Text as="span" variant="bodyMd" tone="subdued">
                          {row.count}
                        </Text>
                      ) : null}
                      {row.action ? (
                        <Button size="slim" url={row.action.url} onClick={row.action.onAction} external={row.action.external} target={row.action.external ? "_blank" : undefined}>
                          {row.action.content}
                        </Button>
                      ) : null}
                    </InlineStack>
                  </InlineGrid>
                </Box>
              </InlineStack>
            </Box>
          </Box>
        );
      })}
    </BlockStack>
  );
}

export default IssueList;
