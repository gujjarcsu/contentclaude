/**
 * Phase 12 Part B — one privacy policy, two parts, one generator.
 *
 * CW found navaal.ai/privacy was a two-part policy (the website and the free
 * Bilby scan, then the app) and app.navaal.ai/privacy covered only the app; a
 * redirect would have deleted the website's only policy. Held here: Part 1
 * is constants with the same build-time guard as Part 2 (a processor without
 * a transfer basis fails), the owner's sentences are present verbatim, the
 * generated page carries both parts with a table of contents, the terms page
 * is untouched, and the redirect instructions say terms-now, privacy-after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SITE_SUBPROCESSORS, SITE_PRIVACY_SECTIONS, SITE_TRANSFER_SECTION, PRIVACY_INTRO, PRIVACY_SECTIONS, TERMS_SECTIONS, CONTACT_EMAIL, LAST_UPDATED, legalText } from "../../app/utils/legal.js";
import { legalPage } from "../../app/utils/legalPage.server.js";

describe("Part 1 as constants, with the app's own guard", () => {
  it("every website processor carries a role, a region, a basis and an https link — the build fails otherwise", () => {
    expect(SITE_SUBPROCESSORS.length).toBeGreaterThanOrEqual(4);
    for (const s of SITE_SUBPROCESSORS) {
      expect(s.name).toBeTruthy();
      expect(s.role, `${s.name} has no role`).toBeTruthy();
      expect(s.region, `${s.name} has no region`).toBeTruthy();
      expect(s.basis, `${s.name} has no transfer basis`).toBeTruthy();
      expect(s.dpaUrl, `${s.name} has no dpaUrl`).toMatch(/^https:\/\//);
    }
    for (const required of ["Cloudflare", "Stripe", "Resend", "Fly.io"]) expect(SITE_SUBPROCESSORS.map((s) => s.name)).toContain(required);
    expect(SITE_TRANSFER_SECTION.p).toHaveLength(SITE_SUBPROCESSORS.length + 2); // generated, not retyped
    expect(SITE_PRIVACY_SECTIONS[SITE_PRIVACY_SECTIONS.length - 1]).toBe(SITE_TRANSFER_SECTION);
  });

  it("the owner's sentences are present, not paraphrased", () => {
    const text = SITE_PRIVACY_SECTIONS.flatMap((s) => s.p).map((p) => legalText(p)).join(" "); // D1: keys with placeholders, rendered
    for (const sentence of [
      "The only measurement on this site is a small script we wrote ourselves, which sends a few facts about each page view to our own server.",
      "There is no cookie: the script keeps a random session id and any utm_ tags in your browser's session storage, which your browser discards when the tab closes.",
      "We do not look your address up with any geolocation service, and we do not store your IP address with your page views.",
      "A device class (phone, tablet or desktop) worked out from your browser's user-agent string; the string itself is not kept.",
      "These records are kept for thirteen months so we can compare a month with the same month a year earlier, then deleted automatically.",
      "Reports are the product — they are not deleted on a schedule — but you can ask us to delete any scan of a store you own at any time.",
      "It describes a store, not a person, and it is not sold, shared or enriched from any outside data broker.",
      "EU stores are never cold-emailed",
      "sends at most one note and one follow-up, and honours a permanent one-click unsubscribe",
    ]) {
      expect(text, sentence).toContain(sentence);
    }
    expect(SITE_PRIVACY_SECTIONS.map((s) => s.h)).toEqual([
      "No third-party trackers",
      "What the beacon records",
      "What a free scan keeps",
      "How we join this up",
      "Whether we will email a store",
      "Your choices",
      "Who processes it for the website, and where",
    ]);
    // the one substitution: the address that answers
    expect(text).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(text).not.toContain("support@navaal.ai");
  });

  it("the intro says there are two parts, and the change is dated", () => {
    expect(PRIVACY_INTRO.map((p) => legalText(p)).join(" ")).toMatch(/This policy has two parts\. <b>Part 1<\/b> covers the navaal\.ai website and the free Bilby store scan/);
    expect(LAST_UPDATED).toBe("15 September 2026");
    const changes = PRIVACY_SECTIONS.find((s) => s.h === "Changes").p.join(" ");
    expect(changes).toMatch(/15 September 2026: the website's Part 1/);
  });
});

describe("the generated page", () => {
  it("/privacy carries both parts, in order, with a table of contents that links every section", async () => {
    const html = await legalPage("privacy").text();
    expect(html).toMatch(/<h2 class="part" id="part-1">Part 1 — The website and the free Bilby scan<\/h2>/);
    expect(html).toMatch(/<h2 class="part" id="part-2">Part 2 — The Navaal: AI SEO, AEO &amp; GEO app<\/h2>/);
    expect(html.indexOf('id="part-1"')).toBeLessThan(html.indexOf('id="part-2"'));
    expect(html).toMatch(/<nav class="toc" aria-label="Contents">/);
    for (const s of SITE_PRIVACY_SECTIONS) {
      expect(html).toContain(`<a href="#p1-`);
      expect(html).toContain(`>${s.h.replace(/&/g, "&amp;")}</a>`);
    }
    for (const s of PRIVACY_SECTIONS) expect(html).toContain(`>${s.h.replace(/&/g, "&amp;")}</a>`);
    expect(html).toContain("The only measurement on this site is a small script we wrote ourselves");
    for (const s of SITE_SUBPROCESSORS) expect(html).toContain(`href="${s.dpaUrl}"`);
    expect(html.indexOf("The only measurement on this site")).toBeLessThan(html.indexOf("write_products")); // Part 1 before Part 2
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/app\.navaal\.ai\/privacy">/);
  });

  it("/terms is the app's alone and unchanged in shape", async () => {
    const html = await legalPage("terms").text();
    expect(html).not.toMatch(/id="part-1"|class="toc"/);
    for (const s of TERMS_SECTIONS) expect(html).toContain(`<h2 id="${s.h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}">`);
  });
});

describe("the redirect instructions", () => {
  it("say terms now, privacy only after the sha that ships both parts", () => {
    const doc = readFileSync("docs/navaal/_UPLOAD-LEGAL-REDIRECTS.md", "utf8");
    expect(doc).toMatch(/TWO STEPS/);
    expect(doc).toMatch(/upload now\./);
    expect(doc).toMatch(/ONLY once `app\.navaal\.ai\/privacy` carries both parts/);
    expect(doc).toMatch(/the sha that ships that is `[0-9a-f]{7}`/);
    expect(doc).toMatch(/id="part-1"/);
  });
});
