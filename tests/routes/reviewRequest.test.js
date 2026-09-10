/**
 * Phase 3 item 3.3 — the App Store review ask, one code path.
 *
 * There were two designs in the tree. The LIVE one stamped
 * `GrowthState.reviewRequestedAt` from a client component that decided for
 * itself whether to ask, using loader data — which is how the jobs page ended
 * up asking for a review on page open, having pressed nothing. The other,
 * `reviewAsk.server.js`, was complete and dead: nothing called it.
 *
 * The dead one won, because its design makes the compliance property structural
 * rather than remembered. The server opens an attempt inside the publish action
 * the merchant confirmed and returns an `attemptId`; the client can only call
 * `shopify.reviews.request()` when it is handed one. A page load has no action
 * result, so it has no attemptId, so it cannot ask. "Never on load" is not a
 * rule anybody has to keep — there is no code path for it.
 *
 * These tests cover the callback route and the structural guarantees. The
 * eligibility ladder, the holds and the optimistic claim are in
 * tests/utils/growthFoundation.test.js.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { authenticate, recordReviewOutcome } = vi.hoisted(() => ({
  authenticate: { admin: vi.fn() },
  recordReviewOutcome: vi.fn(async () => ({ status: 200, terminal: false, shown: true })),
}));
vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));
vi.mock("../../app/utils/reviewAsk.server.js", () => ({ recordReviewOutcome }));

const { action } = await import("../../app/routes/app.review-request.jsx");

const SHOP = "a-store.myshopify.com";
const read = (f) => readFileSync(f, "utf8");
const code = (f) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

function post(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return action({
    request: new Request("https://app.navaal.ai/app/review-request", { method: "POST", body: fd }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP } });
  recordReviewOutcome.mockResolvedValue({ status: 200, terminal: false, shown: true });
});

describe("the callback records against a server-issued attempt", () => {
  it("passes the attempt, the code and the success flag through", async () => {
    const res = await post({ attemptId: "att_1", code: "success", success: "1" });

    expect(res.status).toBe(200);
    expect(recordReviewOutcome).toHaveBeenCalledWith(
      SHOP,
      "att_1",
      expect.objectContaining({ code: "success", success: true }),
    );
  });

  it("records the outcome for THIS session's shop, never one the client names", async () => {
    // The shop comes from the authenticated session. A client that could name
    // the shop could close another merchant's attempt.
    await post({ attemptId: "att_1", code: "success", success: "1", shop: "someone-else.myshopify.com" });
    expect(recordReviewOutcome.mock.calls[0][0]).toBe(SHOP);
  });

  it("refuses a report with no attempt id, without touching the recorder", async () => {
    const res = await post({ code: "success", success: "1" });
    expect(res.status).toBe(400);
    expect(recordReviewOutcome).not.toHaveBeenCalled();
  });

  it("passes a second report for the same attempt to the recorder, which answers 409", async () => {
    recordReviewOutcome.mockResolvedValue({ status: 409 });
    const res = await post({ attemptId: "att_1", code: "success", success: "1" });
    expect(res.status).toBe(409);
    expect((await res.json()).ok).toBe(false);
  });

  it("returns 404 for an attempt that does not belong to this shop", async () => {
    recordReviewOutcome.mockResolvedValue({ status: 404 });
    const res = await post({ attemptId: "someone-elses", code: "success", success: "1" });
    expect(res.status).toBe(404);
  });

  it("treats anything but an explicit 1 as not-a-success", async () => {
    await post({ attemptId: "att_1", code: "cancelled", success: "true" });
    expect(recordReviewOutcome.mock.calls[0][2].success).toBe(false);
  });

  it("has a stated default when the caller sends no code", async () => {
    await post({ attemptId: "att_1" });
    expect(recordReviewOutcome.mock.calls[0][2].code).toBe("unknown");
  });

  it("authenticates like every other non-webhook route (G3)", async () => {
    await post({ attemptId: "att_1", code: "success", success: "1" });
    expect(authenticate.admin).toHaveBeenCalledTimes(1);
  });

  it("never redirects — a background fetcher cannot render a login form", () => {
    // A redirect here would be swallowed by the fetcher and the outcome lost,
    // leaving the attempt "pending" and the shop held for 60 days.
    const src = code("app/routes/app.review-request.jsx");
    expect(src).not.toMatch(/\bredirect\(/);
    expect(src).not.toMatch(/auth\/login/);
  });
});

describe("the client cannot ask on its own", () => {
  const src = code("app/components/ReviewRequest.jsx");

  it("does nothing without a server-issued attemptId", () => {
    expect(src).toMatch(/ask\?\.attemptId/);
    expect(src).toMatch(/if \(!attemptId/);
  });

  it("takes no boolean that a parent could compute from loader data", () => {
    // `active` was the old prop, and it is exactly how the jobs page asked on
    // open. The component must not be able to be told "ask now".
    expect(src).not.toMatch(/\bactive\b/);
  });

  it("reports a hidden tab as skipped rather than as a decline", () => {
    // The modal would open behind the merchant's back and be dismissed unseen.
    expect(src).toMatch(/document\.hidden/);
    expect(src).toMatch(/skipped-hidden/);
  });

  it("reports every outcome, including the ones where nothing was shown", () => {
    // The server's hold depends on which outcome it was, so a silent failure
    // to report is a shop stuck pending for 60 days.
    expect(src).toMatch(/unavailable/);
    expect(src).toMatch(/"error"/);
    expect(src).toMatch(/fetcher\.submit/);
  });

  it("does not fire twice for the same attempt", () => {
    expect(src).toMatch(/fired\.current === attemptId/);
  });

  it("uses App Bridge and nothing else — no custom review UI", () => {
    expect(src).toMatch(/shopify.*reviews.*request|bridge\?\.reviews/);
  });
});

describe("where the ask is opened, and where it is not", () => {
  it("the Review screen opens it inside the publish action", () => {
    const src = code("app/routes/app.review.jsx");
    expect(src).toMatch(/openReviewAsk\(/);
    expect(src).toMatch(/surface: "review_page"/);
    // Only when something was actually published. Whitespace-insensitive: a
    // formatter wrapping this line must not be able to fail the guard.
    expect(src.replace(/\s+/g, " ")).toMatch(/published > 0 \? await openReviewAsk/);
  });

  it("the product page opens it inside its publish action", () => {
    const src = code("app/routes/app.products_.$id.jsx");
    expect(src).toMatch(/openReviewAsk\(/);
    expect(src).toMatch(/surface: "product_page"/);
  });

  it("the product page never asks off the back of an auto-publish", () => {
    // Auto-published content is content the merchant never pressed approve on.
    const src = code("app/routes/app.products_.$id.jsx");
    expect(src).not.toMatch(/autoPublished[^\n]*reviewAsk|reviewAsk[^\n]*autoPublished/);
  });

  it("the jobs page has no ask at all any more", () => {
    const src = read("app/routes/app.jobs.jsx");
    expect(src).not.toMatch(/ReviewRequest/);
    expect(src).not.toMatch(/openReviewAsk/);
  });

  it("the Start state never asks — a merchant who has published nothing is not asked", () => {
    expect(code("app/components/StartState.jsx")).not.toMatch(/ReviewRequest|reviewAsk/);
  });

  it("no screen writes the retired GrowthState flag any more", () => {
    // One code path. The COLUMN survives and reviewAsk.server.js still READS it
    // as a legacy hold, so a shop asked under the old code is not asked again
    // immediately — but nothing writes it.
    for (const f of [
      "app/routes/app.review.jsx",
      "app/routes/app.jobs.jsx",
      "app/routes/app.products_.$id.jsx",
      "app/routes/app.review-request.jsx",
      "app/components/ReviewRequest.jsx",
    ]) {
      expect(code(f), f).not.toMatch(/reviewRequestedAt/);
    }
    expect(code("app/utils/reviewAsk.server.js")).toMatch(/reviewRequestedAt/);
  });
});
