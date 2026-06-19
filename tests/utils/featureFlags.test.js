import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isFeatureEnabled, getFlagSnapshot, FEATURE_FLAGS } from "../../app/utils/featureFlags.server.js";

describe("featureFlags", () => {
  const saved = {};
  beforeEach(() => {
    for (const f of Object.values(FEATURE_FLAGS)) saved[f.env] = process.env[f.env];
  });
  afterEach(() => {
    for (const f of Object.values(FEATURE_FLAGS)) {
      if (saved[f.env] === undefined) delete process.env[f.env];
      else process.env[f.env] = saved[f.env];
    }
  });

  it("every flag defaults OFF (app stays launch-ready)", () => {
    for (const f of Object.values(FEATURE_FLAGS)) delete process.env[f.env];
    const snap = getFlagSnapshot();
    expect(Object.values(snap).every((v) => v === false)).toBe(true);
  });

  it("enables a flag when its env var is truthy", () => {
    process.env.FEATURE_RESULTS_DASHBOARD = "on";
    expect(isFeatureEnabled("resultsDashboard")).toBe(true);
    process.env.FEATURE_RESULTS_DASHBOARD = "1";
    expect(isFeatureEnabled("resultsDashboard")).toBe(true);
    process.env.FEATURE_RESULTS_DASHBOARD = "false";
    expect(isFeatureEnabled("resultsDashboard")).toBe(false);
  });

  it("returns false for unknown flags", () => {
    expect(isFeatureEnabled("doesNotExist")).toBe(false);
  });

  it("P1 flags exist and are off by default", () => {
    for (const f of Object.values(FEATURE_FLAGS)) delete process.env[f.env];
    expect(isFeatureEnabled("aiVisibilityTracker")).toBe(false);
    expect(isFeatureEnabled("gscIntegration")).toBe(false);
  });
});
