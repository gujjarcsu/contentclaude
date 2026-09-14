/**
 * P3.3 (Phase 8) — the two reports that have no API. We teach it; we never
 * scrape it. Held mechanically: no file under app/ fetches either console;
 * a reading is validated, dated, and shown back as the merchant's.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "../helpers/code.js";
import { AI_REPORTS, AI_REPORT_KEYS, parseReadings, validateReading, withReading, readingSentence } from "../../app/utils/aiReports.js";

describe("the two reports, each taught", () => {
  it("exactly Google's generative-AI report and Bing's AI Performance, each with where, steps, fields and a caveat that says no API", () => {
    expect(AI_REPORT_KEYS).toEqual(["google_ai", "bing_ai"]);
    for (const r of AI_REPORTS) {
      expect(r.where.length).toBeGreaterThan(40);
      expect(r.steps.length).toBeGreaterThanOrEqual(3);
      expect(r.fields.length).toBeGreaterThanOrEqual(2);
      expect(r.caveat).toMatch(/no API/);
      expect(r.url).toMatch(/^https:\/\/(search\.google\.com|www\.bing\.com)\//);
    }
    expect(AI_REPORTS[0].caveat).toMatch(/Impressions only/);
    expect(AI_REPORTS[1].caveat).toMatch(/never scrape/);
  });
});

describe("a reading is validated and stays the merchant's", () => {
  it("accepts numbers, rejects text, negatives, fractions where whole numbers are asked, and >100%", () => {
    expect(validateReading("google_ai", { impressions28d: "1,204", pages: "31" })).toEqual({ ok: true, values: { impressions28d: 1204, pages: 31 } });
    expect(validateReading("bing_ai", { citations28d: "12", sharePct: "3.5" }).values).toEqual({ citations28d: 12, sharePct: 3.5 });
    expect(validateReading("google_ai", { impressions28d: "lots" }).ok).toBe(false);
    expect(validateReading("google_ai", { impressions28d: "-1" }).ok).toBe(false);
    expect(validateReading("google_ai", { pages: "1.5" }).ok).toBe(false);
    expect(validateReading("bing_ai", { sharePct: "140" }).ok).toBe(false);
    expect(validateReading("bing_ai", {}).ok).toBe(false);
    expect(validateReading("nope", { x: "1" }).ok).toBe(false);
  });

  it("stores dated, parses safely, and reads back as one observation typed by the merchant", () => {
    const now = new Date("2026-09-14T00:00:00Z");
    const r = withReading(parseReadings("{"), "google_ai", { impressions28d: 1204, pages: 31 }, now);
    expect(r.google_ai.readAt).toBe(now.toISOString());
    const s = readingSentence("google_ai", r);
    expect(s).toMatch(/^Your reading, /);
    expect(s).toMatch(/1,204 ai impressions · 31 product pages that appeared/);
    expect(s).toMatch(/One observation, typed by you — not a trend, not a claim/);
    expect(readingSentence("bing_ai", r)).toBeNull();
  });
});

describe("we never scrape it", () => {
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(js|jsx)$/.test(name)) out.push(p);
    }
    return out;
  };
  it("nothing under app/ fetches Search Console or Bing Webmaster Tools pages", () => {
    const offenders = walk("app").filter((p) => {
      const s = code(readFileSync(p, "utf8"));
      return /fetch\([^)]*(search\.google\.com\/search-console|bing\.com\/webmasters)/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it("the page names its method as none of ours and links out in a new tab", () => {
    const page = code(readFileSync("app/routes/app.ai-reports.jsx", "utf8"));
    expect(page).toMatch(/Method: none of ours/);
    expect(page).toMatch(/target="_blank"/);
    expect(page).toMatch(/never trended/);
  });

  it("is reached from Proof and from the attention page's Search Console card", () => {
    expect(code(readFileSync("app/routes/app.proof.jsx", "utf8"))).toMatch(/\/app\/ai-reports/);
    expect(code(readFileSync("app/routes/app.attention.jsx", "utf8"))).toMatch(/\/app\/ai-reports/);
  });
});
