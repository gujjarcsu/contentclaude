// [Ledger #4] Allowlist sanitiser — proves the old regex-blocklist bypasses
// (<svg onload>, <math><mtext>, event handlers, javascript: URLs) are removed.
// Exercised through the public extractTag(), which routes content through
// sanitizeHtml on the way out of the AI layer.
import { describe, it, expect } from "vitest";
import { extractTag } from "../../app/utils/ai.server.js";

const wrap = (inner) => `<DESCRIPTION>${inner}</DESCRIPTION>`;

describe("sanitizeHtml — allowlist (svg/math/handler bypass)", () => {
  it("strips <svg onload=...> entirely", () => {
    const out = extractTag(wrap('<svg onload="alert(1)"><circle /></svg><p>hi</p>'), "DESCRIPTION");
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toMatch(/onload/i);
    expect(out).toContain("<p>hi</p>");
  });

  it("strips <math><mtext> MathML payloads", () => {
    const out = extractTag(wrap("<math><mtext><p>x</p></mtext></math>after"), "DESCRIPTION");
    expect(out).not.toMatch(/<math/i);
    expect(out).not.toMatch(/<mtext/i);
    expect(out).toContain("after");
  });

  it("removes inline event handlers from allowed tags", () => {
    const out = extractTag(wrap('<p onclick="steal()">text</p>'), "DESCRIPTION");
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain("text");
  });

  it("drops javascript: hrefs and forces safe rel on links", () => {
    const out = extractTag(wrap('<a href="javascript:alert(1)">x</a>'), "DESCRIPTION");
    expect(out).not.toMatch(/javascript:/i);
    const safe = extractTag(wrap('<a href="https://example.com">x</a>'), "DESCRIPTION");
    expect(safe).toMatch(/rel="noopener noreferrer nofollow"/);
  });

  it("removes <script> and <iframe>", () => {
    const out = extractTag(wrap('<script>alert(1)</script><iframe src="x"></iframe><p>ok</p>'), "DESCRIPTION");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<iframe/i);
    expect(out).toContain("<p>ok</p>");
  });
});
