/**
 * P3.4 (Phase 8) — first-party AI sessions, the pure half. The query waits
 * on the owner's Level 2 approval; the labelling does not.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "../helpers/code.js";
import { FIRST_CLASS, INFERRED_HOSTS, classifySession, tallySessions, FLOOR_SENTENCE, displayLabel } from "../../app/utils/aiSessions.js";

describe("classification", () => {
  it("Shopify's first-class channels are never called inferred", () => {
    for (const [k, label] of Object.entries(FIRST_CLASS)) expect(classifySession({ agenticChannel: k })).toEqual({ label, inferred: false });
    expect(classifySession({ agenticChannel: "ChatGPT" })).toEqual({ label: "ChatGPT", inferred: false });
  });

  it("Perplexity and Claude come from the referrer and are labelled inferred", () => {
    expect(classifySession({ referrerHost: "www.perplexity.ai" })).toEqual({ label: "Perplexity", inferred: true });
    expect(classifySession({ referrerHost: "claude.ai" })).toEqual({ label: "Claude", inferred: true });
    expect(classifySession({ referrerHost: "sub.claude.ai" })).toEqual({ label: "Claude", inferred: true });
    expect(displayLabel("Claude", true)).toBe("Claude (inferred)");
    expect(INFERRED_HOSTS.map((h) => h.label)).toContain("Perplexity");
  });

  it("a Google referrer is NOT an AI session — that is the floor", () => {
    expect(classifySession({ referrerHost: "www.google.com" })).toBeNull();
    expect(classifySession({})).toBeNull();
    expect(FLOOR_SENTENCE).toMatch(/A floor, not a total/);
    expect(FLOOR_SENTENCE).toMatch(/count as organic/);
    expect(FLOOR_SENTENCE).toMatch(/inferred/);
  });

  it("tallies by label, largest first, carrying the inferred flag", () => {
    const t = tallySessions([
      { agenticChannel: "chatgpt", sessions: 5 },
      { referrerHost: "perplexity.ai", sessions: 2 },
      { agenticChannel: "chatgpt", sessions: 4 },
      { referrerHost: "google.com", sessions: 99 },
    ]);
    expect(Object.keys(t)).toEqual(["ChatGPT", "Perplexity"]);
    expect(t.ChatGPT).toEqual({ sessions: 9, inferred: false });
    expect(t.Perplexity).toEqual({ sessions: 2, inferred: true });
  });
});

describe("the query waits on the approval, and nothing pretends otherwise", () => {
  it("no file under app/ runs shopifyqlQuery yet", () => {
    const walk = (dir, out = []) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(js|jsx)$/.test(name)) out.push(p);
      }
      return out;
    };
    const offenders = walk("app").filter((p) => /shopifyqlQuery\s*\(/.test(code(readFileSync(p, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("the module says why, naming P0.10 and read_reports", () => {
    const raw = readFileSync("app/utils/aiSessions.js", "utf8");
    expect(raw).toMatch(/read_reports/);
    expect(raw).toMatch(/P0\.10/);
  });
});
