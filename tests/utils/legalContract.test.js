/**
 * Phase 9 Part A — the contract says what the code does.
 *
 * A1: credits reset on the calendar month; /terms and the plans page say the
 *     same sentence from one constant, and the usage counter is keyed on the
 *     calendar month — nothing on the billing path keys it otherwise.
 * A2: /privacy states a transfer basis, generated from the processor list.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "../helpers/code.js";
import { CREDIT_RESET_SENTENCE } from "../../app/utils/credits.js";
import { TERMS_SECTIONS, PRIVACY_SECTIONS, SUBPROCESSORS, TRANSFER_SECTION } from "../../app/utils/legal.js";
import { legalPage } from "../../app/utils/legalPage.server.js";

describe("A1 — credits reset on the calendar month, said the same way in both places", () => {
  it("the sentence is the decided one", () => {
    expect(CREDIT_RESET_SENTENCE).toBe(
      "Credits reset on the first of each calendar month, whatever your billing date. Your first, partial month carries a full allowance.",
    );
  });

  it("/terms carries it, from the constant, and renders it", async () => {
    const billing = TERMS_SECTIONS.find((s) => /Plans, credits and billing/.test(s.h));
    expect(billing.p.join(" ")).toContain(CREDIT_RESET_SENTENCE);
    expect(await legalPage("terms").text()).toContain(CREDIT_RESET_SENTENCE);
    expect(code(readFileSync("app/utils/legal.js", "utf8"))).toMatch(/\$\{CREDIT_RESET_SENTENCE\}/);
  });

  it("the plans page carries it from the same constant, never a retyped copy", () => {
    const plans = code(readFileSync("app/routes/app.plans.jsx", "utf8"));
    expect(plans).toMatch(/import \{ CREDIT_WEIGHTS, CREDIT_RESET_SENTENCE \} from "\.\.\/utils\/credits\.js"/);
    expect(plans).toMatch(/a: `\$\{CREDIT_RESET_SENTENCE\}/);
    expect(plans).not.toMatch(/reset on the 1st of each/);
    expect(plans).not.toMatch(/every 30 days/);
  });

  it("the usage counter is keyed on the calendar month, and nothing on the billing path keys it on the billing period", () => {
    const plans = code(readFileSync("app/utils/plans.server.js", "utf8"));
    expect(plans).toMatch(/export async function sumMonthlyCredits\(shop, month = new Date\(\)\.toISOString\(\)\.slice\(0, 7\)/);
    expect(plans).toMatch(/usageRecord\.aggregate\(\{ where: \{ shop, month \}/);
    const walk = (dir, out = []) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(js|jsx)$/.test(name)) out.push(p);
      }
      return out;
    };
    // A usage query windowed on the subscription period would make the page a lie.
    const offenders = walk("app").filter((p) => /usageRecord\.[a-zA-Z]+\([^;]*?(currentPeriodEnd|renewsAt|trialEndsAt)/s.test(code(readFileSync(p, "utf8"))));
    expect(offenders).toEqual([]);
  });
});

describe("A2 — /privacy states a transfer basis, generated from the processor list", () => {
  it("every processor carries a basis and an https link", () => {
    for (const s of SUBPROCESSORS) {
      expect(s.basis, `${s.name} has no basis`).toBeTruthy();
      expect(s.dpaUrl, `${s.name} has no dpaUrl`).toMatch(/^https:\/\//);
    }
  });

  it("the section is in the privacy policy, after the processor table, and names every processor with its link", async () => {
    const idx = PRIVACY_SECTIONS.indexOf(TRANSFER_SECTION);
    const who = PRIVACY_SECTIONS.findIndex((s) => s.subprocessors);
    expect(idx).toBeGreaterThan(who);
    const html = await legalPage("privacy").text();
    expect(html).toContain("<h2>International transfers</h2>");
    expect(html).toMatch(/operates from Australia/);
    for (const s of SUBPROCESSORS) {
      expect(html).toContain(`<b>${s.name}</b> (${s.region})`);
      expect(html).toContain(`href="${s.dpaUrl}"`);
    }
    expect(html).toMatch(/not legal advice/);
  });

  it("is generated, not retyped: one paragraph per processor, no more", () => {
    expect(TRANSFER_SECTION.p).toHaveLength(SUBPROCESSORS.length + 2);
  });
});
