// Feature-flag registry — server-only.
//
// Only flags with a REAL consumer in the codebase live here. Speculative
// flags for unbuilt features were removed pre-submission (a reviewer reading
// the repo should not find half-built surface area); add a flag back in the
// same commit that ships its feature.
//
// Enable a flag by setting its env var to one of: 1 / true / on / yes.
//   e.g.  FEATURE_MAGIC_MOMENT=on
//
// Plan-gating (entitlements) is SEPARATE from flags: a flag turns a capability
// on for the whole app; entitlements decide which plan can use it.

const TRUTHY = new Set(["1", "true", "on", "yes"]);

export const FEATURE_FLAGS = {
  magicMoment: {
    env: "FEATURE_MAGIC_MOMENT",
    default: false,
    phase: "1 — Time-to-value",
    description: "First-run auto-scan + auto before→after on the merchant's own product.",
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
