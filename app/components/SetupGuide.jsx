/**
 * SetupGuide — the "Get started checklist", as every top app has it.
 *
 * Redesign v2 (Nov 2026), matched to Tapita 063: a title with an "n/4 done"
 * chip, a thin progress bar, a check circle per step, and the active step
 * opened in a soft panel with its dark button on the left and a small drawing
 * of the screen it leads to on the right (Illustrations.jsx — Navaal's own UI,
 * not stock art). Smart SEO 096 and StoreSEO open the same way.
 *
 * `done` is decided by the caller from real state (a brand voice row exists,
 * a draft was reviewed, the theme block is confirmed); this component never
 * guesses. When every step is done the card shrinks to one line with a
 * Dismiss, and the caller hides it for good once dismissed.
 */
import { useState } from "react";
import { Card, BlockStack, InlineStack, InlineGrid, Box, Text, Button, ProgressBar, Icon, Collapsible, useBreakpoints } from "@shopify/polaris";
import { CheckCircleIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";
import { CountChip } from "./Kit.jsx";

/**
 * @param {object} props
 * @param {Array<{id: string, title: string, description?: string, done: boolean,
 *   action?: {content: string, url?: string, onAction?: () => void, external?: boolean},
 *   extra?: import("react").ReactNode, illustration?: import("react").ReactNode}>} props.steps
 *   `extra` renders under the description (a step with several controls);
 *   `illustration` is drawn beside the open step on wide screens.
 * @param {() => void} [props.onDismiss]  offered only when every step is done
 * @param {string} [props.title]
 */
export function SetupGuide({ steps, onDismiss, title }) {
  const t = useT();
  // Desktop by default, so the server render and the first client render agree.
  const { mdUp } = useBreakpoints({ defaults: { mdUp: true } });
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
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd" id="setup-guide-title">
                {title ?? t("Get started checklist")}
              </Text>
              <CountChip n={t("{done}/{total} done", { done: doneCount, total: list.length })} />
            </InlineStack>
          </InlineStack>
          <ProgressBar progress={pct} size="small" tone="primary" ariaLabelledBy="setup-guide-title" />
        </BlockStack>
        <BlockStack gap="100">
          {list.map((step) => {
            const open = openId === step.id && !step.done;
            const expandable = !step.done && (step.description || step.action || step.extra);
            const circle = step.done ? (
              <Icon source={CheckCircleIcon} tone="success" accessibilityLabel={t("Done")} />
            ) : (
              <Box width="20px" minHeight="20px" borderWidth="050" borderColor={open ? "border-emphasis" : "border"} borderRadius="full" />
            );
            return (
              <Box key={step.id} borderRadius="300" background={open ? "bg-surface-secondary" : undefined} padding={open ? "300" : undefined} paddingBlock={open ? undefined : "200"} paddingInline={open ? undefined : "300"}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      <Box minWidth="20px">{circle}</Box>
                      <Text as="p" variant="bodyMd" fontWeight={step.done ? "regular" : "semibold"} tone={step.done ? "subdued" : undefined} textDecorationLine={step.done ? "line-through" : undefined}>
                        {step.title}
                      </Text>
                    </InlineStack>
                    {expandable ? (
                      <Button
                        variant="tertiary"
                        size="slim"
                        icon={open ? ChevronUpIcon : ChevronDownIcon}
                        accessibilityLabel={open ? t("Hide step: {title}", { title: step.title }) : t("Show step: {title}", { title: step.title })}
                        ariaExpanded={open}
                        ariaControls={`setup-step-${step.id}`}
                        onClick={() => setOpenId(open ? null : step.id)}
                      />
                    ) : null}
                  </InlineStack>
                  {!step.done ? (
                    <Collapsible open={open} id={`setup-step-${step.id}`} transition={{ duration: "150ms", timingFunction: "ease-in-out" }}>
                      <Box paddingInlineStart="800" paddingBlockEnd="100">
                        <InlineGrid columns={step.illustration && mdUp ? "1fr 220px" : "1fr"} gap="400" alignItems="center">
                          <BlockStack gap="300">
                            {step.description ? (
                              <Text as="p" variant="bodyMd" tone="subdued">
                                {step.description}
                              </Text>
                            ) : null}
                            {step.action ? (
                              <InlineStack>
                                <Button variant="primary" url={step.action.url} onClick={step.action.onAction} external={step.action.external} target={step.action.external ? "_blank" : undefined}>
                                  {step.action.content}
                                </Button>
                              </InlineStack>
                            ) : null}
                            {step.extra ?? null}
                          </BlockStack>
                          {step.illustration && mdUp ? <Box>{step.illustration}</Box> : null}
                        </InlineGrid>
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
