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
    process.env.FEATURE_MAGIC_MOMENT = "on";
    expect(isFeatureEnabled("magicMoment")).toBe(true);
    process.env.FEATURE_MAGIC_MOMENT = "1";
    expect(isFeatureEnabled("magicMoment")).toBe(true);
    process.env.FEATURE_MAGIC_MOMENT = "false";
    expect(isFeatureEnabled("magicMoment")).toBe(false);
  });

  it("returns false for unknown flags", () => {
    expect(isFeatureEnabled("doesNotExist")).toBe(false);
  });

  // P2-5 guard: only flags with a real consumer may exist in the registry.
  // Speculative flags for unbuilt features are an App Store review smell.
  it("registry contains only flags that are actually consumed", () => {
    expect(Object.keys(FEATURE_FLAGS).sort()).toEqual(["magicMoment"]);
  });
});
