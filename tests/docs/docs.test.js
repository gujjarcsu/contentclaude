/**
 * Phase 1 item 8 — the docs described a different application.
 *
 * `DEPLOYMENT.md` recommended Railway, described a migration flow that did not
 * exist, told you to edit `BILLING_TEST` in source before submitting to the App
 * Store, listed two scopes the app does not request, and stated there was no
 * health endpoint. Every one of those was wrong, and each would cost someone an
 * afternoon — the App Store one could cost a rejection.
 *
 * Documentation rots silently, which is exactly the kind of failure a test is
 * for. These assertions are not about prose. They pin the specific claims that
 * were wrong, and they fail when a new secret is added to the code without
 * being written down.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(f, "utf8");

describe("the documents the brief asks for exist", () => {
  for (const f of ["DEPLOYMENT.md", "docs/RUNBOOK.md", "docs/SECRETS.md", "docs/ARCHITECTURE.md"]) {
    it(`${f} exists and is not a stub`, () => {
      expect(existsSync(f)).toBe(true);
      expect(read(f).length).toBeGreaterThan(2000);
    });
  }
});

describe("DEPLOYMENT.md no longer describes an app we do not have", () => {
  const doc = read("DEPLOYMENT.md");

  it("does not recommend Railway or Render as a deployment target", () => {
    // It may name them in the history note; what must not survive is an
    // instruction to deploy there.
    expect(doc).not.toMatch(/Option 1 — Railway/);
    expect(doc).not.toMatch(/### Option \d+ — Render/);
  });

  it("does not tell anyone to edit BILLING_TEST in source before release", () => {
    expect(doc).not.toMatch(/Set `?BILLING_TEST`? = false in/i);
    expect(doc).toMatch(/no \*\*source edit\*\*|no source edit/i);
  });

  it("states the scopes the app actually requests, and only those", () => {
    const scopes = read("shopify.app.toml").match(/scopes\s*=\s*"([^"]+)"/)[1];
    expect(scopes).toBe("write_products,write_content");
    expect(doc).toContain("`write_products,write_content`");
  });

  it("does not claim there is no health endpoint", () => {
    expect(doc).not.toMatch(/no dedicated `?\/health`? endpoint/i);
    expect(doc).toContain("/api/health?deep=1");
  });

  it("names the real deploy path: push to main, not a manual command", () => {
    expect(doc).toMatch(/git push origin main/);
    expect(doc).toMatch(/connection_limit=5/);
  });

  it("carries the secrets rule that the 2026-09-09 incident produced", () => {
    expect(doc).toMatch(/fly secrets import/);
    expect(doc).toMatch(/never\*\* `fly secrets set`|never `fly secrets set`/i);
  });
});

describe("SECRETS.md is a complete inventory, and stays complete", () => {
  const doc = read("docs/SECRETS.md");

  /** Every process.env.X the shipping app reads. Scripts and harnesses are not shipped. */
  function envNamesInAppCode(dir = "app", found = new Set()) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) envNamesInAppCode(p, found);
      else if (/\.(js|jsx|ts|tsx)$/.test(entry)) {
        for (const m of read(p).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) found.add(m[1]);
      }
    }
    return found;
  }

  it("documents every environment variable the app code reads", () => {
    const platformProvided = new Set(["HOSTNAME"]); // set by the container, not by us
    const names = [...envNamesInAppCode()].filter((n) => !platformProvided.has(n));
    const undocumented = names.filter((n) => !doc.includes(n));
    expect(undocumented).toEqual([]);
  });

  it("leads with the import-from-file rule, not with a list", () => {
    expect(doc.indexOf("fly secrets import")).toBeLessThan(doc.indexOf("## Required"));
  });

  it("contains no secret values — only names", () => {
    // The shapes that would mean a real credential got pasted in.
    expect(doc).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(doc).not.toMatch(/re_[A-Za-z0-9]{10}/);
    expect(doc).not.toMatch(/postgresql:\/\/[^\s.]+:[^\s@]+@/);
  });

  it("says what happens WITHOUT each optional secret, not just what it is", () => {
    expect(doc).toMatch(/Without it/);
    expect(doc).toMatch(/operator_alert_undeliverable/);
    expect(doc).toMatch(/backup_not_configured/);
  });

  it("has rotation steps, including the one with a real window of breakage", () => {
    expect(doc).toMatch(/## Rotation/);
    expect(doc).toMatch(/webhook verification fails and OAuth fails/);
  });
});

describe("ARCHITECTURE.md describes the topology that is actually deployed", () => {
  const doc = read("docs/ARCHITECTURE.md");
  const fly = read("fly.toml");

  it("names both process groups, and they match fly.toml", () => {
    expect(fly).toMatch(/^\s*web\s*=/m);
    expect(fly).toMatch(/^\s*worker\s*=\s*"node worker\.js"/m);
    expect(doc).toMatch(/\bweb\b/);
    expect(doc).toMatch(/\bworker\b/);
  });

  it("explains why worker liveness is a Redis heartbeat and not a local check", () => {
    expect(doc).toMatch(/worker:heartbeat/);
    expect(doc).toMatch(/reporting on itself/i);
  });

  it("states the single-region limitation rather than implying two regions", () => {
    expect(doc).toMatch(/One region|one region/);
    expect(doc).toMatch(/iad/);
  });
});

describe("RUNBOOK.md answers the questions the brief lists", () => {
  const doc = read("docs/RUNBOOK.md");

  for (const [what, pattern] of [
    ["a secret is set", /Rule 0/],
    ["Neon is down", /database: "error"/],
    ["Redis is down", /redis.*degraded/i],
    ["the AI provider is down", /aiCircuitBreaker/],
    ["a deploy broke /app", /deploy broke/i],
    ["jobs are stuck", /stuckProcessing/],
    ["a merchant disputes billing", /they paid but the app shows Free/i],
    ["a GDPR webhook fails", /GDPR or compliance webhook/i],
    ["a restore is needed", /## Restoring from a backup/],
  ]) {
    it(`covers: ${what}`, () => expect(doc).toMatch(pattern));
  }

  it("the restore procedure restores to a NEW branch, never over production", () => {
    expect(doc).toMatch(/new Neon branch/i);
    expect(doc).toMatch(/never over production|not production|Production is untouched/i);
  });

  it("says the in-app health probe cannot report that the app is gone", () => {
    // The honesty that makes the external monitor a requirement rather than a nicety.
    expect(doc).toMatch(/this probe is gone too|runs inside the same infrastructure/i);
  });
});
