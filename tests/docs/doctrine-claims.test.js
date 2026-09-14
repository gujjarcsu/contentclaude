/**
 * P1.1 — strip every unevidenced claim, and keep it stripped.
 *
 * `09-DOCTRINE.md` §2 is titled "THE THINGS WE WILL NEVER SAY", and says of
 * itself: "These are bans, not preferences. Each one has a court-admissible
 * reason." A ban with no enforcement is a preference, so this is the
 * enforcement.
 *
 * Two halves, and the second is the one that stops this rotting:
 *   1. No banned phrasing appears in any user-visible string.
 *   2. The doctrine still CONTAINS the rows these patterns encode. Without
 *      that, someone edits §2, the test keeps passing against a rule that no
 *      longer exists, and the guard silently guards nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DOCTRINE = readFileSync("docs/navaal/09-DOCTRINE.md", "utf8");

/** Comments stripped: a comment explaining why a phrase is banned is not the phrase. */
function visibleSource(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ")
    .replace(/([^:])\/\/[^"'`\n]*$/gm, "$1");
}

function sourceFiles() {
  const out = [];
  for (const dir of ["app/routes", "app/components", "app/utils"]) {
    for (const f of readdirSync(dir)) {
      if (/\.(jsx|js)$/.test(f)) out.push(join(dir, f));
    }
  }
  return out;
}

const FILES = sourceFiles();

/**
 * Each ban: the pattern to refuse, and a phrase that must still be present in
 * §2 so the test fails loudly if the rule it claims to enforce is edited away.
 */
const BANS = [
  {
    why: 'promises citation we cannot observe — §2 row 1',
    pattern: /\b(get|getting) cited by\b|\bto be cited by\b|\bhow citable\b|\brank(ing)? in ai search\b/i,
    doctrineAnchor: "Get cited by ChatGPT",
  },
  {
    why: 'Google\'s Indexing API is restricted to job postings and broadcast events — §2 row 2',
    pattern: /\binstant(ly)?\s+(google\s+)?index/i,
    doctrineAnchor: "Instant Google indexing",
  },
  {
    why: "indexation is Google's decision, never ours — §2 row 3",
    pattern: /\bguarantee[sd]?\s+(indexation|indexing|that your products will be indexed)\b/i,
    doctrineAnchor: "We guarantee indexation",
  },
  {
    why: "average position is impression-weighted and moves with no ranking change — §2 row 4",
    pattern: /\b(improved|raised|lifted)\s+your\s+rankings?\b|\brankings?\s+by\s+\d+\s+positions?\b/i,
    doctrineAnchor: "We improved your rankings by N positions",
  },
  {
    why: "attribution is not causation, and there is no control group — §2 rows 5 and 6",
    pattern: /\bwe\s+drove\s+\$|\bcaused\s+by\s+our\s+content\b/i,
    doctrineAnchor: "Attribution is not causation",
  },
  {
    why: "a blended weekly score hides per-engine reality — §2 row 7",
    pattern: /\bai\s+visibility\s+score\b/i,
    doctrineAnchor: 'blended "AI Visibility Score"',
  },
  {
    why: "Search Console finalises after ~3 days, so nothing here is real time — §2 row 8",
    pattern: /\breal.?time\s+(seo|search|ranking|tracking)\b/i,
    doctrineAnchor: "Real-time SEO tracking",
  },
];

describe("09-DOCTRINE.md §2 — the things we will never say", () => {
  it.each(BANS)("the doctrine still carries the rule: $why", ({ doctrineAnchor }) => {
    // If this fails, §2 was edited and the ban below may now be enforcing a
    // rule the doctrine no longer holds. Re-read §2 before touching the pattern.
    expect(DOCTRINE, `09-DOCTRINE.md §2 no longer contains "${doctrineAnchor}"`).toContain(doctrineAnchor);
  });

  for (const { why, pattern } of BANS) {
    it.each(FILES)(`%s — ${why}`, (file) => {
      expect(visibleSource(file), `${file} matches ${pattern}`).not.toMatch(pattern);
    });
  }
});

describe("09-DOCTRINE.md §3 — FAQPage JSON-LD is harmless, claiming a benefit is not", () => {
  // §3, verbatim: "The rich result NO LONGER EXISTS. The markup is inert.
  // Emitting it is harmless; CLAIMING A BENEFIT IS NOT." Google retired FAQ
  // rich results from Search on 7 May 2026. The value is the VISIBLE FAQ:
  // "This is the real value... Promote it. It is the answer-first content,
  // not the schema."
  //
  // These patterns ban the CLAIM SHAPE, not the words. Saying plainly that
  // "Google retired FAQ rich results in May 2026" is a fact a merchant should
  // be told, and must keep passing.
  const CLAIMS = [
    {
      why: "says the schema makes FAQs appear in search",
      pattern: /(faq|schema|markup|structured data)[^.]{0,60}\b(appears?|show up|reach)\b[^.]{0,25}\b(google|search engines?|serps?)\b/i,
    },
    {
      why: "says an engine reads our structured data",
      pattern: /(structured data|schema|json-?ld)[^.]{0,60}\b(chatgpt|perplexity|gemini)\b[^.]{0,30}\bread\b/i,
    },
    {
      why: "promises a rich result that no longer exists",
      pattern: /\b(get|gain|earn|unlock)[^.]{0,30}\brich (result|snippet)s?\b/i,
    },
  ];

  it("the doctrine still carries the FAQ verdict", () => {
    expect(DOCTRINE).toContain("The rich result **no longer exists**");
    expect(DOCTRINE).toContain("**This is the real value**");
  });

  for (const { why, pattern } of CLAIMS) {
    it.each(FILES)(`%s — ${why}`, (file) => {
      expect(visibleSource(file), `${file} matches ${pattern}`).not.toMatch(pattern);
    });
  }

  // COMMENT-STRIPPED, and that is not a detail. The first version of the
  // assertion below read the raw file, and this component's docstring quotes
  // §3 — including the phrase "Google retired FAQ rich results from Search on
  // 7 May 2026". So deleting the sentence the MERCHANT reads still passed,
  // because the comment explaining the rule satisfied the test. Found by
  // breaking it. An assertion that a string is PRESENT must read only what
  // ships, or a comment can satisfy it forever.
  const cardCopy = () => visibleSource("app/components/EmbedSetupCard.jsx");

  it("the setup card leads with the visible FAQ, not the schema", () => {
    const card = cardCopy();
    const visibleAt = card.indexOf("Show the FAQ to shoppers");
    const schemaAt = card.indexOf("Add the FAQ structured data");
    expect(visibleAt, "the visible-FAQ step is missing").toBeGreaterThan(-1);
    expect(schemaAt, "the schema step is missing").toBeGreaterThan(-1);
    expect(visibleAt, "the schema step comes before the visible-FAQ step").toBeLessThan(schemaAt);
  });

  it("the setup card tells the merchant the Google truth rather than hiding it", () => {
    // A merchant turning on FAQ schema deserves to know it will not change
    // anything in Google Search. Saying so is the honest version of the feature.
    expect(cardCopy()).toMatch(/retired FAQ rich results/i);
  });
});

describe("the GEO score describes itself honestly", () => {
  // The specific claim P1.1 found and removed: a caption under the GEO number
  // saying it "measures how ready your products are to be cited by ChatGPT,
  // Perplexity, Gemini and Google AI Overviews". calculateGeoScore() grades six
  // properties of the merchant's OWN content — answer-first opening, Q&A,
  // schema, attributes, meta, alt text. It never observes a citation, and no
  // evidence links those six inputs to being cited by any named engine.
  const start = readFileSync("app/components/StartState.jsx", "utf8");

  it("says what it scores", () => {
    expect(start).toMatch(/scores six things on your product pages/i);
  });

  it("says out loud what it cannot see", () => {
    expect(start).toMatch(/not whether you were cited/i);
  });
});
