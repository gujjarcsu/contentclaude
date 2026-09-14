/**
 * P2.1 — crawler access as a component: one fetch each, diffed daily, and
 * treated as one line among the catalogue findings rather than a pillar.
 * W1: 0.5% of stores. It matters enormously to them and to nobody else.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  CRAWLERS,
  CRAWLER_NOTE,
  STOREFRONT_KEY,
  parseRobots,
  groupFor,
  robotsBlocks,
  classifyAccess,
  diffAccess,
  blockedAgents,
  passwordProtectedFrom,
} from "../../app/utils/crawlerAccess.js";

describe("the six agents, each explained", () => {
  it("is exactly the brief's list", () => {
    expect([...CRAWLERS]).toEqual(["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "bingbot", "Googlebot", "Google-Extended"]);
  });

  it.each(CRAWLERS)("%s says what blocking it costs", (a) => {
    expect(CRAWLER_NOTE[a].length).toBeGreaterThan(20);
  });

  it("Google-Extended is explained as NOT affecting Search — the common misread", () => {
    expect(CRAWLER_NOTE["Google-Extended"]).toMatch(/does NOT affect Search/i);
  });
});

describe("robots.txt — the real-world file, not the spec example", () => {
  const ROBOTS = `# Shopify default plus an edit
User-agent: *
Disallow: /admin
Disallow: /cart
Allow: /

User-Agent: OAI-SearchBot
User-agent: PerplexityBot
Disallow: /

user-agent: Googlebot
Disallow:
`;

  it("parses groups, merges consecutive agents, ignores comments and case", () => {
    const g = parseRobots(ROBOTS);
    expect(g).toHaveLength(3);
    expect(g[1].agents).toEqual(["oai-searchbot", "perplexitybot"]);
    expect(g[1].disallow).toEqual(["/"]);
    expect(g[2].disallow).toEqual([""]);
  });

  it("a named group beats the wildcard", () => {
    expect(groupFor(parseRobots(ROBOTS), "OAI-SearchBot").agents).toContain("oai-searchbot");
    expect(groupFor(parseRobots(ROBOTS), "bingbot").agents).toEqual(["*"]);
  });

  it("blocks the two named agents at the root and nobody else", () => {
    expect(robotsBlocks(ROBOTS, "OAI-SearchBot")).toBe(true);
    expect(robotsBlocks(ROBOTS, "PerplexityBot")).toBe(true);
    expect(robotsBlocks(ROBOTS, "bingbot")).toBe(false);
    expect(robotsBlocks(ROBOTS, "Googlebot")).toBe(false);
    expect(robotsBlocks(ROBOTS, "Claude-SearchBot")).toBe(false);
  });

  it("an empty Disallow means nothing is disallowed", () => {
    expect(robotsBlocks("User-agent: *\nDisallow:\n", "OAI-SearchBot")).toBe(false);
  });

  it("longest match wins, and a tie goes to Allow", () => {
    expect(robotsBlocks("User-agent: *\nDisallow: /\nAllow: /products\n", "bingbot", "/products/x")).toBe(false);
    expect(robotsBlocks("User-agent: *\nDisallow: /\nAllow: /products\n", "bingbot", "/collections")).toBe(true);
    expect(robotsBlocks("User-agent: *\nDisallow: /a\nAllow: /a\n", "bingbot", "/a/b")).toBe(false);
  });

  it("handles wildcards and the end anchor", () => {
    expect(robotsBlocks("User-agent: *\nDisallow: /*.json$\n", "bingbot", "/products.json")).toBe(true);
    expect(robotsBlocks("User-agent: *\nDisallow: /*.json$\n", "bingbot", "/products")).toBe(false);
  });

  it("no robots.txt at all means allowed, not blocked", () => {
    expect(robotsBlocks("", "OAI-SearchBot")).toBe(false);
    expect(robotsBlocks(null, "OAI-SearchBot")).toBe(false);
  });
});

describe("classifying a live fetch", () => {
  it("robots wins regardless of status", () => {
    expect(classifyAccess({ robotsBlocked: true, status: 200 })).toEqual({ blocked: true, reason: "robots.txt" });
  });

  it("an edge 403 or 429 is a block even with a permissive robots.txt — the WAF case nobody audits", () => {
    expect(classifyAccess({ robotsBlocked: false, status: 403 }).blocked).toBe(true);
    expect(classifyAccess({ robotsBlocked: false, status: 429 }).blocked).toBe(true);
  });

  it("unreachable is NOT blocked — an outage is not a robots rule", () => {
    const r = classifyAccess({ robotsBlocked: false, status: null });
    expect(r.blocked).toBe(false);
    expect(r.reason).toBe("unreachable");
  });

  it("landing on /password is neither blocked nor 'ok' — it is the password page", () => {
    const r = classifyAccess({ robotsBlocked: false, status: 200, finalPath: "/password" });
    expect(r).toEqual({ blocked: false, reason: "password page" });
    expect(classifyAccess({ robotsBlocked: false, status: 200, finalPath: "/" }).reason).toBe("ok");
    expect(classifyAccess({ robotsBlocked: false, status: 200, finalPath: "/products/x" }).reason).toBe("ok");
  });

  it("the storefront entry in a results map is read, and never counted as an agent", () => {
    const results = { [STOREFRONT_KEY]: { passwordProtected: true }, "OAI-SearchBot": { blocked: false } };
    expect(passwordProtectedFrom(results)).toBe(true);
    expect(passwordProtectedFrom({})).toBe(false);
    expect(blockedAgents(results)).toEqual([]);
    expect(diffAccess({}, results)).toEqual({ newlyBlocked: [], newlyAllowed: [] });
  });
});

describe("the diff is the product", () => {
  it("reports only what changed, in display order", () => {
    const prev = { "OAI-SearchBot": { blocked: false }, bingbot: { blocked: true } };
    const next = { "OAI-SearchBot": { blocked: true }, bingbot: { blocked: false }, Googlebot: { blocked: false } };
    expect(diffAccess(prev, next)).toEqual({ newlyBlocked: ["OAI-SearchBot"], newlyAllowed: ["bingbot"] });
  });

  it("a first run has no 'newly' anything", () => {
    expect(diffAccess({}, { "OAI-SearchBot": { blocked: true } }).newlyBlocked).toEqual(["OAI-SearchBot"]);
    expect(blockedAgents({ "OAI-SearchBot": { blocked: true }, Googlebot: { blocked: false } })).toEqual(["OAI-SearchBot"]);
  });
});

describe("wiring — a component of the daily walk, against the PRIMARY domain", () => {
  const srv = code(readFileSync("app/utils/crawlerAccess.server.js", "utf8"));
  const watch = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));

  it("tests the primary domain, never only the myshopify host", () => {
    expect(srv).toMatch(/primaryDomain/);
  });

  it("every fetch has a timeout — one bare fetch, inside the wrapper; everything else goes through it", () => {
    expect(srv).toMatch(/AbortController/);
    expect((srv.match(/\bfetch\(/g) ?? []).length).toBe(1);
    expect((srv.match(/fetchWithTimeout\(/g) ?? []).length).toBeGreaterThanOrEqual(3); // definition + robots + agents
  });

  it("runs inside the daily catalogue walk, once per shop", () => {
    expect(watch).toMatch(/checkCrawlerAccess\(/);
  });

  it("asks Shopify whether the storefront is password-protected, once, and the page says so", () => {
    expect(srv).toMatch(/passwordProtection \{ enabled \}/);
    expect(watch).toMatch(/storefrontPasswordProtected\(/);
    const page = code(readFileSync("app/routes/app.attention.jsx", "utf8"));
    expect(page).toMatch(/password-protected/);
    expect(page).toMatch(/crawler\.passwordProtected/);
  });

  it("Home surfaces a blocked AI crawler", () => {
    const home = code(readFileSync("app/routes/app._index.jsx", "utf8"));
    expect(home).toMatch(/homeAttentionLines/);
  });
});
