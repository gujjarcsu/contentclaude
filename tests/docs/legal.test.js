/**
 * P6.2 — the privacy policy cannot fall behind the database.
 *
 * A legal document that claims something the code does not do is worse than no
 * document: it is a written, dated, merchant-facing false statement, and on a
 * Shopify submission it is the kind of thing that gets an app pulled rather
 * than rejected.
 *
 * The failure mode is not someone lying. It is someone adding a column six
 * months from now — a perfectly reasonable column — and never opening this
 * page. So the inventory is asserted against `prisma/schema.prisma`: a new
 * model that is not described fails the build.
 *
 * That is the same shape as the P5.0 lesson one layer out. The locked prices
 * had a home outside the repo and no sweep enumerated it; here the policy's
 * subject matter is the schema, so the schema is what it is checked against.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DATA_INVENTORY,
  SUBPROCESSORS,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  CONTACT_EMAIL,
  LAST_UPDATED,
} from "../../app/utils/legal.js";
import { OPERATOR_EMAIL_PUBLIC } from "../../app/utils/supportContact.js";
// Shared, because writing it inline is how it gets forgotten — see the
// header of tests/helpers/code.js for the five times that happened.
import { code } from "../helpers/code.js";

const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");
const MODELS = [...SCHEMA.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);

/**
 * Models the policy deliberately does not describe, each with the reason.
 * An exemption with no reason is how this list becomes a way to avoid the rule.
 */
const EXEMPT = {
  // Shopify's own session table, described in the inventory under "Session".
  // Listed here only because Prisma splits nothing else out.
};

describe("the data inventory covers every model in the schema", () => {
  it("describes every model, or exempts it with a reason", () => {
    const described = new Set(DATA_INVENTORY.map((d) => d.model));
    const missing = MODELS.filter((m) => !described.has(m) && !(m in EXEMPT));
    expect(
      missing,
      `models in the schema that the privacy policy does not describe: ${missing.join(", ")}. ` +
        `Add them to DATA_INVENTORY in app/utils/legal.js — a policy that omits a table is a false statement, not an oversight.`,
    ).toEqual([]);
  });

  it("does not describe models that no longer exist", () => {
    // The inverse drift: a policy claiming we hold something we deleted is
    // also wrong, and it is the direction nobody checks.
    const known = new Set(MODELS);
    const ghosts = DATA_INVENTORY.filter((d) => !known.has(d.model)).map((d) => d.model);
    expect(ghosts, `described in the policy but not in the schema: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("marks the tables that can hold information about a PERSON", () => {
    const personal = DATA_INVENTORY.filter((d) => d.personal).map((d) => d.model);
    // Session can carry the installing staff member's name and email; a support
    // request carries the address a merchant asks us to reply to. Those are the
    // two, and if a third appears it should be a deliberate change to this line.
    expect(personal.sort()).toEqual(["Session", "SupportRequest"]);
  });

  it("discloses the encrypted merchant AI key, which is new", () => {
    const shopRow = DATA_INVENTORY.find((d) => d.model === "Shop");
    expect(shopRow.holds).toMatch(/key/i);
    expect(shopRow.holds).toMatch(/encrypt/i);
  });
});

describe("the policy says what actually leaves the app", () => {
  const aiSection = PRIVACY_SECTIONS.find((s) => /AI provider/i.test(s.h));

  it("names Anthropic and what is sent", () => {
    const text = aiSection.p.join(" ");
    expect(text).toMatch(/Anthropic/);
    expect(text).toMatch(/product titles/i);
    expect(text).toMatch(/alt text/i);
    expect(text).toMatch(/brand voice/i);
  });

  it("states the BYO-key rules in the same words the code enforces", () => {
    // "not the key, not a prefix, not a length" is the rule in 04-DECISIONS.md
    // and the thing byok.test.js enforces mechanically. The policy must not
    // promise less than the code does, or more.
    const text = aiSection.p.join(" ");
    expect(text).toMatch(/AES-256-GCM/);
    expect(text).toMatch(/never written to a log/i);
    expect(text).toMatch(/never sent back/i);
  });

  it("names every subprocessor with a role and a region", () => {
    expect(SUBPROCESSORS.length).toBeGreaterThanOrEqual(5);
    for (const s of SUBPROCESSORS) {
      expect(s.name, "subprocessor without a name").toBeTruthy();
      expect(s.role, `${s.name} has no stated role`).toBeTruthy();
      expect(s.region, `${s.name} has no region`).toBeTruthy();
    }
    const names = SUBPROCESSORS.map((s) => s.name);
    // These four are load-bearing: they are named in SECRETS.md as things the
    // app cannot run without, so omitting one would be a real omission.
    for (const required of ["Anthropic", "Fly.io", "Neon", "Resend"]) {
      expect(names, `${required} is not disclosed`).toContain(required);
    }
  });

  it("is honest that we cannot read customers or orders, and says WHY", () => {
    // The claim is only credible because of the scopes. Stating the scopes
    // makes it checkable by a reviewer rather than asking to be believed.
    const short = PRIVACY_SECTIONS.find((s) => /short version/i.test(s.h)).p.join(" ");
    expect(short).toMatch(/write_products/);
    expect(short).toMatch(/write_content/);
    const appToml = readFileSync("shopify.app.toml", "utf8");
    const scopes = appToml.match(/scopes\s*=\s*"([^"]*)"/)?.[1] ?? "";
    // If the app ever asks for more, this fails and the policy must be rewritten.
    expect(scopes.split(",").map((s) => s.trim()).sort()).toEqual(["write_content", "write_products"]);
  });
});

describe("the terms do not promise what nobody can deliver", () => {
  const text = TERMS_SECTIONS.flatMap((s) => s.p).join(" ");

  it("explicitly refuses to promise rankings", () => {
    expect(text).toMatch(/do not promise rankings/i);
  });

  it("states the credit rules exactly as the code charges them", async () => {
    const { CREDIT_WEIGHTS } = await import("../../app/utils/credits.js");
    const { TRIAL_DAYS, TRIAL_CREDITS } = await import("../../app/utils/billing-plans.js");
    expect(text).toMatch(new RegExp(`blog post costs ${CREDIT_WEIGHTS.blog}`, "i"));
    expect(CREDIT_WEIGHTS.altText).toBe(0);
    expect(text).toMatch(/alt text costs nothing/i);
    expect(text).toMatch(new RegExp(`${TRIAL_DAYS}-day free trial`, "i"));
    expect(text).toMatch(new RegExp(`${TRIAL_CREDITS} credits`, "i"));
  });

  it("states the BYO-key billing rule the gate actually applies", () => {
    expect(text).toMatch(/do not consume credits/i);
  });
});

describe("reachability — submission requires both, and so does honesty", () => {
  it("the public routes exist and need no authentication", () => {
    for (const f of ["app/routes/privacy.jsx", "app/routes/terms.jsx"]) {
      const src = code(readFileSync(f, "utf8"));
      expect(src).toMatch(/legalPage\(/);
      // A legal document behind a login is not reachable by the person deciding
      // whether to install, or by an App Store reviewer opening it cold.
      expect(src, `${f} authenticates — the page would be unreachable`).not.toMatch(/authenticate\./);
    }
  });

  it("the app links to both from every page", () => {
    const shell = readFileSync("app/routes/app.jsx", "utf8");
    expect(shell).toMatch(/url="\/privacy"/);
    expect(shell).toMatch(/url="\/terms"/);
    expect(shell).toMatch(/url="\/app\/support"/);
  });

  it("the support address has ONE definition", () => {
    // notify.server.js reads OPERATOR_EMAIL from the environment and falls back
    // to a literal. That fallback and the merchant-facing address must be the
    // same string, or the listing promises an inbox nothing is sent to.
    const notify = readFileSync("app/utils/notify.server.js", "utf8");
    const fallback = notify.match(/OPERATOR_EMAIL\s*=\s*process\.env\.OPERATOR_EMAIL \|\| "([^"]+)"/)?.[1];
    expect(fallback, "could not find the fallback in notify.server.js").toBeTruthy();
    expect(OPERATOR_EMAIL_PUBLIC).toBe(fallback);
    expect(CONTACT_EMAIL).toBe(fallback);
  });

  it("carries a date, because an undated policy is not a policy", () => {
    expect(LAST_UPDATED).toMatch(/\d{4}/);
  });
});
