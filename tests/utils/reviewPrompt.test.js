import { describe, it, expect } from "vitest";
import { evaluateReviewPrompt, REVIEW_PROMPT_CONFIG } from "../../app/utils/reviewPrompt.server.js";

const NOW = new Date("2026-06-19T00:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("evaluateReviewPrompt", () => {
  it("shows on a genuine milestone with clean state", () => {
    const r = evaluateReviewPrompt({ now: NOW, milestone: "bulk_published", state: {} });
    expect(r.show).toBe(true);
    expect(r.reason).toBe("eligible");
  });

  it("NEVER shows right after an error", () => {
    const r = evaluateReviewPrompt({ now: NOW, milestone: "bulk_published", hadRecentError: true, state: {} });
    expect(r.show).toBe(false);
    expect(r.reason).toBe("recent_error");
  });

  it("does not show without a valid success milestone", () => {
    expect(evaluateReviewPrompt({ now: NOW, milestone: null, state: {} }).show).toBe(false);
    expect(evaluateReviewPrompt({ now: NOW, milestone: "page_view", state: {} }).show).toBe(false);
  });

  it("respects the minimum interval between asks", () => {
    const r = evaluateReviewPrompt({
      now: NOW, milestone: "first_publish",
      state: { lastPromptAt: daysAgo(REVIEW_PROMPT_CONFIG.MIN_INTERVAL_DAYS - 1) },
    });
    expect(r.show).toBe(false);
    expect(r.reason).toBe("min_interval");
  });

  it("respects a long cooldown after a dismissal", () => {
    const r = evaluateReviewPrompt({
      now: NOW, milestone: "first_publish",
      state: { dismissedAt: daysAgo(REVIEW_PROMPT_CONFIG.DISMISS_COOLDOWN_DAYS - 5) },
    });
    expect(r.show).toBe(false);
    expect(r.reason).toBe("dismiss_cooldown");
  });

  it("never exceeds the lifetime cap", () => {
    const r = evaluateReviewPrompt({
      now: NOW, milestone: "bulk_published",
      state: { promptCount: REVIEW_PROMPT_CONFIG.MAX_LIFETIME_PROMPTS },
    });
    expect(r.show).toBe(false);
    expect(r.reason).toBe("lifetime_cap_reached");
  });

  it("shows again once enough time has passed", () => {
    const r = evaluateReviewPrompt({
      now: NOW, milestone: "geo_score_milestone",
      state: { lastPromptAt: daysAgo(40), promptCount: 1 },
    });
    expect(r.show).toBe(true);
  });
});
