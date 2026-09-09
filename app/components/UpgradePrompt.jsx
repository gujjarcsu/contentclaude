import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Button, Box, Text, InlineStack, BlockStack } from "@shopify/polaris";
import { Zap, X } from "lucide-react";
import { quotaGapTitle, N_DEFINITION_COPY } from "../utils/planFit.js";

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

/**
 * Item-5a quota prompt — "N products still need content · Starter covers 50/month".
 *
 * Renders ONLY from a server-computed `upsell` (see getUpsell in
 * app/utils/upgradePrompts.server.js): the count is measured, the fit plan is
 * computed, the free reset date is always beside the CTA, quota reached is
 * amber (complete), never red. A neutral upsell (nothing measurable to sell)
 * renders the reset line only. Exposure/clicks are confirmed to
 * /app/upgrade-prompt; a dismiss sticks for the browser session.
 *
 * Copy (exact — locked by tests):
 *   title  `{N} products still need content · {Fit} covers {limit}/month`  (`At least ` when truncated)
 *   body   `You've used all {limit} {Plan} generations for {month}. {Fit} covers {fitLimit}/month for {price}{clause}.`
 *   reset  `Or wait — your {Plan} generations reset on {date}.`
 */
export function QuotaUpgradePrompt({ upsell, surface = "" }) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shownFor = useRef(null);
  const promptId = upsell?.promptId || null;
  const storageKey = promptId ? `navaal:upgradePrompt:${promptId}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return false;
    try { return sessionStorage.getItem(storageKey) === "1"; } catch { return false; }
  });

  const post = (event) => {
    if (!promptId) return;
    const fd = new FormData();
    fd.append("promptId", promptId);
    fd.append("event", event);
    fetcher.submit(fd, { method: "POST", action: "/app/upgrade-prompt" });
  };

  // One "shown" per mount per prompt — never on a dismissed prompt.
  useEffect(() => {
    if (!promptId || dismissed || upsell?.neutral) return;
    if (shownFor.current === promptId) return;
    shownFor.current = promptId;
    post("shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, dismissed]);

  if (!upsell || dismissed) return null;

  const border = "2px solid #E1A500";
  const planLabel = upsell.planLabel;

  if (upsell.neutral || !upsell.fit) {
    return (
      <div style={{ borderRadius: 8, border }} data-quota-prompt="neutral">
        <Box padding="400" background="bg-surface-warning-hover" borderRadius="200">
          <InlineStack gap="200" blockAlign="center">
            <Zap aria-hidden="true" size={18} color="#916A00" />
            <Text as="p" variant="bodyMd">
              You&apos;ve used all {upsell.monthlyLimit} {planLabel} generations for {upsell.monthName}. They reset on {upsell.resetDate}.
            </Text>
          </InlineStack>
        </Box>
      </div>
    );
  }

  const { fit, n, truncated, nDefinition, scanned } = upsell;
  const title = quotaGapTitle({ n, truncated, fit });
  const clause = !truncated && fit.covers
    ? ` — enough to finish these ${n}`
    : !fit.covers
      ? ` — at that rate ${n} products take about ${fit.monthsToCover} months`
      : "";
  let definition = `Counted as: ${N_DEFINITION_COPY[nDefinition] || N_DEFINITION_COPY.catalog_gaps}`;
  if (truncated && nDefinition === "catalog_gaps" && scanned) definition += ` · scan stopped at ${scanned} products`;
  if (truncated && nDefinition === "audit_missing_description" && scanned) definition += ` · ${n} of the ${scanned} products scanned`;

  const goPlans = (withFit) => {
    post("cta_clicked");
    const q = new URLSearchParams();
    if (promptId) q.set("prompt", promptId);
    if (withFit) q.set("fit", fit.planName);
    navigate(`/app/plans?${q.toString()}`);
  };
  const dismiss = () => {
    setDismissed(true);
    try { if (storageKey) sessionStorage.setItem(storageKey, "1"); } catch { /* per-session convenience only */ }
    post("dismissed");
  };

  return (
    <div style={{ borderRadius: 8, border }} data-quota-prompt={surface || "prompt"}>
      <Box padding="500" background="bg-surface-warning-hover" borderRadius="200">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="start" gap="300" wrap={false}>
            <InlineStack gap="200" blockAlign="center">
              <Zap aria-hidden="true" size={20} color="#916A00" />
              <Text as="p" variant="headingMd" fontWeight="bold">{title}</Text>
            </InlineStack>
            <Button variant="plain" onClick={dismiss} accessibilityLabel="Dismiss" icon={() => <X size={16} aria-hidden="true" />} />
          </InlineStack>
          <Text as="p" variant="bodyMd">
            You&apos;ve used all {upsell.monthlyLimit} {planLabel} generations for {upsell.monthName}. {fit.label} covers {fit.monthlyLimit}/month for {fit.priceLabel}{clause}.
          </Text>
          <Text as="p" variant="bodyMd">Or wait — your {planLabel} generations reset on {upsell.resetDate}.</Text>
          <Text as="p" variant="bodySm" tone="subdued">{definition}</Text>
          <InlineStack gap="300" blockAlign="center" wrap>
            <Button onClick={() => goPlans(true)} variant="primary" tone="success">{`See ${fit.label} plan →`}</Button>
            <Button onClick={() => goPlans(false)} variant="plain">Compare all plans</Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </div>
  );
}
