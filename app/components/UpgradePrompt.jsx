import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Button, Banner, Text, InlineStack, BlockStack } from "@shopify/polaris";
import { quotaGapTitle, N_DEFINITION_COPY } from "../utils/planFit.js";

/**
 * Contextual upgrade prompt — appears anywhere usage limits are relevant.
 *
 * Phase 2 item 2.5 — this was a raw `div` with `border: "2px solid #E1A500"`
 * wrapped around a Polaris `Box`, which produced a visible double corner because
 * the outer 8px radius did not match the inner Polaris token. The background
 * used `bg-surface-warning-hover` — a HOVER token as a resting state, which
 * shifts under any Polaris theme change. The icon was a hand-colored lucide
 * glyph, and the dismiss was a plain Button wrapping a lucide `X` passed as a
 * render function where Polaris expects an icon source.
 *
 * All of that existed to make the prompt "a distinct, can't-miss callout instead
 * of blending into the page as faint text". Polaris `Banner` IS that component.
 * It brings its own border, icon, dismiss button and semantics, and it stays
 * correct across Polaris upgrades.
 *
 * Every copy string below is unchanged — several are asserted verbatim by tests
 * and the wording is deliberate. The only edits are the removal of trailing
 * arrows from two button labels (Phase 2 item 2.5).
 *
 * Props:
 *   title      – headline (default: "Ready to scale?")
 *   message    – body copy
 *   ctaLabel   – button text
 *   onUpgrade  – click handler (navigate to /app/plans)
 *   tone       – "warning" | "info" (default: "info")
 *   compact    – true = tighter layout, false = full card (default: false)
 */
export function UpgradePrompt({
  title,
  message,
  ctaLabel = "See plans",
  onUpgrade,
  tone = "info",
  compact = false,
}) {
  const heading = title || "Ready to scale?";

  if (compact) {
    return (
      <Banner tone={tone} title={message ? `${heading} — ${message}` : heading}>
        <InlineStack gap="300" blockAlign="center" wrap>
          <Button onClick={onUpgrade}>{ctaLabel}</Button>
        </InlineStack>
      </Banner>
    );
  }

  return (
    <Banner tone={tone} title={heading}>
      <BlockStack gap="300">
        {message && (
          <Text as="p" variant="bodyMd">
            {message}
          </Text>
        )}
        <InlineStack>
          <Button onClick={onUpgrade}>{ctaLabel}</Button>
        </InlineStack>
      </BlockStack>
    </Banner>
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
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
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

  const planLabel = upsell.planLabel;

  if (upsell.neutral || !upsell.fit) {
    return (
      <div data-quota-prompt="neutral">
        <Banner tone="warning">
          <Text as="p" variant="bodyMd">
            You&apos;ve used all {upsell.monthlyLimit} {planLabel} generations for {upsell.monthName}. They
            reset on {upsell.resetDate}.
          </Text>
        </Banner>
      </div>
    );
  }

  const { fit, n, truncated, nDefinition, scanned } = upsell;
  const title = quotaGapTitle({ n, truncated, fit });
  const clause =
    !truncated && fit.covers
      ? ` — enough to finish these ${n}`
      : !fit.covers
        ? ` — at that rate ${n} products take about ${fit.monthsToCover} months`
        : "";
  let definition = `Counted as: ${N_DEFINITION_COPY[nDefinition] || N_DEFINITION_COPY.catalog_gaps}`;
  if (truncated && nDefinition === "catalog_gaps" && scanned)
    definition += ` · scan stopped at ${scanned} products`;
  if (truncated && nDefinition === "audit_missing_description" && scanned)
    definition += ` · ${n} of the ${scanned} products scanned`;

  const goPlans = (withFit) => {
    post("cta_clicked");
    const q = new URLSearchParams();
    if (promptId) q.set("prompt", promptId);
    if (withFit) q.set("fit", fit.planName);
    navigate(`/app/plans?${q.toString()}`);
  };
  const dismiss = () => {
    setDismissed(true);
    try {
      if (storageKey) sessionStorage.setItem(storageKey, "1");
    } catch {
      /* per-session convenience only */
    }
    post("dismissed");
  };

  return (
    <div data-quota-prompt={surface || "prompt"}>
      <Banner tone="warning" title={title} onDismiss={dismiss}>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            You&apos;ve used all {upsell.monthlyLimit} {planLabel} generations for {upsell.monthName}.{" "}
            {fit.label} covers {fit.monthlyLimit}/month for {fit.priceLabel}
            {clause}.
          </Text>
          <Text as="p" variant="bodyMd">
            Or wait — your {planLabel} generations reset on {upsell.resetDate}.
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {definition}
          </Text>
          <InlineStack gap="300" blockAlign="center" wrap>
            <Button onClick={() => goPlans(true)} variant="primary">{`See ${fit.label} plan`}</Button>
            <Button onClick={() => goPlans(false)} variant="plain">
              Compare all plans
            </Button>
          </InlineStack>
        </BlockStack>
      </Banner>
    </div>
  );
}
