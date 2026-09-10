/**
 * Phase 5 item 6 — the install channels, and the two ways this could rot.
 *
 * `/go?ref=` was built in Phase 0 and nothing linked to it, so every install
 * arrived as `unknown`. The fix is a list of handles and the snippets that
 * carry them, which introduces exactly two failure modes worth testing:
 *
 *   1. the docs and the code drift, and somebody pastes a link for a handle
 *      the app does not recognise
 *   2. a handle is minted that `sanitizeRef` rejects, so the link silently
 *      loses its attribution and the funnel reads as `unknown` forever
 *
 * Both are silent. Neither shows up as an error anywhere.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const {
  INSTALL_CHANNELS,
  CHANNEL_HANDLES,
  CHANNEL_OWNERS,
  REF_SOURCE_PREFIX,
  installUrlFor,
  sourceForChannel,
  describeSource,
  snippetFor,
} = await import("../../app/utils/installChannels.js");
const { sanitizeRef } = await import("../../app/utils/installTracking.server.js");

const DOCS = readFileSync("docs/INSTALL-CHANNELS.md", "utf8");

describe("every handle survives the sanitiser it will be fed to", () => {
  // If sanitizeRef rejects a handle, /go drops it, no cookie is set, no ref is
  // appended, and the install is recorded as unknown. The link still works, so
  // nothing looks broken — the attribution simply never arrives.
  it.each(CHANNEL_HANDLES)("%s is accepted by sanitizeRef", (handle) => {
    expect(sanitizeRef(handle)).toBe(handle);
  });

  it("no handle is empty, uppercase, spaced or over-long", () => {
    for (const h of CHANNEL_HANDLES) {
      expect(h, h).toMatch(/^[a-z0-9][a-z0-9-]{1,40}$/);
    }
  });

  it("handles are unique", () => {
    expect(new Set(CHANNEL_HANDLES).size).toBe(CHANNEL_HANDLES.length);
  });

  it("every channel names a real owner and a specific place", () => {
    const owners = new Set(Object.values(CHANNEL_OWNERS));
    for (const c of INSTALL_CHANNELS) {
      expect(owners.has(c.owner), `${c.handle} has an unknown owner`).toBe(true);
      // "somewhere on the site" is not a placement anybody can act on.
      expect(c.where.length, `${c.handle} 'where' is too vague`).toBeGreaterThan(20);
      expect(c.copy.length, `${c.handle} has no link text`).toBeGreaterThan(3);
    }
  });
});

describe("the docs and the code cannot drift", () => {
  it("every handle in the code appears in the docs", () => {
    for (const h of CHANNEL_HANDLES) {
      expect(DOCS, `docs/INSTALL-CHANNELS.md is missing ${h}`).toContain(h);
    }
  });

  it("every ref= link in the docs is a handle the code knows", () => {
    const inDocs = [...DOCS.matchAll(/go\?ref=([a-zA-Z0-9_.:-]+)/g)].map((m) => m[1]);
    expect(inDocs.length, "no snippets found in the docs").toBeGreaterThan(5);
    for (const h of inDocs) {
      if (h === "HANDLE") continue; // the shape example
      expect(CHANNEL_HANDLES, `docs link to unregistered handle "${h}"`).toContain(h);
    }
  });

  it("every channel has a paste-ready snippet in the docs", () => {
    for (const c of INSTALL_CHANNELS) {
      expect(DOCS, `no snippet for ${c.handle}`).toContain(`go?ref=${c.handle}`);
    }
  });
});

describe("the snippet", () => {
  it("points at /go, never straight at the App Store", () => {
    // A direct listing link is an install we cannot attribute at all.
    for (const h of CHANNEL_HANDLES) {
      expect(snippetFor(h)).toContain(`https://app.navaal.ai/go?ref=${h}`);
      expect(snippetFor(h)).not.toContain("apps.shopify.com");
    }
  });

  it("carries rel=noopener and does NOT force a new tab", () => {
    const s = snippetFor("navaal-home");
    expect(s).toContain('rel="noopener"');
    expect(s).not.toContain("target=");
  });

  it("returns null for a handle that does not exist", () => {
    expect(snippetFor("not-a-channel")).toBeNull();
  });

  it("the docs snippets have no per-recipient token in them", () => {
    // A per-recipient ref would make the install record personal data, which
    // shop/redact would then have to delete — destroying the attribution.
    expect(DOCS).not.toMatch(/ref=[a-z-]*\{\{|ref=[a-z-]*%%|ref=[a-z-]*\$\{/);
  });
});

describe("describeSource", () => {
  it("names a registered channel and who owns it", () => {
    expect(describeSource("ref:navaal-home")).toBe("navaal-home (navaal.ai)");
    expect(describeSource("ref:bilby-report")).toBe("bilby-report (Bilby)");
  });

  it("shows an unregistered ref as itself rather than hiding it", () => {
    // It is either a link nobody told us about or a typo losing installs.
    expect(describeSource("ref:mystery")).toBe("mystery (unregistered ref)");
  });

  it("reads App Store surfaces and utm sources plainly", () => {
    expect(describeSource("app_store:search")).toBe("App Store — search");
    expect(describeSource("utm:newsletter")).toBe("utm newsletter");
  });

  it("explains pre_tracking rather than printing a key", () => {
    expect(describeSource("pre_tracking")).toBe("installed before tracking shipped");
  });

  it("never returns an empty label", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(describeSource(v)).toBe("unknown");
    }
  });
});

describe("the source value written on install", () => {
  it("is ref:<handle>, matching what installTracking records", () => {
    expect(sourceForChannel("navaal-home")).toBe("ref:navaal-home");
    expect(REF_SOURCE_PREFIX).toBe("ref:");
  });

  it("round-trips through describeSource", () => {
    for (const h of CHANNEL_HANDLES) {
      expect(describeSource(sourceForChannel(h))).toContain(h);
    }
  });

  it("installUrlFor is the link that gets pasted", () => {
    expect(installUrlFor("blog-post")).toBe("https://app.navaal.ai/go?ref=blog-post");
  });
});

describe("this module stays importable by anything", () => {
  it("has no server imports — the digest, docs test and any UI read one list", () => {
    const src = readFileSync("app/utils/installChannels.js", "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*\.server(\.js)?["']/);
    expect(src).not.toMatch(/from\s+["'][^"']*db\.server/);
  });
});
