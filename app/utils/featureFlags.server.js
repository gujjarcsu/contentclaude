// Feature-flag registry — server-only.
//
// Only flags with a REAL consumer in the codebase live here. Speculative
// flags for unbuilt features were removed pre-submission (a reviewer reading
// the repo should not find half-built surface area); add a flag back in the
// same commit that ships its feature.
//
// Enable a flag by setting its env var to one of: 1 / true / on / yes.
//   e.g.  FEATURE_SOMETHING=on
//
// Plan-gating (entitlements) is SEPARATE from flags: a flag turns a capability
// on for the whole app; entitlements decide which plan can use it.
//
// THE REGISTRY IS CURRENTLY EMPTY, and that is the correct state.
// `magicMoment` was the last one. It gated the first-run auto-scan behind
// FEATURE_MAGIC_MOMENT, which meant the first thing a new merchant saw depended
// on an environment variable — and it was off in production, so nobody ever saw
// it. Phase 3 item 3.1 absorbed that engine into the Start state on Home, where
// it runs for every shop unconditionally. A first-run experience is not a
// feature to be toggled; it is the product.
//
// The machinery stays because the rule above is worth keeping: add a flag back
// in the same commit that ships its feature. Removing the Fly secret is in
// HUMAN-NEEDED.md.

const TRUTHY = new Set(["1", "true", "on", "yes"]);

export const FEATURE_FLAGS = {};

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
  return Object.fromEntries(Object.keys(FEATURE_FLAGS).map((k) => [k, isFeatureEnabled(k)]));
}
