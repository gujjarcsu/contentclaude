/**
 * P7 C1 — the review ask, pinned to the five rules it must never drift from.
 *
 * The Phase 7 brief said "the mechanism does not exist yet". It does —
 * `reviewAsk.server.js` has been the one code path since Phase 3 item 3.3 — so
 * C1 became an audit rather than a build. These assertions are the audit made
 * permanent. Each is one of the brief's rules, and each is asserted against
 * the thing that would break it, not against a constant that describes it:
 *
 *   1. once per shop            → `success` is TERMINAL in holdFor and in decide
 *   2. only after a real success → the two call sites are inside publish ACTIONS,
 *                                  gated on `published > 0`, and never a loader
 *   3. never on time elapsed    → no trigger string relates to time; install age
 *                                  only ever DELAYS an ask
 *   4. never rewarded           → a source grep across every route and component
 *                                  for the words that would make it a reward,
 *                                  because rewarding a review is a named Built
 *                                  for Shopify rejection reason
 *   5. dismissible forever      → a displayed modal the merchant closes comes
 *                                  back as `success`, which is terminal
 *
 * Whether it has ever FIRED in production is a separate question, answered by
 * the Support and GDPR check workflow (`reviewAsk.attempts`), because a
 * mechanism that meets every rule on paper and has never run is
 * indistinguishable from one that does not exist.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  holdFor,
  decideReviewAsk,
  REVIEW_ASK_POLICY,
  REVIEW_ASK_SURFACES,
  APPROVES_BEFORE_ASK,
  TERMINAL_CODES,
} from "../../app/utils/reviewAsk.server.js";

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
  );

const SERVER = code(readFileSync("app/utils/reviewAsk.server.js", "utf8"));
const REVIEW = code(readFileSync("app/routes/app.review.jsx", "utf8"));
const PRODUCT = code(readFileSync("app/routes/app.products_.$id.jsx", "utf8"));

describe("1. once per shop — a displayed modal is terminal", () => {
  it("`success` ends asking for good", () => {
    const h = holdFor("success");
    expect(h.terminal).toBe(true);
    expect(h.shown).toBe(true);
    expect(TERMINAL_CODES.has("success")).toBe(true);
  });

  it("a shop with reviewDoneAt is never eligible again, whatever else is true", () => {
    const shopRow = { reviewDoneAt: new Date("2026-01-01"), reviewAskCount: 0, reviewNextEligibleAt: null };
    expect(decideReviewAsk(shopRow, null).eligible).toBe(false);
  });

  it("the policy is once-DISPLAYED, and the alternative is the stricter one", () => {
    // "once_displayed": at most one modal a merchant ever SEES; a call that
    // displayed nothing (mobile-app, cancelled, recently-installed) gets one
    // later chance after a hold. The only other value the code accepts is
    // stricter, not looser. This pins that the knob cannot be turned the wrong
    // way without changing this line deliberately.
    expect(["once_displayed", "strict_once"]).toContain(REVIEW_ASK_POLICY);
  });

  it("even non-display outcomes are capped, so it cannot nag forever", () => {
    const shopRow = { reviewDoneAt: null, reviewAskCount: 99, reviewNextEligibleAt: null };
    const d = decideReviewAsk(shopRow, null);
    expect(d.eligible).toBe(false);
    expect(d.reason).toBe("call_cap");
  });
});

describe("2. only after a real success the merchant has seen", () => {
  it("is opened from exactly the two surfaces where a merchant confirms a publish", () => {
    expect(REVIEW_ASK_SURFACES.sort()).toEqual(["product_page", "review_page"]);
  });

  it("the Review page opens it only when something was actually published", () => {
    // `published > 0 ? await openReviewAsk(...) : null` — a publish that wrote
    // nothing is not a success, and the Review screen shows current copy beside
    // proposed, so a publish from it is a before/after the merchant has seen.
    expect(REVIEW).toMatch(/published > 0\s*\?\s*await openReviewAsk\(/);
  });

  it("the product page opens it inside the publish branch, never after an auto-publish", () => {
    expect(PRODUCT).toMatch(/openReviewAsk\(\{\s*shop,\s*surface: "product_page"/);
    // The call sits in the ACTION. A loader has no action result, so the
    // component receives no attemptId and cannot fire — "never on page load"
    // is structural, and this asserts the structure has not moved.
    // Any declaration form — `const`, `function`, `async function` — because
    // the first draft looked for `export const loader`, found -1, and the
    // "no loader opens an ask" check below passed VACUOUSLY. A guard that
    // cannot find what it guards is a green light, not a guard.
    const DECL = (name) => new RegExp(`export (?:const|async function|function) ${name}\\b`);
    const loaderStart = PRODUCT.search(DECL("loader"));
    const actionStart = PRODUCT.search(DECL("action"));
    const callAt = PRODUCT.indexOf("openReviewAsk({");
    expect(loaderStart, "loader not found — the guard would be vacuous").toBeGreaterThan(-1);
    expect(actionStart, "action not found — the guard would be vacuous").toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    // The call must sit inside the action's span and outside the loader's.
    const spanOf = (start) => {
      const next = PRODUCT.slice(start + 1).search(/\nexport /);
      return [start, next === -1 ? PRODUCT.length : start + 1 + next];
    };
    const [aFrom, aTo] = spanOf(actionStart);
    const [lFrom, lTo] = spanOf(loaderStart);
    expect(callAt >= aFrom && callAt < aTo, "openReviewAsk is not inside the action").toBe(true);
    expect(callAt >= lFrom && callAt < lTo, "openReviewAsk is inside the loader").toBe(false);
  });

  it("requires three approved products, counted from the shared definition", () => {
    expect(APPROVES_BEFORE_ASK).toBe(3);
    expect(SERVER).toMatch(/getContentMetrics/);
  });

  it("no loader anywhere opens a review ask", () => {
    // Every file that imports openReviewAsk: the import must be used in an
    // action, and the string must not appear between `export const loader` and
    // the next `export`.
    const importers = walk("app").filter((f) => /\.jsx?$/.test(f) && readFileSync(f, "utf8").includes("openReviewAsk("));
    expect(importers.length).toBeGreaterThanOrEqual(2);
    for (const f of importers) {
      if (f.endsWith("reviewAsk.server.js")) continue;
      const src = code(readFileSync(f, "utf8"));
      const m = src.match(/export (?:const|async function|function) loader\b[\s\S]*?(?=\nexport )/);
      // A file that imports openReviewAsk and has NO loader is fine; a file
      // whose loader exists but is not matched would make this vacuous, so
      // that case is asserted rather than silently passed.
      if (/export (?:const|async function|function) loader\b/.test(src)) {
        expect(m, `${f}: loader present but not matched — the guard would be vacuous`).not.toBeNull();
      }
      const loaderBody = m?.[0] ?? "";
      expect(loaderBody, `${f} opens a review ask from its LOADER`).not.toMatch(/openReviewAsk\(/);
    }
  });
});

describe("3. never on time elapsed", () => {
  it("install age only ever DELAYS an ask — it is never a trigger", () => {
    // `recently-installed` pushes nextEligibleAt out; nothing in decide() makes
    // a shop eligible BECAUSE time has passed.
    const now = new Date("2026-09-14T00:00:00Z");
    const h = holdFor("recently-installed", { installAt: new Date("2026-09-13T23:00:00Z"), now });
    expect(h.terminal).toBe(false);
    expect(h.nextEligibleAt.getTime()).toBeGreaterThan(now.getTime());
    expect(SERVER).not.toMatch(/trigger:\s*["']time|["']elapsed|daysSinceInstall/);
  });

  it("no scheduled job or cron opens one", () => {
    const schedulers = walk("app").filter((f) => /scheduler|cron|digest/i.test(f));
    for (const f of schedulers) {
      expect(readFileSync(f, "utf8"), `${f} references the review ask`).not.toMatch(/openReviewAsk|reviews\.request/);
    }
  });
});

describe("4. never rewarded — a named Built for Shopify rejection reason", () => {
  it("no route or component pairs a review with an incentive", () => {
    // The words that would make an ask a reward. Comments stripped, so a file
    // may explain this rule without tripping it.
    const files = walk("app").filter((f) => /\.jsx?$/.test(f));
    const offenders = [];
    for (const f of files) {
      const src = code(readFileSync(f, "utf8"));
      if (!/review/i.test(src)) continue;
      if (/(review)[^\n]{0,120}(reward|in exchange|free credits?|discount|bonus|gift)/i.test(src)) offenders.push(f);
      if (/(reward|in exchange|free credits?|discount|bonus|gift)[^\n]{0,120}(review)/i.test(src)) offenders.push(f);
    }
    expect([...new Set(offenders)], "review paired with an incentive").toEqual([]);
  });

  it("the client renders nothing of its own — Shopify's modal is the only UI", () => {
    const comp = code(readFileSync("app/components/ReviewRequest.jsx", "utf8"));
    expect(comp).toMatch(/return null;/);
    expect(comp).toMatch(/reviews\.request\(\)/);
  });
});

describe("5. dismissible forever", () => {
  it("a modal the merchant saw and closed comes back `success`, and success is terminal", () => {
    // Shopify's Reviews API resolves success:true when the modal was DISPLAYED,
    // whether or not a review was left. So closing it is the end of asking.
    expect(holdFor("success").terminal).toBe(true);
  });

  it("nothing re-opens a terminal shop — not a new publish, not a new surface", () => {
    const shopRow = { reviewDoneAt: new Date(), reviewAskCount: 1, reviewNextEligibleAt: null };
    expect(decideReviewAsk(shopRow, null, new Date("2030-01-01")).eligible).toBe(false);
  });
});
