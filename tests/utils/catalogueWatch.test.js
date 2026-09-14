/**
 * P2.3 — catalogue decay: the diff, the number, and the wiring.
 *
 * The subscription is "told the day it happens". These assertions are the
 * five kinds the brief names, each exercised in both directions — the thing
 * that raises it and the thing that clears it — because a finding that never
 * clears is noise, and a number made of noise gets ignored.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  KIND,
  KIND_LABEL,
  THIN_DESCRIPTION_CHARS,
  WATCH_DESC_CAP,
  snapshotFromNode,
  diffProduct,
  summarise,
  attentionSentence,
  parseAttention,
} from "../../app/utils/catalogueWatch.js";

const NOW = new Date("2026-09-14T02:00:00Z");
const YESTERDAY = new Date("2026-09-13T02:00:00Z");
const WATCH_STARTED = new Date("2026-09-01T00:00:00Z");
const ctx = (over = {}) => ({ hasContent: true, watchStartedAt: WATCH_STARTED, now: NOW, ...over });

const snap = (over = {}) => ({
  productId: "gid://shopify/Product/1",
  title: "Mug",
  handle: "mug",
  descLen: 200,
  hasType: true,
  hasAlt: true,
  createdAtShop: new Date("2026-08-01"),
  ...over,
});
const row = (over = {}) => ({ ...snap(), attention: "{}", ...over });

describe("snapshotFromNode — only what the diff needs", () => {
  it("caps the description length rather than storing the text", () => {
    const s = snapshotFromNode({ id: "gid://shopify/Product/1", description: "x".repeat(5000) });
    expect(s.descLen).toBe(WATCH_DESC_CAP);
    expect(Object.values(s).some((v) => typeof v === "string" && v.length > 100)).toBe(false);
  });

  it("treats whitespace-only type and alt as absent", () => {
    const s = snapshotFromNode({ id: "gid://shopify/Product/1", productType: "  ", featuredImage: { altText: " " } });
    expect(s.hasType).toBe(false);
    expect(s.hasAlt).toBe(false);
  });
});

describe("the five kinds — raised, and cleared", () => {
  it("description_collapsed: raised when a real description drops below thin; cleared when it recovers", () => {
    const raised = diffProduct(row({ descLen: 300 }), snap({ descLen: 10 }), ctx());
    expect(raised[KIND.DESCRIPTION_COLLAPSED]).toBe(NOW.toISOString());
    const cleared = diffProduct(row({ attention: JSON.stringify(raised) }), snap({ descLen: 300 }), ctx());
    expect(cleared[KIND.DESCRIPTION_COLLAPSED]).toBeUndefined();
  });

  it("description_collapsed is NOT raised for a product that was always thin — that is 'not yet optimized', a different number", () => {
    const att = diffProduct(row({ descLen: 10 }), snap({ descLen: 5 }), ctx());
    expect(att[KIND.DESCRIPTION_COLLAPSED]).toBeUndefined();
    expect(THIN_DESCRIPTION_CHARS).toBe(50);
  });

  it("alt_text_lost: raised on had→lost; cleared when alt returns", () => {
    const raised = diffProduct(row({ hasAlt: true }), snap({ hasAlt: false }), ctx());
    expect(raised[KIND.ALT_TEXT_LOST]).toBeTruthy();
    const cleared = diffProduct(row({ attention: JSON.stringify(raised), hasAlt: false }), snap({ hasAlt: true }), ctx());
    expect(cleared[KIND.ALT_TEXT_LOST]).toBeUndefined();
  });

  it("product_type_missing: standing — raised without history; cleared when set", () => {
    const raised = diffProduct(null, snap({ hasType: false }), ctx());
    expect(raised[KIND.PRODUCT_TYPE_MISSING]).toBeTruthy();
    const cleared = diffProduct(row({ attention: JSON.stringify(raised), hasType: false }), snap({ hasType: true }), ctx());
    expect(cleared[KIND.PRODUCT_TYPE_MISSING]).toBeUndefined();
  });

  it("handle_changed: raised on a change, re-stamped on a second change, cleared after the notice period", () => {
    const first = diffProduct(row({ handle: "mug" }), snap({ handle: "ceramic-mug" }), ctx());
    expect(first[KIND.HANDLE_CHANGED]).toBe(NOW.toISOString());
    const later = new Date(NOW.getTime() + 8 * 24 * 3600 * 1000);
    const expired = diffProduct(row({ attention: JSON.stringify(first), handle: "ceramic-mug" }), snap({ handle: "ceramic-mug" }), ctx({ now: later }));
    expect(expired[KIND.HANDLE_CHANGED]).toBeUndefined();
  });

  it("new_unoptimised: only a product created AFTER the watch began, seen for the first time, with nothing written", () => {
    const arrived = diffProduct(null, snap({ createdAtShop: new Date("2026-09-10") }), ctx({ hasContent: false }));
    expect(arrived[KIND.NEW_UNOPTIMISED]).toBeTruthy();
    // Created before the watch began: the first run must not flag the whole store.
    const old = diffProduct(null, snap({ createdAtShop: new Date("2026-07-01") }), ctx({ hasContent: false }));
    expect(old[KIND.NEW_UNOPTIMISED]).toBeUndefined();
    // Already has content: nothing to do.
    const written = diffProduct(null, snap({ createdAtShop: new Date("2026-09-10") }), ctx({ hasContent: true }));
    expect(written[KIND.NEW_UNOPTIMISED]).toBeUndefined();
  });

  it("new_unoptimised clears the moment we have content for it", () => {
    const raised = { [KIND.NEW_UNOPTIMISED]: YESTERDAY.toISOString() };
    const cleared = diffProduct(row({ attention: JSON.stringify(raised) }), snap(), ctx({ hasContent: true }));
    expect(cleared[KIND.NEW_UNOPTIMISED]).toBeUndefined();
  });

  it("a regression keeps its ORIGINAL since date across later runs — 'since yesterday' must not reset daily", () => {
    const raised = { [KIND.ALT_TEXT_LOST]: YESTERDAY.toISOString() };
    const again = diffProduct(row({ attention: JSON.stringify(raised), hasAlt: false }), snap({ hasAlt: false }), ctx());
    expect(again[KIND.ALT_TEXT_LOST]).toBe(YESTERDAY.toISOString());
  });

  it("no first sighting can regress — collapse and alt-loss need a previous snapshot", () => {
    const att = diffProduct(null, snap({ descLen: 0, hasAlt: false }), ctx());
    expect(att[KIND.DESCRIPTION_COLLAPSED]).toBeUndefined();
    expect(att[KIND.ALT_TEXT_LOST]).toBeUndefined();
  });
});

describe("every kind is graded and explained — never called broken", () => {
  it.each(Object.values(KIND))("%s has a title, a detail and a grade", (k) => {
    expect(KIND_LABEL[k]?.title).toBeTruthy();
    expect(KIND_LABEL[k]?.detail.length).toBeGreaterThan(40);
    expect(["degrading", "cosmetic"]).toContain(KIND_LABEL[k]?.grade);
  });

  it("nothing in the copy claims blocking, broken or a ranking effect", () => {
    const text = Object.values(KIND_LABEL).map((m) => `${m.title} ${m.detail}`).join(" ");
    expect(text).not.toMatch(/\bblock(ing|ed)\b|\bbroken\b|will rank|ranks? higher|disqualif/i);
  });
});

describe("the number", () => {
  const rows = [
    { attention: JSON.stringify({ [KIND.ALT_TEXT_LOST]: NOW.toISOString() }) },
    { attention: JSON.stringify({ [KIND.PRODUCT_TYPE_MISSING]: "2026-09-01T00:00:00Z" }) },
    { attention: "{}" },
    { attention: "not json" },
  ];

  it("counts products, not kinds, and 'since yesterday' by the EARLIEST kind", () => {
    const s = summarise(rows, NOW);
    expect(s.needAttention).toBe(2);
    expect(s.sinceYesterday).toBe(1);
    expect(s.byKind[KIND.ALT_TEXT_LOST]).toBe(1);
  });

  it("bad JSON is nothing, never a crash", () => {
    expect(parseAttention("not json")).toEqual({});
    expect(parseAttention(null)).toEqual({});
  });

  it("reads as one sentence, or nothing", () => {
    expect(attentionSentence({ needAttention: 3, sinceYesterday: 1 })).toBe("3 products need attention, 1 since yesterday.");
    expect(attentionSentence({ needAttention: 1, sinceYesterday: 0 })).toBe("1 product needs attention.");
    expect(attentionSentence({ needAttention: 0, sinceYesterday: 0 })).toBeNull();
  });
});

describe("wiring — the number is told, daily and on Home", () => {
  it("the pure module imports nothing server-side, so routes can render the labels", () => {
    expect(code(readFileSync("app/utils/catalogueWatch.js", "utf8"))).not.toMatch(/\.server\.js/);
  });

  it("the worker's minute tick runs the daily watch", () => {
    const sched = code(readFileSync("app/utils/scheduler.server.js", "utf8"));
    expect(sched).toMatch(/maybeRunCatalogueWatch/);
  });

  it("Home reads the summary and links to the list", () => {
    const home = code(readFileSync("app/routes/app._index.jsx", "utf8"));
    expect(home).toMatch(/attentionFor\(admin, shop\)/);
    expect(home).toMatch(/\/app\/attention/);
  });

  it("the list route exists and names its method on the page", () => {
    const route = readFileSync("app/routes/app.attention.jsx", "utf8");
    expect(route).toMatch(/Method:/);
    expect(route).toMatch(/Nothing here is a ranking claim/);
  });

  it("the daily walk is bounded and reports partial, never a partial presented as whole", () => {
    const srv = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
    expect(srv).toMatch(/WATCH_MAX_PAGES/);
    expect(srv).toMatch(/partial = true/);
  });

  it("both new tables are on the redaction list", async () => {
    const { GDPR_SHOP_MODELS } = await import("../../app/utils/gdpr.server.js");
    expect(GDPR_SHOP_MODELS).toContain("productWatch");
    expect(GDPR_SHOP_MODELS).toContain("crawlerAccess");
  });
});

describe("the first walk is not 'since yesterday'", () => {
  const first = new Date("2026-09-14T08:04:00Z");
  const later = new Date("2026-09-14T14:00:00Z");
  const stamp = (d) => JSON.stringify({ [KIND.PRODUCT_TYPE_MISSING]: d.toISOString() });

  it("everything stamped in the first walk counts as needing attention but not as new", () => {
    const rows = [{ attention: stamp(first) }, { attention: stamp(first) }];
    const s = summarise(rows, later, { firstWalkAt: first });
    expect(s.needAttention).toBe(2);
    expect(s.sinceYesterday).toBe(0);
  });

  it("a kind stamped after the first-walk grace IS new", () => {
    const rows = [{ attention: stamp(first) }, { attention: stamp(new Date(first.getTime() + 2 * 3600 * 1000)) }];
    expect(summarise(rows, later, { firstWalkAt: first }).sinceYesterday).toBe(1);
  });

  it("without a first-walk date the old rule holds", () => {
    expect(summarise([{ attention: stamp(first) }], later).sinceYesterday).toBe(1);
  });
});
