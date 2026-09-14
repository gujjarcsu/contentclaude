/**
 * P2.5 — the one check no app can make.
 *
 * Verified 2026-09-14: the Search Console API v1 reference index lists
 * searchanalytics, sitemaps, sites and urlInspection and nothing else. The
 * brief's rule — no gate on an unverified API — is held here mechanically:
 * nothing under app/ may talk to the Search Console API at all, and the
 * merchant's answer is labelled as theirs wherever it is shown.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "../helpers/code.js";
import {
  GSC_ANSWER,
  GSC_ANSWERS,
  GSC_LABEL,
  GSC_TONE,
  GSC_RECHECK_DAYS,
  GSC_SETTINGS_URL,
  isGscAnswer,
  gscState,
  gscLine,
} from "../../app/utils/gscAiControl.js";
import { homeAttentionLines } from "../../app/utils/catalogueWatch.js";
import { DATA_INVENTORY } from "../../app/utils/legal.js";

const NOW = new Date("2026-09-14T02:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);

// vi.mock is hoisted above every const in this file, so the spy it closes
// over must be hoisted with it.
const { upsert } = vi.hoisted(() => ({ upsert: vi.fn(async (args) => args) }));
vi.mock("../../app/shopify.server.js", () => ({
  authenticate: { admin: vi.fn(async () => ({ session: { shop: "t.myshopify.com" } })) },
}));
vi.mock("../../app/db.server.js", () => ({ default: { growthState: { upsert } } }));

describe("the three answers", () => {
  it("are exactly three, each labelled and toned", () => {
    expect(GSC_ANSWERS).toEqual(["default", "excluded", "no_gsc"]);
    for (const a of GSC_ANSWERS) {
      expect(GSC_LABEL[a].length).toBeGreaterThan(10);
      expect(["success", "critical", "info"]).toContain(GSC_TONE[a]);
    }
    expect(isGscAnswer("excluded")).toBe(true);
    expect(isGscAnswer("yes")).toBe(false);
    expect(isGscAnswer(null)).toBe(false);
  });

  it("the settings link goes to Search Console, not to us", () => {
    expect(GSC_SETTINGS_URL).toMatch(/^https:\/\/search\.google\.com\/search-console/);
  });
});

describe("state", () => {
  it("unanswered is nothing — not included, not excluded", () => {
    expect(gscState({}, NOW)).toEqual({ answer: null, answeredAt: null, excluded: false, stale: false, days: null });
    expect(gscState({ answer: "garbage", answeredAt: NOW }, NOW).answer).toBeNull();
  });

  it("excluded is excluded, and fresh", () => {
    const s = gscState({ answer: GSC_ANSWER.EXCLUDED, answeredAt: daysAgo(3) }, NOW);
    expect(s.excluded).toBe(true);
    expect(s.stale).toBe(false);
    expect(s.days).toBe(3);
  });

  it(`an answer older than ${GSC_RECHECK_DAYS} days is stale — worth a re-check, not wrong`, () => {
    expect(gscState({ answer: GSC_ANSWER.DEFAULT, answeredAt: daysAgo(GSC_RECHECK_DAYS) }, NOW).stale).toBe(true);
    expect(gscState({ answer: GSC_ANSWER.DEFAULT, answeredAt: daysAgo(GSC_RECHECK_DAYS - 1) }, NOW).stale).toBe(false);
  });
});

describe("the line is theirs, not ours", () => {
  it("only an excluded answer produces a line, and the line says whose answer it is", () => {
    expect(gscLine(gscState({ answer: GSC_ANSWER.DEFAULT, answeredAt: NOW }, NOW))).toBeNull();
    expect(gscLine(gscState({ answer: GSC_ANSWER.NO_GSC, answeredAt: NOW }, NOW))).toBeNull();
    const line = gscLine(gscState({ answer: GSC_ANSWER.EXCLUDED, answeredAt: NOW }, NOW));
    expect(line).toMatch(/your answer/i);
    expect(line).toMatch(/Search Console/);
  });

  it("on Home it sits after a blocked crawler and before the catalogue numbers", () => {
    const lines = homeAttentionLines({
      needAttention: 1,
      blocking: 1,
      crawler: { blocked: ["Googlebot"] },
      gsc: gscState({ answer: GSC_ANSWER.EXCLUDED, answeredAt: NOW }, NOW),
    });
    expect(lines[0]).toMatch(/Googlebot is blocked/);
    expect(lines[1]).toMatch(/excluded from Google's AI features/);
    expect(lines[2]).toMatch(/1 product is missing/);
    expect(lines[3]).toMatch(/1 product needs attention/);
  });
});

describe("the route persists the answer as the merchant's", () => {
  const post = (body) =>
    new Request("https://app.test/app/gsc-ai-control", { method: "POST", body: new URLSearchParams(body) });

  beforeEach(() => upsert.mockClear());

  it("stores a valid answer with its date", async () => {
    const { action } = await import("../../app/routes/app.gsc-ai-control.jsx");
    const res = await action({ request: post({ answer: "excluded" }) });
    expect((await res.json()).success).toBe(true);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ shop: "t.myshopify.com" });
    expect(arg.update.gscAiControl).toBe("excluded");
    expect(arg.update.gscAiControlAt).toBeInstanceOf(Date);
  });

  it("reset clears both columns", async () => {
    const { action } = await import("../../app/routes/app.gsc-ai-control.jsx");
    await action({ request: post({ answer: "reset" }) });
    expect(upsert.mock.calls[0][0].update).toEqual({ gscAiControl: null, gscAiControlAt: null });
  });

  it("rejects anything else with 400 and writes nothing", async () => {
    const { action } = await import("../../app/routes/app.gsc-ai-control.jsx");
    const res = await action({ request: post({ answer: "yes please" }) });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("no gate on an unverified API — mechanically", () => {
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(js|jsx|mjs)$/.test(name)) out.push(p);
    }
    return out;
  };

  it("nothing under app/ talks to the Search Console API", () => {
    const offenders = walk("app").filter((p) => /searchconsole\.googleapis\.com|webmasters\/v3|webmasters\.readonly/.test(code(readFileSync(p, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("the attention page asks the question, says why, and posts to the route", () => {
    const page = code(readFileSync("app/routes/app.attention.jsx", "utf8"));
    expect(page).toMatch(/no API/);
    expect(page).toMatch(/\/app\/gsc-ai-control/);
    expect(page).toMatch(/GSC_SETTINGS_URL/);
    for (const a of GSC_ANSWERS) expect(page).toContain(`GSC_ANSWER.${a === "no_gsc" ? "NO_GSC" : a.toUpperCase()}`);
  });

  it("the summary carries the answer, read from GrowthState", () => {
    const srv = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
    expect(srv).toMatch(/gscAiControl/);
    expect(srv).toMatch(/gscState\(/);
  });

  it("the privacy inventory says we keep it", () => {
    expect(DATA_INVENTORY.find((r) => r.model === "GrowthState").holds).toMatch(/Search Console/);
  });
});
