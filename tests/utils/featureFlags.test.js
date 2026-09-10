import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
    // The registry is empty, so this exercises the reader against a temporary
    // entry rather than a shipped flag — the parsing rule still has to hold
    // for the next flag somebody adds.
    FEATURE_FLAGS.__probe = { env: "FEATURE___PROBE", default: false };
    try {
      for (const v of ["on", "1", "true", "yes", "ON", " yes "]) {
        process.env.FEATURE___PROBE = v;
        expect(isFeatureEnabled("__probe"), v).toBe(true);
      }
      for (const v of ["false", "0", "off", "", "banana"]) {
        process.env.FEATURE___PROBE = v;
        expect(isFeatureEnabled("__probe"), v).toBe(false);
      }
      delete process.env.FEATURE___PROBE;
      expect(isFeatureEnabled("__probe")).toBe(false);
    } finally {
      delete FEATURE_FLAGS.__probe;
      delete process.env.FEATURE___PROBE;
    }
  });

  it("returns false for unknown flags", () => {
    expect(isFeatureEnabled("doesNotExist")).toBe(false);
  });

  // P2-5 guard: only flags with a real consumer may exist in the registry.
  // Speculative flags for unbuilt features are an App Store review smell.
  it("the registry is empty, and every flag in it has a consumer", () => {
    // Phase 3 item 3.1 removed the last one. `magicMoment` gated the first-run
    // auto-scan, it was OFF in production, and so the first thing a new
    // merchant saw was decided by an environment variable that nobody had set.
    // That engine is now the Start state on Home and runs for every shop.
    expect(Object.keys(FEATURE_FLAGS)).toEqual([]);

    // If a flag is ever added back, it must be read somewhere.
    for (const name of Object.keys(FEATURE_FLAGS)) {
      const used = readdirSync("app/routes")
        .concat(readdirSync("app/utils"))
        .some((f) => {
          try {
            return readFileSync(`app/routes/${f}`, "utf8").includes(name);
          } catch {
            try {
              return readFileSync(`app/utils/${f}`, "utf8").includes(name);
            } catch {
              return false;
            }
          }
        });
      expect(used, `flag ${name} has no consumer`).toBe(true);
    }
  });

  it("no source file still reads the retired magic-moment flag", () => {
    for (const dir of ["app/routes", "app/utils"]) {
      for (const f of readdirSync(dir)) {
        if (!/\.(js|jsx)$/.test(f)) continue;
        const src = readFileSync(`${dir}/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        expect(src, `${dir}/${f}`).not.toMatch(/isFeatureEnabled\(\s*["']magicMoment["']\s*\)/);
      }
    }
  });
});
