/**
 * ScoreRing — the one way a 0–100 score is drawn, everywhere.
 *
 * Redesign (Nov 2026). Every top app in the category shows its score as a
 * ring with the scope stated under it ("based on 3 of 13,267 pages"); Navaal
 * showed the number as a large text and explained the scope in a paragraph.
 * Polaris has no ring, so this is the single piece of custom drawing in the
 * app: an SVG whose colours are Polaris tokens, so it follows the admin's
 * theme, and whose band comes from scoreBands.js, so it agrees with every
 * badge that colours the same number.
 *
 * Accessibility: the ring is `role="img"` with an accessible name that reads
 * the number and the label; the number is also real text inside the SVG.
 */
import { Text, BlockStack } from "@shopify/polaris";
import { scoreBand } from "../utils/scoreBands.js";
import { useT } from "../i18n/react.jsx";

const SIZES = { small: 56, medium: 80, large: 112 };
const STROKE = { small: 5, medium: 7, large: 9 };
const FONT = { small: 16, medium: 22, large: 30 };

/** The fill colour for a band — Polaris tokens so the ring matches the admin's badges. */
const BAND_COLOR = {
  good: "var(--p-color-bg-fill-success)",
  fair: "var(--p-color-bg-fill-caution)",
  poor: "var(--p-color-bg-fill-critical)",
};

/**
 * @param {object} props
 * @param {number|null} props.value  0–100, or null for "not scored yet" (an empty ring and a dash)
 * @param {"small"|"medium"|"large"} [props.size]
 * @param {string} [props.label]   what the number is ("Search readiness"); read by screen readers
 * @param {string} [props.caption] the scope, shown under the ring in six words or fewer
 * @param {string} [props.max]     the text after the number inside the ring; default none
 */
export function ScoreRing({ value, size = "medium", label, caption }) {
  const t = useT();
  const px = SIZES[size] ?? SIZES.medium;
  const stroke = STROKE[size] ?? STROKE.medium;
  const font = FONT[size] ?? FONT.medium;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  // null, undefined and "" are "not scored" — Number(null) is 0, and a ring
  // that says 0 for a store never scored is a measurement that was never made (L3).
  const n = value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Math.max(0, Math.min(100, Math.round(Number(value))));
  const band = n === null ? null : scoreBand(n);
  const dash = n === null ? 0 : (c * n) / 100;
  const name = n === null ? t("{label}: not scored yet", { label: label ?? t("Score") }) : t("{label}: {n} out of 100", { label: label ?? t("Score"), n });

  return (
    <BlockStack gap="100" inlineAlign="center">
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} role="img" aria-label={name}>
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: "var(--p-color-border-secondary)" }} />
        {/* No arc at 0: a zero-length round-capped stroke still draws a dot. */}
        {n !== null && n > 0 && (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${px / 2} ${px / 2})`}
            style={{ stroke: BAND_COLOR[band] }}
          />
        )}
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={font}
          fontWeight="600"
          style={{ fill: "var(--p-color-text)", fontFamily: "inherit" }}
        >
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

export default ScoreRing;
