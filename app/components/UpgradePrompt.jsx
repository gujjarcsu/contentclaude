import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Button, Banner, Card, Text, InlineStack, BlockStack } from "@shopify/polaris";
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

/**
 * Phase 3 item 3.4, surface (a) — the 80%-used warning.
 *
 * ONE banner, on Home and Products only, and only between 80% and 100%. It
 * states the number, names the plan that would cover this rate, says when the
 * free quota resets, and offers to be dismissed for a week.
 *
 * The reset line is not a courtesy. Without it the only way out of the banner
 * is to pay, which is untrue — waiting works, and a merchant who is told only
 * about the paid option has been misled by omission.
 *
 * Dismissal is persisted SERVER-side for 7 days (see quotaSurfaces.server.js),
 * not in the browser, so it holds across the merchant's devices and survives
 * clearing site data.
 */
export function QuotaWarningBanner({ warning }) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shownFor = useRef(null);
  const [dismissed, setDismissed] = useState(false);
  const promptId = warning?.promptId || null;

  const post = (event) => {
    if (!promptId) return;
    const fd = new FormData();
    fd.append("promptId", promptId);
    fd.append("event", event);
    fetcher.submit(fd, { method: "POST", action: "/app/upgrade-prompt" });
  };

  useEffect(() => {
    if (!promptId || dismissed || shownFor.current === promptId) return;
    shownFor.current = promptId;
    post("shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, dismissed]);

  if (!warning || dismissed) return null;

  const { usageCount, monthlyLimit, planLabel, fit, resetDate, from } = warning;

  const goPlans = () => {
    post("cta_clicked");
    const q = new URLSearchParams({ from });
    if (promptId) q.set("prompt", promptId);
    q.set("fit", fit.planName);
    navigate(`/app/plans?${q.toString()}`);
  };

  const dismiss = () => {
    setDismissed(true);
    post("dismissed");
  };

  return (
    <div data-quota-prompt="warn">
      <Banner
        tone="info"
        title={`${usageCount} of ${monthlyLimit} ${planLabel} generations used`}
        onDismiss={dismiss}
      >
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            {fit.label} includes {fit.monthlyLimit}/month for {fit.priceLabel}.
          </Text>
          <Text as="p" variant="bodyMd">
            Or wait — your {planLabel} generations reset on {resetDate}.
          </Text>
          <InlineStack>
            <Button onClick={goPlans}>{`See ${fit.label} plan`}</Button>
          </InlineStack>
        </BlockStack>
      </Banner>
    </div>
  );
}

/**
 * Phase 3 item 3.4, surface (b) — what stands where the generate button was.
 *
 * At 100% the action is REPLACED, not hidden. A button that disappears reads as
 * a bug and sends the merchant looking for what they broke; a card in its place
 * saying why it cannot run and what would make it run is the app being honest
 * about its own limit.
 *
 * Everything that does not cost a generation keeps working — the audit still
 * runs, and existing drafts can still be reviewed, edited, approved and
 * published. Being out of quota stops new generation, not the app.
 *
 * `upsell` is whatever getUpsell() returned, so the count and the fit plan are
 * server-computed and measured; a neutral upsell (nothing honest to sell)
 * renders the reset line alone.
 */
export function QuotaReachedCard({ upsell, surface = "" }) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shownFor = useRef(null);
  const promptId = upsell?.promptId || null;

  const post = (event) => {
    if (!promptId) return;
    const fd = new FormData();
    fd.append("promptId", promptId);
    fd.append("event", event);
    fetcher.submit(fd, { method: "POST", action: "/app/upgrade-prompt" });
  };

  useEffect(() => {
    if (!promptId || shownFor.current === promptId) return;
    shownFor.current = promptId;
    post("shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId]);

  if (!upsell) return null;

  const planLabel = upsell.planLabel;
  const fit = upsell.fit;

  const goPlans = () => {
    post("cta_clicked");
    const q = new URLSearchParams({ from: "quota100" });
    if (promptId) q.set("prompt", promptId);
    if (fit) q.set("fit", fit.planName);
    navigate(`/app/plans?${q.toString()}`);
  };

  return (
    <div data-quota-prompt={surface ? `exhausted:${surface}` : "exhausted"}>
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">
            {`You've used all ${upsell.monthlyLimit} ${planLabel} generations for ${upsell.monthName}`}
          </Text>
          {fit && (
            <Text as="p" variant="bodyMd">
              {fit.label} includes {fit.monthlyLimit}/month for {fit.priceLabel}.
            </Text>
          )}
          <Text as="p" variant="bodyMd">
            Or wait — your {planLabel} generations reset on {upsell.resetDate}.
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            You can still run an audit, and review, edit and publish the drafts you already have.
          </Text>
          {fit && (
            <InlineStack>
              <Button variant="primary" onClick={goPlans}>{`See ${fit.label} plan`}</Button>
            </InlineStack>
          )}
        </BlockStack>
      </Card>
    </div>
  );
}
