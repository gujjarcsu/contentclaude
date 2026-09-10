/**
 * Rules the UI needs that used to live behind a Prisma import.
 *
 * The Products counting bug had a root cause that generalises: the shared rule
 * lived in `metrics.server.js`, which imports Prisma, so no component could
 * import it — and the screen wrote its own. The two then disagreed in public.
 *
 * Auditing for the same shape found two more, both with live defects:
 *
 * **Quota percent, re-derived in four components.** Two of the four omitted the
 * `monthlyLimit > 0` guard, so on an unmetered plan the division is `n / 0` →
 * `Infinity` → capped to **100**. Home and Plans showed a merchant on an
 * unmetered plan a full red bar reading 100% used, while Products and Blog on
 * the same store said 0%.
 *
 * **Score bands, re-derived in three places, with three different middle
 * tones** — `caution`, `highlight`, and `undefined`. A product scoring 55 was
 * amber on the Start screen, blue on the audit ring, and uncoloured in the list
 * directly beneath that ring.
 *
 * These tests pin the rules and, more importantly, pin the SHAPE: the pure
 * modules must stay importable, and the screens must not grow their own copies
 * again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const { quotaPct, quotaLevel, quotaRemaining, dismissalActive, WARN_AT_PCT, DISMISS_DAYS } =
  await import("../../app/utils/quota.js");
const { scoreTone, scoreBand, scoreLabel, SCORE_GOOD, SCORE_FAIR } =
  await import("../../app/utils/scoreBands.js");

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe("quota percent — the unmetered-plan bug", () => {
  it("an unmetered plan is 0% used, not 100%", () => {
    // This is the defect. `Math.min(100, Math.round((5 / 0) * 100))` is 100.
    expect(quotaPct(5, 0)).toBe(0);
    expect(quotaPct(500, 0)).toBe(0);
    expect(quotaPct(0, 0)).toBe(0);
    expect(quotaLevel(500, 0)).toBe("ok");
    expect(quotaRemaining(500, 0)).toBe(0);
  });

  it("counts normally when there is a limit", () => {
    expect(quotaPct(0, 25)).toBe(0);
    expect(quotaPct(20, 25)).toBe(80);
    expect(quotaPct(25, 25)).toBe(100);
  });

  it("caps at 100 — reaching a quota is 100%, never 104%", () => {
    expect(quotaPct(26, 25)).toBe(100);
    expect(quotaPct(1000, 25)).toBe(100);
  });

  it("never returns NaN or a negative, whatever it is handed", () => {
    for (const [u, l] of [
      [null, 25],
      [undefined, 25],
      ["x", 25],
      [-5, 25],
      [10, null],
      [10, "x"],
      [10, -3],
    ]) {
      const p = quotaPct(u, l);
      expect(Number.isFinite(p), `quotaPct(${u}, ${l})`).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      expect(quotaRemaining(u, l)).toBeGreaterThanOrEqual(0);
    }
  });

  it("the three states are exclusive and ordered", () => {
    expect(quotaLevel(19, 25)).toBe("ok");
    expect(quotaLevel(20, 25)).toBe("warn"); // exactly the threshold
    expect(quotaLevel(24, 25)).toBe("warn");
    expect(quotaLevel(25, 25)).toBe("exhausted");
    expect(quotaLevel(99, 25)).toBe("exhausted");
    expect(WARN_AT_PCT).toBe(80);
  });

  it("dismissal expires after the stated window", () => {
    expect(DISMISS_DAYS).toBe(7);
    expect(dismissalActive(null)).toBe(false);
    expect(dismissalActive("not a date")).toBe(false);
    expect(dismissalActive(new Date())).toBe(true);
    expect(dismissalActive(new Date(Date.now() - 8 * 86_400_000))).toBe(false);
  });
});

describe("score bands — one colour per number", () => {
  it("bands at 70 and 40", () => {
    expect(scoreBand(100)).toBe("good");
    expect(scoreBand(70)).toBe("good");
    expect(scoreBand(69)).toBe("fair");
    expect(scoreBand(40)).toBe("fair");
    expect(scoreBand(39)).toBe("poor");
    expect(scoreBand(0)).toBe("poor");
    expect(SCORE_GOOD).toBe(70);
    expect(SCORE_FAIR).toBe(40);
  });

  it("the middle band is caution — never red, never neutral", () => {
    // A mid-range score is "work to do", not "broken". Red is reserved for a
    // product that is genuinely invisible to search; neutral says nothing.
    expect(scoreTone(55)).toBe("caution");
    expect(scoreTone(85)).toBe("success");
    expect(scoreTone(20)).toBe("critical");
  });

  it("has a word for every band, for a label or a screen reader", () => {
    expect(scoreLabel(85)).toBe("Good");
    expect(scoreLabel(55)).toBe("Needs work");
    expect(scoreLabel(20)).toBe("Poor");
  });

  it("garbage is poor, not a crash and not a blank tone", () => {
    for (const v of [null, undefined, NaN, "x", {}]) {
      expect(scoreBand(v)).toBe("poor");
      expect(scoreTone(v)).toBe("critical");
    }
  });
});

describe("the shape — this class of bug cannot come back quietly", () => {
  it("the pure modules import nothing from a .server file", () => {
    // The root cause. The moment one of these imports the database, every
    // component loses access and starts re-deriving the rule.
    for (const f of ["app/utils/quota.js", "app/utils/scoreBands.js", "app/utils/productState.js"]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} imports a server module`).not.toMatch(/from\s+["'][^"']*\.server(\.js)?["']/);
      expect(src, `${f} imports the database`).not.toMatch(/db\.server/);
    }
  });

  it("no screen computes a usage percentage by hand any more", () => {
    let swept = 0;
    for (const dir of ["app/routes", "app/components"]) {
      for (const name of readdirSync(dir)) {
        if (!/\.jsx$/.test(name)) continue;
        swept += 1;
        const src = code(`${dir}/${name}`);
        expect(src, `${dir}/${name} re-derives the usage percentage`).not.toMatch(
          /Math\.round\(\s*\(\s*usageCount\s*\//,
        );
      }
    }
    expect(swept, "no files were swept").toBeGreaterThan(10);
  });

  it("no screen draws a score band by hand any more", () => {
    let swept = 0;
    for (const dir of ["app/routes", "app/components"]) {
      for (const name of readdirSync(dir)) {
        if (!/\.jsx$/.test(name)) continue;
        swept += 1;
        const src = code(`${dir}/${name}`);
        // `score >= 70 ? "success" : …` in any of its three former spellings.
        expect(src, `${dir}/${name} re-derives the score band`).not.toMatch(
          /score\s*>=\s*70\s*\?\s*["']success["']/,
        );
      }
    }
    expect(swept).toBeGreaterThan(10);
  });

  it("the server modules still re-export the pure rules, so old imports work", () => {
    const q = code("app/utils/quotaSurfaces.server.js");
    expect(q).toMatch(/export \{[^}]*quotaPct[^}]*\} from "\.\/quota\.js"/);
    const m = code("app/utils/metrics.server.js");
    expect(m).toMatch(/export \{[\s\S]*?stateOf[\s\S]*?\} from "\.\/productState\.js"/);
  });
});
