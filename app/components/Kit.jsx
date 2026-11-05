/**
 * Kit — the category's visual vocabulary, built once (redesign v2, Nov 2026).
 *
 * The five apps Navaal is measured against all use the same small set of
 * pieces: Polaris icons on tinted tiles, coloured status icons, SEO/GEO tag
 * chips, an "AI optimize" button with a sparkle in the brand colour, red /
 * amber / green character bars, step dots on onboarding, three-up severity
 * cards, a gauge, and blurred previews under a lock card. Every screen takes
 * them from here so they look the same everywhere (DESIGN-BRIEF-v2).
 *
 * Colours: the brand token (`--navaal-brand`, brand.css) and Polaris status
 * tokens only. Every icon-only element carries an accessible name.
 */
import { BlockStack, InlineStack, Box, Text, Icon, Button, Card, Spinner } from "@shopify/polaris";
import { MagicIcon, LockIcon, AlertDiamondIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";
import { T } from "../i18n/index.js";

const TONE_ICON_TONE = { brand: undefined, critical: "critical", caution: "caution", success: "success", info: "info", neutral: "subdued" };

/** A Polaris icon on a rounded tile of soft tint. Decorative unless `label` is given. */
export function IconTile({ icon, tone = "brand", size = "md", label }) {
  return (
    <span className={`nv-tile nv-tile--${size} nv-tile--${tone}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Icon source={icon} tone={TONE_ICON_TONE[tone]} />
    </span>
  );
}

const STATUS = {
  critical: { icon: AlertDiamondIcon, tone: "critical", label: T("Critical") },
  warning: { icon: AlertTriangleIcon, tone: "caution", label: T("Needs work") },
  good: { icon: CheckCircleIcon, tone: "success", label: T("Good") },
  info: { icon: InfoIcon, tone: "info", label: T("Note") },
};

/** Coloured status icon: red critical, amber needs work, green good. Always named. */
export function StatusIcon({ status = "info" }) {
  const t = useT();
  const s = STATUS[status] ?? STATUS.info;
  return <Icon source={s.icon} tone={s.tone} accessibilityLabel={t(s.label)} />;
}

/** SEO / GEO / Both — which kind of visibility a finding is about. */
export function TagChip({ kind = "seo" }) {
  const t = useT();
  const label = { seo: t("SEO"), geo: t("GEO"), both: t("Both") }[kind] ?? kind;
  return <span className={`nv-chip nv-chip--${kind}`}>{label}</span>;
}

/** A small count beside a tab or heading; tone colours it only when it means something. */
export function CountChip({ n, tone }) {
  return <span className={`nv-chip nv-chip--count${tone ? ` nv-chip--count-${tone}` : ""}`}>{n}</span>;
}

/**
 * Character bar against a limit: green inside the ideal range, amber when
 * short, red when over. `min` is the length below which the text is thin.
 */
export function charBand(count, max, min = 0) {
  if (count > max) return "poor";
  if (count === 0 || count < min) return "fair";
  return "good";
}
export function CharBar({ count, max, min = 0, id }) {
  const t = useT();
  const n = Math.max(0, Number(count) || 0);
  const band = charBand(n, max, min);
  const pct = Math.min(100, Math.round((n / max) * 100));
  return (
    <BlockStack gap="100">
      <div className={`nv-charbar nv-charbar--${band}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={n} aria-labelledby={id}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <InlineStack align="end">
        <Text as="span" id={id} variant="bodySm" tone={band === "poor" ? "critical" : "subdued"} numeric>
          {t("{count}/{max} characters", { count: n, max })}
        </Text>
      </InlineStack>
    </BlockStack>
  );
}

/** Onboarding progress: one dot per step, the current one stretched in the brand colour. */
export function StepDots({ total, current }) {
  const t = useT();
  return (
    <span className="nv-dots" role="img" aria-label={t("Step {current} of {total}", { current: current + 1, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} data-active={i === current} data-done={i < current} />
      ))}
    </span>
  );
}

/**
 * The brand-coloured AI action with a sparkle: "AI optimize", "AI generate",
 * "Optimize alt". A real <button>, so it is keyboard-reachable and announces
 * its busy state. `solid` for the one place it is the screen's AI primary.
 */
export function AiButton({ children, onClick, loading = false, disabled = false, solid = false, size, ariaLabel, type = "button" }) {
  const t = useT();
  return (
    <button
      type={type}
      className={`nv-ai${solid ? " nv-ai--solid" : ""}${size === "large" ? " nv-ai--lg" : ""}`}
      onClick={loading ? undefined : onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
    >
      {loading ? <Spinner size="small" accessibilityLabel={t("Working")} /> : <Icon source={MagicIcon} />}
      <span>{children}</span>
    </button>
  );
}

/** A large selectable card with a tinted icon tile (Avada onboarding 030/031). */
export function ChoiceCard({ icon, title, body, onSelect, selected = false, tone = "brand" }) {
  return (
    <button type="button" className="nv-choice" aria-pressed={selected} onClick={onSelect}>
      <IconTile icon={icon} tone={tone} size="lg" />
      <BlockStack gap="100">
        <Text as="span" variant="headingMd">
          {title}
        </Text>
        <Text as="span" variant="bodyMd" tone="subdued">
          {body}
        </Text>
      </BlockStack>
    </button>
  );
}

/**
 * Three-up Critical · Needs work · Good cards with coloured icons and counts
 * (SEOWILL 115, Tapita 083 left rail). Counts are what the caller measured;
 * a null count prints a dash, never a zero (L5). Clickable when `onSelect`.
 */
export function SeverityCards({ critical, warning, good, onSelect, selected, scope }) {
  const t = useT();
  const items = [
    { id: "critical", n: critical, label: t("Critical"), status: "critical", tone: "critical" },
    { id: "warning", n: warning, label: t("Needs work"), status: "warning", tone: "caution" },
    { id: "good", n: good, label: t("Good"), status: "good", tone: "success" },
  ];
  return (
    <BlockStack gap="200">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--p-space-300)" }}>
        {items.map((it) => {
          const inner = (
            <Box padding="300" borderWidth="025" borderColor={selected === it.id ? "border-emphasis" : "border"} borderRadius="300" background="bg-surface">
              <BlockStack gap="150">
                <IconTile icon={STATUS[it.status].icon} tone={it.tone} size="sm" />
                <Text as="p" variant="headingLg" numeric>
                  {it.n === null || it.n === undefined ? "–" : t.number(it.n)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {it.label}
                </Text>
              </BlockStack>
            </Box>
          );
          return onSelect ? (
            <button key={it.id} type="button" onClick={() => onSelect(it.id)} aria-pressed={selected === it.id} style={{ all: "unset", cursor: "pointer", display: "block" }} className="nv-sevbtn">
              {inner}
            </button>
          ) : (
            <div key={it.id}>{inner}</div>
          );
        })}
      </div>
      {scope ? (
        <Text as="p" variant="bodySm" tone="subdued">
          {scope}
        </Text>
      ) : null}
    </BlockStack>
  );
}

/**
 * Semicircle gauge with a needle (SEOWILL 115/122). Red, amber and green
 * arcs at the same bands as every other score badge (scoreBands.js: 0–49
 * poor, 50–79 fair, 80+ good). `value` null draws the arcs and a dash.
 */
export function ScoreGauge({ value, label, caption, width = 220 }) {
  const t = useT();
  const n = value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.max(0, Math.min(100, Math.round(Number(value))));
  // The number sits under the pivot, never where the needle can cross it.
  const w = width, r = w / 2 - 16, cx = w / 2, cy = r + 16, h = Math.round(cy + w * 0.22);
  const pt = (v) => { const a = Math.PI * (1 - v / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const arc = (from, to) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`; };
  const [nx, ny] = n === null ? [cx, cy - r + 8] : pt(n);
  const name = n === null ? t("{label}: not scored yet", { label: label ?? t("Score") }) : t("{label}: {n} out of 100", { label: label ?? t("Score"), n });
  return (
    <BlockStack gap="100" inlineAlign="center">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={name}>
        <path d={arc(0, 49)} fill="none" strokeWidth="14" strokeLinecap="round" style={{ stroke: "var(--p-color-bg-fill-critical)" }} />
        <path d={arc(51, 79)} fill="none" strokeWidth="14" style={{ stroke: "var(--p-color-bg-fill-caution)" }} />
        <path d={arc(81, 100)} fill="none" strokeWidth="14" strokeLinecap="round" style={{ stroke: "var(--p-color-bg-fill-success)" }} />
        {n !== null && <line x1={cx} y1={cy} x2={cx + (nx - cx) * 0.78} y2={cy + (ny - cy) * 0.78} strokeWidth="4" strokeLinecap="round" style={{ stroke: "var(--p-color-text)" }} />}
        <circle cx={cx} cy={cy} r="7" style={{ fill: "var(--p-color-text)" }} />
        <text x={cx} y={cy + w * 0.12} textAnchor="middle" dominantBaseline="central" fontSize={Math.round(w * 0.15)} fontWeight="700" style={{ fill: "var(--p-color-text)", fontFamily: "inherit" }}>
          {n === null ? "–" : n}
        </text>
      </svg>
      {caption ? (
        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
          {caption}
        </Text>
      ) : null}
    </BlockStack>
  );
}

/**
 * A plan-locked feature, shown as the real thing blurred under a lock card
 * (Tapita 074 "Unlock other errors", Smart SEO 102). The children are the
 * preview; they are hidden from assistive tech and cannot be focused.
 */
export function LockedPreview({ children, title, sentence, onSeePlans, url = "/app/plans" }) {
  const t = useT();
  return (
    <div className="nv-locked">
      <div className="nv-locked__content" aria-hidden="true" inert="">
        {children}
      </div>
      <div className="nv-locked__card">
        <div>
          <BlockStack gap="200" inlineAlign="center">
            <IconTile icon={LockIcon} tone="neutral" size="md" />
            {title ? (
              <Text as="p" variant="headingSm">
                {title}
              </Text>
            ) : null}
            <Text as="p" variant="bodySm" tone="subdued">
              {sentence}
            </Text>
            <Button onClick={onSeePlans} url={onSeePlans ? undefined : url}>
              {t("See plans")}
            </Button>
          </BlockStack>
        </div>
      </div>
    </div>
  );
}

/** A summary card: tinted icon tile, label, figure, scope (the category's metric cards). */
export function MetricCard({ icon, tone = "brand", label, value, scope, action }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" gap="200" wrap={false}>
          <IconTile icon={icon} tone={tone} size="md" />
          {action ?? null}
        </InlineStack>
        <BlockStack gap="050">
          <Text as="p" variant="bodySm" tone="subdued">
            {label}
          </Text>
          <Text as="p" variant="headingXl" numeric>
            {value === null || value === undefined || value === "" ? "–" : value}
          </Text>
          {scope ? (
            <Text as="p" variant="bodySm" tone="subdued">
              {scope}
            </Text>
          ) : null}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
