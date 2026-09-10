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

  it("drops javascript: hrefs, and (Phase 0 item 19) removes links to other hosts entirely", () => {
    const out = extractTag(wrap('<a href="javascript:alert(1)">x</a>'), "DESCRIPTION");
    expect(out).not.toMatch(/javascript:/i);

    // An external link is the highest-value thing an injected instruction can
    // plant on a merchant storefront, so the anchor is unwrapped: the words
    // survive, the destination does not.
    const external = extractTag(wrap('<a href="https://evil.example/x">click</a>'), "DESCRIPTION");
    expect(external).not.toMatch(/<a[\s>]/);
    expect(external).not.toMatch(/evil\.example/);
    expect(external).toContain("click");

    // A relative link stays on the merchant's own storefront, so it survives.
    const internal = extractTag(wrap('<a href="/products/other">see also</a>'), "DESCRIPTION");
    expect(internal).toMatch(/href="\/products\/other"/);
    expect(internal).toMatch(/rel="noopener noreferrer nofollow"/);

    // Protocol-relative borrows the page scheme and must not survive either.
    const protoRel = extractTag(wrap('<a href="//evil.example/x">y</a>'), "DESCRIPTION");
    expect(protoRel).not.toMatch(/evil\.example/);
  });

  it("removes <script> and <iframe>", () => {
    const out = extractTag(
      wrap('<script>alert(1)</script><iframe src="x"></iframe><p>ok</p>'),
      "DESCRIPTION",
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<iframe/i);
    expect(out).toContain("<p>ok</p>");
  });
});
