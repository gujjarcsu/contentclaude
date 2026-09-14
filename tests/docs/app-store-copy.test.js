/**
 * P0.8 — every in-app string, against the App Store rules that get apps pulled.
 *
 * These are not style preferences. 4.3.3/4.3.4 ban statistics and superlatives
 * ("verifiable and unverifiable" — being able to prove it is not a defence),
 * 4.3.6/4.3.7 ban testimonials, and 08-ECONOMICS.md guardrail 6 bans two
 * specific words the app was shipping: "SLA support" and "Dedicated account
 * manager". The SERVICE stays — the owner really does answer personally — but
 * "SLA" means a contractual guarantee with remedies, and at low review volume
 * one unmet promise halves the rating.
 *
 * A one-time cleanup would come back. This is what makes it stay gone.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * User-visible source, with comments removed.
 *
 * Comments matter: the fix for this very rule leaves behind a comment SAYING
 * "SLA", explaining why it is gone. A scanner that cannot tell a banned string
 * from an explanation of why it is banned would fail on its own fix, and the
 * next person would delete the explanation to make the build pass.
 */
function visibleSource(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/^[ \t]*\/\/.*$/gm, " ") // whole-line comments
    .replace(/([^:])\/\/[^"'`\n]*$/gm, "$1"); // trailing comments, sparing URLs
}

function sourceFiles() {
  const out = [];
  for (const dir of ["app/routes", "app/components"]) {
    for (const f of readdirSync(dir)) {
      if (/\.jsx$/.test(f)) out.push(join(dir, f));
    }
  }
  return out;
}

const FILES = sourceFiles();

describe("App Store rules 4.3.3 / 4.3.4 — no superlatives or unprovable claims", () => {
  // "Verifiable and unverifiable" — being able to prove it is not a defence.
  const BANNED = [
    /\bthe #1\b/i,
    /\bnumber one (app|choice|seo)\b/i,
    /\bthe best (app|seo|tool)\b/i,
    /\bworld'?s (best|leading)\b/i,
    /\bthe only app\b/i,
    /\brank (?:#1|first|number one)\b/i,
    /\bguaranteed? (?:rankings?|traffic|sales|results)\b/i,
    /\b\d+x (?:more|faster|better)\b/i,
    /\b\d+ ?% (?:more|increase|higher|better) (?:traffic|sales|revenue)\b/i,
  ];

  it.each(FILES)("%s makes no superlative or statistical claim", (file) => {
    const src = visibleSource(file);
    for (const pattern of BANNED) {
      expect(src, `${file} matches ${pattern}`).not.toMatch(pattern);
    }
  });
});

describe("08-ECONOMICS.md guardrail 6 — the two undefined words stay gone", () => {
  // The service stays; these two words go. Replacements are fixed in
  // 12-OFFER.md §6 and must not drift back.
  it.each(FILES)("%s promises no SLA and no account manager", (file) => {
    const src = visibleSource(file);
    expect(src, `${file} still says "dedicated account manager"`).not.toMatch(/dedicated account manager/i);
    expect(src, `${file} still says "SLA"`).not.toMatch(/\bSLA\b/);
  });

  it("the plans page says what 12-OFFER.md §6 says instead", () => {
    // A negative assertion alone would pass if somebody deleted the offer
    // entirely. The offer is real and must still be stated.
    const plans = readFileSync("app/routes/app.plans.jsx", "utf8");
    expect(plans).toContain("Direct access to the founder");
    expect(plans).toContain("Every question answered within one business day");
  });
});

describe("App Store rules 4.3.6 / 4.3.7 — no testimonials", () => {
  it.each(FILES)("%s quotes no merchant", (file) => {
    const src = visibleSource(file);
    expect(src, `${file} looks like it carries a testimonial`).not.toMatch(/\btestimonial\b/i);
    // A quoted sentence attributed to a named person or role, e.g.
    //   "This app doubled our traffic" — Sarah, Owner
    //
    // Confined to ONE line on purpose. The first version allowed the quoted run
    // to cross newlines, so it matched a quote at the end of one line, several
    // lines of JSX, and an em dash inside a <Select> option label — flagging a
    // dropdown as a testimonial. A scanner that cries wolf gets switched off.
    expect(src).not.toMatch(/["“][^"”\n]{25,}["”]\s*[—–]\s*[A-Z][a-z]+\b/);
  });
});

describe("wording retired by earlier decisions", () => {
  it.each(FILES)("%s does not market llms.txt or instant indexing", (file) => {
    const src = visibleSource(file);
    // The FEATURE is fine and still shipped — the route serves it. What is
    // banned is selling it by those names, which is why this checks rendered
    // copy rather than route filenames or log messages.
    const rendered = [...src.matchAll(/>([^<>{}]{4,})</g)].map((m) => m[1]).join(" ");
    expect(rendered, `${file} renders "instant indexing"`).not.toMatch(/instant index/i);
  });
});
