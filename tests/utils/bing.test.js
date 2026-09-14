/**
 * P3.2 (Phase 8) — Bing Webmaster REST. The key is a query parameter, so a
 * request URL is a secret; nothing may log one. Parsers tolerate Bing's
 * envelope and its date form.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { BING_BASE, bingUrl, redactKey, unwrap, bingDate, parseUserSites, parseUrlInfo, parseQuota, matchSite, underSite } from "../../app/utils/bing.js";
import { composeWeeklyReport } from "../../app/utils/weeklyReport.server.js";

describe("requests", () => {
  it("builds the documented URL form: base/Method?params&apikey", () => {
    const u = bingUrl("GetUrlInfo", { siteUrl: "https://s.example/", url: "https://s.example/products/a", apikey: "K1" });
    expect(u.startsWith(`${BING_BASE}/GetUrlInfo?`)).toBe(true);
    expect(u).toContain("siteUrl=https%3A%2F%2Fs.example%2F");
    expect(u).toContain("apikey=K1");
  });

  it("redacts the key wherever it appears", () => {
    expect(redactKey("https://x/y?siteUrl=a&apikey=SECRET123&z=1")).toBe("https://x/y?siteUrl=a&apikey=[redacted]&z=1");
    expect(redactKey("error at ?apikey=abc")).toBe("error at ?apikey=[redacted]");
  });
});

describe("responses", () => {
  it("unwraps { d }", () => {
    expect(unwrap({ d: { DailyQuota: 9 } })).toEqual({ DailyQuota: 9 });
    expect(unwrap({ d: null })).toBeNull();
    expect(unwrap(null)).toBeNull();
  });

  it("reads Bing's /Date(ms)/ form and ISO", () => {
    expect(bingDate("/Date(1757808000000)/").toISOString()).toBe("2025-09-14T00:00:00.000Z");
    expect(bingDate("2026-09-14T00:00:00Z").toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(bingDate(null)).toBeNull();
    expect(bingDate("garbage")).toBeNull();
  });

  it("parses sites, url info and quota", () => {
    expect(parseUserSites([{ Url: "https://s.example/", IsVerified: true }, { Url: "" }])).toEqual([{ url: "https://s.example/", verified: true }]);
    const info = parseUrlInfo({ LastCrawledDate: "/Date(1757808000000)/", DiscoveryDate: null, HttpStatus: 200 });
    expect(info.lastCrawledAt.toISOString()).toBe("2025-09-14T00:00:00.000Z");
    expect(info.httpStatus).toBe(200);
    expect(parseUrlInfo(null)).toBeNull();
    expect(parseQuota({ DailyQuota: 973, MonthlyQuota: 10973 })).toEqual({ daily: 973, monthly: 10973 });
  });

  it("matches the site to the storefront by host, www-insensitive; underSite checks host only", () => {
    const sites = [{ url: "https://other.example/" }, { url: "http://www.s.example/" }];
    expect(matchSite(sites, "https://s.example").url).toBe("http://www.s.example/");
    expect(matchSite(sites, "https://none.example")).toBeNull();
    expect(underSite("https://s.example/products/a", "http://www.s.example/")).toBe(true);
    expect(underSite("https://s.example/products/a", "https://other.example/")).toBe(false);
  });
});

describe("the key never reaches a log, a response or a merchant", () => {
  const srv = code(readFileSync("app/utils/bing.server.js", "utf8"));
  it("no logger call in the server module mentions a key or a url with one", () => {
    for (const m of srv.matchAll(/logger\.\w+\(\{([^}]*)\}/g)) {
      expect(m[1]).not.toMatch(/\bkey\b|apikey|rawKey|url:/i);
    }
  });
  it("the status shape is booleans, a timestamp and the site URL — no ciphertext, no prefix, no length", () => {
    const m = srv.match(/export async function bingKeyStatus[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m[0]).not.toMatch(/ciphertext:|\.slice\(|\.length/);
  });
  it("every Bing call has a timeout", () => {
    expect(srv).toMatch(/AbortController/);
    expect(srv).toMatch(/BING_TIMEOUT_MS = 12_000/);
  });
  it("the Settings action hands the raw value to saveBingKey and nowhere else", () => {
    const s = code(readFileSync("app/routes/app.settings.jsx", "utf8"));
    expect(s).toMatch(/saveBingKey\(shop, String\(formData\.get\("bingKey"\) \?\? ""\)/);
    expect((s.match(/formData\.get\("bingKey"\)/g) ?? []).length).toBe(1);
  });
});

describe("P3.6 — the weekly report only when there is something true to say", () => {
  const base = { storeHandle: "s", attentionCount: 0, sinceAt: null };
  const reported = (extra = {}) => ({
    status: "reported",
    reportedAt: "2026-09-14T00:00:00Z",
    seed: 7,
    summary: { enough: true, submit: { n: 6, crawled: 6, censored: 0, medianHours: 4 }, hold: { n: 6, crawled: 6, censored: 0, medianHours: 50 }, diffHours: 46, lo: 30, hi: 60, favourable: true, complete: true, dayOf: 3 },
    ...extra,
  });

  it("a quiet week sends nothing", () => {
    expect(composeWeeklyReport({ ...base, experiments: [] })).toBeNull();
    expect(composeWeeklyReport({ ...base, experiments: [reported({ status: "running" })] })).toBeNull();
    expect(composeWeeklyReport({ ...base, experiments: [reported({ summary: { ...reported().summary, enough: false } })] })).toBeNull();
    expect(composeWeeklyReport({ ...base, sinceAt: "2026-09-15T00:00:00Z", experiments: [reported()] })).toBeNull();
  });

  it("a week with a result sends the verdict, the method, the seed, and links to the screen that proves it", () => {
    const r = composeWeeklyReport({ ...base, attentionCount: 2, experiments: [reported()] });
    expect(r.subject).toBe("Your crawl-time result is in");
    expect(r.text).toMatch(/Submitted pages: median 4 h/);
    expect(r.text).toMatch(/Method: a seeded random half/);
    expect(r.text).toMatch(/Seed 7/);
    expect(r.text).toMatch(/\/app\/proof/);
    expect(r.text).toMatch(/2 products currently need attention: .*\/app\/attention/);
    expect(r.text).not.toMatch(/rank|guarantee/i);
  });
});
