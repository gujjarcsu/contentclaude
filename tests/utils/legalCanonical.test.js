/**
 * Phase 8 Part B — the legal pages have ONE home. The app pages declare it
 * with a canonical; the marketing site's copies are redirect shells (prepared
 * in docs/navaal/_upload-legal-redirects/, uploaded by the owner).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { legalPage } from "../../app/utils/legalPage.server.js";

describe("the app legal pages carry their canonical", () => {
  it.each(["privacy", "terms"])("/%s says it is the one home", async (which) => {
    const html = await legalPage(which).text();
    expect(html).toContain(`<link rel="canonical" href="https://app.navaal.ai/${which}">`);
    expect(html).toContain('<meta name="robots" content="index, follow">');
  });
});

describe("the redirect shells prepared for the marketing site", () => {
  it.each(["privacy", "terms"])("%s.html forwards in 0 s, canonicalises to the app, and is noindex", (which) => {
    const html = readFileSync(`docs/navaal/_upload-legal-redirects/${which}.html`, "utf8");
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=https://app.navaal.ai/${which}">`);
    expect(html).toContain(`<link rel="canonical" href="https://app.navaal.ai/${which}">`);
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).toContain(`href="https://app.navaal.ai/${which}"`);
  });

  it("the .htaccess snippet is two 301 rules that also catch the .html and trailing-slash forms", () => {
    const s = readFileSync("docs/navaal/_upload-legal-redirects/htaccess-snippet.txt", "utf8");
    expect(s).toContain("RewriteRule ^privacy(\\.html)?/?$ https://app.navaal.ai/privacy [R=301,L]");
    expect(s).toContain("RewriteRule ^terms(\\.html)?/?$ https://app.navaal.ai/terms [R=301,L]");
    expect(s.split("\n").filter((l) => l.startsWith("RewriteRule"))).toHaveLength(2);
  });
});
