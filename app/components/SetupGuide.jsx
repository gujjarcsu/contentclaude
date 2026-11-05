/**
 * SetupGuide — the setup checklist with progress, as every top app has it.
 *
 * Redesign (Nov 2026). Tapita ("Get Started Checklist, 0/4 done"), Smart SEO
 * ("Setup Guide, 0/5 completed") and StoreSEO all open with the same card:
 * steps with a tick, a progress bar, the first unfinished step expanded with
 * its one button. Navaal had a static "Get started in 4 steps" card with four
 * buttons that never ticked anything.
 *
 * `done` is decided by the caller from real state (a brand voice row exists,
 * a draft was reviewed, the theme block is confirmed); this component never
 * guesses. When every step is done the card shrinks to one line with a
 * Dismiss, and the caller hides it for good once dismissed.
 */
import { useState } from "react";
import { Card, BlockStack, InlineStack, Box, Text, Button, Badge, ProgressBar, Icon, Collapsible } from "@shopify/polaris";
import { CheckCircleIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";

/**
 * @param {object} props
 * @param {Array<{id: string, title: string, description?: string, done: boolean,
 *   action?: {content: string, url?: string, onAction?: () => void, external?: boolean},
 *   extra?: import("react").ReactNode}>} props.steps  `extra` renders under the description (a step with several controls)
 * @param {() => void} [props.onDismiss]  offered only when every step is done
 * @param {string} [props.title]
 */
export function SetupGuide({ steps, onDismiss, title }) {
  const t = useT();
  const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const doneCount = list.filter((s) => s.done).length;
  const firstOpen = list.find((s) => !s.done)?.id ?? null;
  const [openId, setOpenId] = useState(firstOpen);
  if (list.length === 0) return null;
  const allDone = doneCount === list.length;
  const pct = Math.round((doneCount / list.length) * 100);

  if (allDone) {
    return (
      <Card>
        <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
          <InlineStack gap="200" blockAlign="center">
            <Icon source={CheckCircleIcon} tone="success" accessibilityLabel={t("Done")} />
            <Text as="p" variant="bodyMd" fontWeight="medium">
              {t("Setup complete — {n} of {n} steps done", { n: list.length })}
            </Text>
          </InlineStack>
          {onDismiss ? (
            <Button variant="plain" onClick={onDismiss}>
              {t("Dismiss")}
            </Button>
          ) : null}
        </InlineStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <Text as="h2" variant="headingMd">
              {title ?? t("Setup guide")}
            </Text>
            <Badge tone={doneCount > 0 ? "info" : undefined}>{t("{done} of {total} done", { done: doneCount, total: list.length })}</Badge>
          </InlineStack>
          <ProgressBar progress={pct} size="small" tone="primary" />
        </BlockStack>
        <BlockStack gap="0">
          {list.map((step) => {
            const open = openId === step.id;
            return (
              <Box key={step.id} paddingBlock="200" borderBlockStartWidth="025" borderColor="border-secondary">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                    <InlineStack gap="200" blockAlign="center" wrap={false}>
                      {step.done ? (
                        <Icon source={CheckCircleIcon} tone="success" accessibilityLabel={t("Done")} />
                      ) : (
                        <Box width="20px" minHeight="20px" borderWidth="025" borderColor="border" borderRadius="full" />
                      )}
                      <Text as="p" variant="bodyMd" fontWeight={step.done ? "regular" : "medium"} tone={step.done ? "subdued" : undefined}>
                        {step.title}
                      </Text>
                    </InlineStack>
                    {!step.done && (step.description || step.action || step.extra) ? (
                      <Button
                        variant="tertiary"
                        size="slim"
                        icon={open ? ChevronUpIcon : ChevronDownIcon}
                        accessibilityLabel={open ? t("Hide step: {title}", { title: step.title }) : t("Show step: {title}", { title: step.title })}
                        onClick={() => setOpenId(open ? null : step.id)}
                      />
                    ) : null}
                  </InlineStack>
                  {!step.done ? (
                    <Collapsible open={open} id={`setup-step-${step.id}`} transition={{ duration: "150ms", timingFunction: "ease-in-out" }}>
                      <Box paddingInlineStart="700" paddingBlockEnd="100">
                        <BlockStack gap="300">
                          {step.description ? (
                            <Text as="p" variant="bodyMd" tone="subdued">
                              {step.description}
                            </Text>
                          ) : null}
                          {step.action ? (
                            <InlineStack>
                              <Button url={step.action.url} onClick={step.action.onAction} external={step.action.external} target={step.action.external ? "_blank" : undefined}>
                                {step.action.content}
                              </Button>
                            </InlineStack>
                          ) : null}
                          {step.extra ?? null}
                        </BlockStack>
                      </Box>
                    </Collapsible>
                  ) : null}
                </BlockStack>
              </Box>
            );
          })}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

export default SetupGuide;
