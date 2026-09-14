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

describe("12-OFFER.md §5.5 — the two over-claims that were live in front of real merchants", () => {
  // Both were on the public listing AND inside the app on 2026-09-14.
  //
  // This exists because of P0.8's lesson, which was not "clean the listing" but
  // "a phrase lives on more than one surface". The listing was cleaned of
  // "Dedicated account manager" and "SLA support" on 2026-09-10, and both were
  // still shipping on the Pro plan card four days later. Same shape here.
  const OFFER = readFileSync("docs/navaal/12-OFFER.md", "utf8");

  const BANS = [
    {
      phrase: "Priority support",
      // Same undefined-promise class as "SLA support", which §6 bans by name:
      // no defined priority, no queue, no response commitment behind it.
      pattern: /\bpriority support\b/i,
      replacement: "Email support from the founder",
    },
    {
      phrase: "A/B testing",
      // The feature is real and gated at Growth+, but it generates two candidate
      // texts for the merchant to choose between. No traffic split, no winner
      // measured. "A/B testing" names a measurement we do not perform, and an
      // SEO buyer is exactly the person who checks.
      pattern: /\bA\/B\b/i,
      replacement: "Two description options to compare",
    },
  ];

  it.each(BANS)("12-OFFER.md §5.5 still carries the rule for $phrase", ({ phrase, replacement }) => {
    // Drift guard, same as the doctrine test: without it someone edits §5.5,
    // these keep passing against a rule that no longer exists, and the guard
    // silently guards nothing.
    expect(OFFER, `12-OFFER.md no longer bans "${phrase}"`).toContain(phrase);
    expect(OFFER, `12-OFFER.md no longer prescribes "${replacement}"`).toContain(replacement);
  });

  for (const { phrase, pattern } of BANS) {
    it.each(FILES)(`%s no longer says "${phrase}"`, (file) => {
      expect(visibleSource(file), `${file} matches ${pattern}`).not.toMatch(pattern);
    });
  }

  it("the plans page says the approved replacements instead", () => {
    // A negative assertion alone passes if someone deletes the feature line
    // entirely. Both features are real and must still be described.
    const plans = visibleSource("app/routes/app.plans.jsx");
    for (const { replacement } of BANS) {
      expect(plans, `the plans page no longer offers "${replacement}"`).toContain(replacement);
    }
  });

  /**
   * §5.5 states "Plan-feature lines are maxlength 40". The in-app card has no
   * such limit, but the same wording goes on the listing, and a line that
   * cannot be pasted there is a line guaranteed to drift apart from the app —
   * which is the exact failure §5.5 exists to stop.
   *
   * ONE KNOWN CONFLICT, and it is between two sections of 12-OFFER.md itself:
   * §6 prescribes "Every question answered within one business day", which is
   * 47 characters. Both are approved copy, and the §6 assertion above requires
   * that line to be present. I am not rewriting approved wording to make my own
   * test pass, so it is listed here by name and routed to the owner instead.
   * Anything NEW that overruns still fails.
   */
  const KNOWN_OVER_40 = ["Every question answered within one business day"];

  it("every plan feature line fits the 40-character listing field", () => {
    const plans = visibleSource("app/routes/app.plans.jsx");
    const tooLong = [];
    for (const block of plans.matchAll(/features:\s*\[([\s\S]*?)\]/g)) {
      for (const q of block[1].matchAll(/"([^"]+)"|`([^`]+)`/g)) {
        // Template holes are a number at runtime; measure them as three digits.
        const line = (q[1] || q[2]).replace(/\$\{[^}]+\}/g, "NNN");
        if (line.length > 40 && !KNOWN_OVER_40.includes(line)) {
          tooLong.push(`${line.length}: ${line}`);
        }
      }
    }
    expect(tooLong, `plan feature lines over 40 chars:\n${tooLong.join("\n")}`).toEqual([]);
  });

  it("the known conflict is still exactly one line, and still the one named", () => {
    // If §6's wording is shortened, this fails and the exception gets deleted
    // rather than quietly outliving the problem it documents.
    const plans = visibleSource("app/routes/app.plans.jsx");
    const present = KNOWN_OVER_40.filter((l) => plans.includes(l));
    expect(present, "the documented over-length line is gone — delete KNOWN_OVER_40").toEqual(KNOWN_OVER_40);
  });
});
