/**
 * P2.1 — crawler access, as a COMPONENT of the free scan, not a pillar.
 *
 * W1 measured it: 2 stores in 409 block an AI crawler while allowing Google.
 * 0.5%. So this is one robots.txt fetch and six cheap requests, diffed daily,
 * and it matters enormously to the 0.5% — blocking OAI-SearchBot means, in
 * OpenAI's words, the store "won't appear in ChatGPT search answers." What it
 * cannot do is carry a phase, and the Home banner treats it as one line among
 * the catalogue findings, not a headline.
 *
 * PURE. The fetches live in crawlerAccess.server.js.
 */

/** The six the brief names. Order is display order. */
export const CRAWLERS = Object.freeze([
  "OAI-SearchBot",
  "PerplexityBot",
  "Claude-SearchBot",
  "bingbot",
  "Googlebot",
  "Google-Extended",
]);

export const CRAWLER_NOTE = Object.freeze({
  "OAI-SearchBot": "ChatGPT search. Blocked means the store will not appear in ChatGPT search answers.",
  PerplexityBot: "Perplexity's answer engine. Blocked means Perplexity cannot cite the store in an answer.",
  "Claude-SearchBot": "Claude's web search. Blocked means Claude cannot read or cite the store when it searches.",
  bingbot: "Bing, and everything Copilot cites through it.",
  Googlebot: "Google Search. Blocked here means blocked everywhere Google shows results, AI Overviews included.",
  "Google-Extended": "Google's AI training and Gemini grounding control. Blocking it does NOT affect Search or AI Overviews.",
});

/**
 * Parse robots.txt into groups of { agents, allow, disallow }. Tolerant of the
 * real-world file: comments, blank lines, mixed case, CRLF.
 */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.split("#")[0].trim();
    if (!line) {
      lastWasAgent = false;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      // Consecutive User-agent lines share one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow") current.disallow.push(value);
    else if (key === "allow") current.allow.push(value);
  }
  return groups;
}

/** The group that applies to an agent: an exact/prefix match wins over `*`. */
export function groupFor(groups, agent) {
  const a = String(agent ?? "").toLowerCase();
  let star = null;
  let best = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const ga of g.agents) {
      if (ga === "*") star = star ?? g;
      else if (a.startsWith(ga) || ga.startsWith(a)) {
        if (ga.length > bestLen) {
          best = g;
          bestLen = ga.length;
        }
      }
    }
  }
  return best ?? star ?? null;
}

/**
 * Does robots.txt tell this agent it may not fetch `path`?
 *
 * Standard rule: the longest matching Allow/Disallow wins; a tie goes to
 * Allow. An empty Disallow means "nothing is disallowed". No applicable group
 * means allowed.
 */
export function robotsBlocks(text, agent, path = "/") {
  const g = groupFor(parseRobots(text), agent);
  if (!g) return false;
  const matchLen = (rules) =>
    rules.reduce((best, rule) => {
      const r = String(rule ?? "");
      if (!r) return best;
      const pattern = r.endsWith("$") ? r.slice(0, -1) : r;
      const hit = pattern.includes("*") ? wildcardMatch(pattern, path) : path.startsWith(pattern);
      return hit && r.length > best ? r.length : best;
    }, -1);
  const dis = matchLen(g.disallow);
  const allow = matchLen(g.allow);
  if (dis === -1) return false;
  return dis > allow;
}

function wildcardMatch(pattern, path) {
  const parts = pattern.split("*");
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      if (!path.startsWith(part)) return false;
      pos = part.length;
      continue;
    }
    const at = path.indexOf(part, pos);
    if (at === -1) return false;
    pos = at + part.length;
  }
  return true;
}

/**
 * One result per agent, from a robots verdict and a live fetch status.
 * Blocked at the edge (403/429/503 with a challenge) is a block whatever
 * robots.txt says — a WAF rule is the case W1 found nobody audits.
 */
export function classifyAccess({ robotsBlocked, status }) {
  if (robotsBlocked) return { blocked: true, reason: "robots.txt" };
  if (status === 403 || status === 429) return { blocked: true, reason: `edge ${status}` };
  if (status === null || status === undefined) return { blocked: false, reason: "unreachable" };
  return { blocked: false, reason: "ok" };
}

/** Which agents changed state between two result maps. */
export function diffAccess(prev, next) {
  const p = prev ?? {};
  const n = next ?? {};
  const newlyBlocked = [];
  const newlyAllowed = [];
  for (const agent of CRAWLERS) {
    const was = !!p[agent]?.blocked;
    const is = !!n[agent]?.blocked;
    if (!was && is) newlyBlocked.push(agent);
    if (was && !is) newlyAllowed.push(agent);
  }
  return { newlyBlocked, newlyAllowed };
}

/** Agents currently blocked, in display order. */
export function blockedAgents(results) {
  return CRAWLERS.filter((a) => !!results?.[a]?.blocked);
}
