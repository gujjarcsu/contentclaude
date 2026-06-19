// Feature-flag registry — server-only.
//
// Lets the growth-engine features ship "off by default" and be enabled per
// environment (Fly secret / env var) once their UI surface is verified — so the
// app stays launch-ready at every checkpoint and half-built work never breaks a
// route. Flags are read from the environment at call time.
//
// Enable a flag by setting its env var to one of: 1 / true / on / yes.
//   e.g.  FEATURE_RESULTS_DASHBOARD=on
//
// Plan-gating (entitlements) is SEPARATE from flags: a flag turns a capability
// on for the whole app; entitlements decide which plan can use it.

const TRUTHY = new Set(["1", "true", "on", "yes"]);

/**
 * Registry of growth-engine flags. `default` is the off-by-default state used
 * until the env var is explicitly set. `phase` documents which build phase it
 * belongs to; `requires` documents external dependencies (for the report/UI).
 */
export const FEATURE_FLAGS = {
  magicMoment: {
    env: "FEATURE_MAGIC_MOMENT",
    default: false,
    phase: "1 — Time-to-value",
    description: "First-run auto-scan + auto before→after on the merchant's own product.",
  },
  continuousMonitoring: {
    env: "FEATURE_CONTINUOUS_MONITORING",
    default: false,
    phase: "2 — Retention",
    description: "Re-scan changed products and surface drift (extends Autopilot).",
  },
  weeklyDigest: {
    env: "FEATURE_WEEKLY_DIGEST",
    default: false,
    phase: "2 — Retention",
    description: "Weekly health digest (in-app always; email needs a provider).",
    requires: "Email provider (e.g. Resend/Postmark) for the email channel.",
  },
  resultsDashboard: {
    env: "FEATURE_RESULTS_DASHBOARD",
    default: false,
    phase: "3 — Provable outcomes",
    description: "Before→after results dashboard + shareable results view.",
  },
  categoryBenchmarking: {
    env: "FEATURE_CATEGORY_BENCHMARKING",
    default: false,
    phase: "4 — Data flywheel / moat",
    description: "Opt-in, aggregated category GEO/SEO benchmarks (privacy-safe).",
    requires: "Merchant opt-in consent + privacy-policy update.",
  },
  reviewPrompts: {
    env: "FEATURE_REVIEW_PROMPTS",
    default: false,
    phase: "6 — Reviews / social proof",
    description: "Milestone-triggered, compliant, dismissible App Store review prompts.",
    requires: "App Store listing review URL.",
  },
  resultsBadge: {
    env: "FEATURE_RESULTS_BADGE",
    default: false,
    phase: "6 — Reviews / social proof",
    description: 'Opt-in merchant-facing "AI-search optimized" badge.',
  },
  // ── P1 (always external-dependent; off by default) ──────────────────────────
  aiVisibilityTracker: {
    env: "FEATURE_AI_VISIBILITY",
    default: false,
    phase: "P1",
    description: "Live ChatGPT/Perplexity/Gemini citation checks over time.",
    requires: "Provider API keys + per-merchant cost controls/rate limiting.",
  },
  gscIntegration: {
    env: "FEATURE_GSC",
    default: false,
    phase: "P1",
    description: "Google Search Console impressions/clicks/position.",
    requires: "Google Cloud OAuth credentials + verified-site scope.",
  },
  multiLanguageSeo: {
    env: "FEATURE_MULTILANG",
    default: false,
    phase: "P1",
    description: "Per-language meta/content/schema.",
  },
};

/** Returns true if the named feature flag is enabled in this environment. */
export function isFeatureEnabled(name) {
  const flag = FEATURE_FLAGS[name];
  if (!flag) return false;
  const raw = process.env[flag.env];
  if (raw == null || raw === "") return flag.default;
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

/** Snapshot of all flags (for the report / an internal status surface). */
export function getFlagSnapshot() {
  return Object.fromEntries(
    Object.keys(FEATURE_FLAGS).map((k) => [k, isFeatureEnabled(k)])
  );
}
