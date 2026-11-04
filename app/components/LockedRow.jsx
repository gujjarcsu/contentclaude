/**
 * LockedRow — a feature this plan does not include, said once and plainly.
 *
 * Redesign (Nov 2026), from the brief's rule: a locked feature is a lock, one
 * sentence naming the plan, and a plain link. Never a full-width button that
 * looks like the page's primary action, and never a disabled control that
 * refuses without saying why. The caller writes the sentence so it names the
 * plan from billing-plans.js (cheapestPlanLabelWith), never a hard-coded one.
 */
import { BlockStack, InlineStack, Box, Text, Button, Icon } from "@shopify/polaris";
import { LockIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";

/**
 * @param {object} props
 * @param {string} props.sentence  e.g. "Two drafts to compare is on Growth and above."
 * @param {() => void} [props.onSeePlans]
 * @param {string} [props.url]     used when there is no handler (defaults to the plans page)
 */
export function LockedRow({ sentence, onSeePlans, url = "/app/plans" }) {
  const t = useT();
  return (
    <BlockStack gap="100">
      <InlineStack gap="200" blockAlign="start" wrap={false}>
        <Box paddingBlockStart="050">
          <Icon source={LockIcon} tone="subdued" accessibilityLabel={t("Locked")} />
        </Box>
        <Text as="p" variant="bodySm" tone="subdued">
          {sentence}
        </Text>
      </InlineStack>
      <Box paddingInlineStart="600">
        <Button variant="plain" size="slim" onClick={onSeePlans} url={onSeePlans ? undefined : url}>
          {t("See plans")}
        </Button>
      </Box>
    </BlockStack>
  );
}

export default LockedRow;
