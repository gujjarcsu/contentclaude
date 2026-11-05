import { describe, it, expect } from "vitest";
import { htmlBlocks, faqPairs } from "../../app/utils/htmlBlocks.js";

describe("htmlBlocks — a description's HTML as words", () => {
  it("keeps paragraphs, headings and list items apart, with entities decoded", () => {
    expect(htmlBlocks("<p>A basin <strong>mixer</strong> &amp; tap.</p><h3>Specs</h3><ul><li>WELS 5 star</li><li>35 mm</li></ul>Tail<br>Line")).toEqual([
      { kind: "paragraph", text: "A basin mixer & tap." },
      { kind: "heading", text: "Specs" },
      { kind: "item", text: "WELS 5 star" },
      { kind: "item", text: "35 mm" },
      { kind: "paragraph", text: "Tail" },
      { kind: "paragraph", text: "Line" },
    ]);
  });

  it("never carries markup, and drops script and style bodies", () => {
    const blocks = htmlBlocks('<p onclick="x()">Hi<script>alert(1)</script><style>p{}</style></p><img src=x onerror=alert(1)>');
    expect(blocks).toEqual([{ kind: "paragraph", text: "Hi" }]);
    expect(JSON.stringify(blocks)).not.toMatch(/[<>]/);
  });

  it("is empty for nothing", () => {
    expect(htmlBlocks("")).toEqual([]);
    expect(htmlBlocks(null)).toEqual([]);
    expect(htmlBlocks("<p> </p>")).toEqual([]);
  });
});

describe("faqPairs — the FAQ draft as questions and answers", () => {
  it("reads the generator's Q:/A: format, on separate lines", () => {
    expect(faqPairs("Q: Does it fit?\nA: Yes.\n\nQ: Warranty?\nA: 15 years.")).toEqual([
      { q: "Does it fit?", a: "Yes." },
      { q: "Warranty?", a: "15 years." },
    ]);
  });

  it("reads it after toPlainText has folded the newlines into spaces", () => {
    expect(faqPairs("Q: Does it fit? A: Yes, standard. Q: Warranty? A: 15 years.")).toEqual([
      { q: "Does it fit?", a: "Yes, standard." },
      { q: "Warranty?", a: "15 years." },
    ]);
  });

  it("keeps text that does not follow the pattern rather than hiding it", () => {
    expect(faqPairs("Just a sentence.")).toEqual([{ q: "", a: "Just a sentence." }]);
  });
});
