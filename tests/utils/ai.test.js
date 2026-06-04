/**
 * Unit tests for app/utils/ai.server.js
 *
 * Tests the sanitizeHtml function (via parseGeneratedContent) and
 * the prompt-building logic without hitting the real Anthropic API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock fetch so no real API calls are made ────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApiResponse(text) {
  return {
    ok: true,
    json: async () => ({ content: [{ text }] }),
  };
}

// ─── Import after mocking globals ────────────────────────────────────────────

const { generateProductContent, generateAltText } = await import(
  "../../app/utils/ai.server.js"
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("generateProductContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
  });

  it("parses description, metaTitle, and metaDescription from Claude response", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse(
        `<DESCRIPTION><p>Great product!</p></DESCRIPTION>
         <META_TITLE>My Product | Best Choice</META_TITLE>
         <META_DESCRIPTION>Buy this great product today.</META_DESCRIPTION>`
      )
    );

    const product = {
      title: "Test Product",
      productType: "Widget",
      vendor: "Acme",
      description: "A widget",
      descriptionHtml: "<p>A widget</p>",
      imageUrl: "",
      variants: [{ title: "Default", price: "19.99" }],
      tags: ["widget"],
    };
    const brandVoice = { storeName: "Acme", brandTone: "professional" };

    const result = await generateProductContent(product, brandVoice, [
      "description",
      "metaTitle",
      "metaDescription",
    ]);

    expect(result.description).toBe("<p>Great product!</p>");
    expect(result.metaTitle).toBe("My Product | Best Choice");
    expect(result.metaDescription).toBe("Buy this great product today.");
    expect(result.faq).toBe("");
  });

  it("strips script tags from AI-generated HTML (XSS prevention)", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse(
        `<DESCRIPTION><p>Good product</p><script>alert('xss')</script></DESCRIPTION>`
      )
    );

    const result = await generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["description"]
    );

    expect(result.description).not.toContain("<script>");
    expect(result.description).not.toContain("alert");
    expect(result.description).toContain("<p>Good product</p>");
  });

  it("strips inline event handlers from AI HTML", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse(
        `<DESCRIPTION><p onclick="evil()">Click me</p></DESCRIPTION>`
      )
    );

    const result = await generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["description"]
    );

    expect(result.description).not.toContain("onclick");
    expect(result.description).not.toContain("evil");
  });

  it("strips style tags from AI-generated HTML (CSS injection prevention)", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse(
        `<DESCRIPTION><p>Good product</p><style>body{display:none}</style></DESCRIPTION>`
      )
    );

    const result = await generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["description"]
    );

    expect(result.description).not.toContain("<style>");
    expect(result.description).not.toContain("display:none");
    expect(result.description).toContain("<p>Good product</p>");
  });

  it("blocks javascript: URIs in AI output", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse(
        `<DESCRIPTION><a href="javascript:alert(1)">link</a></DESCRIPTION>`
      )
    );

    const result = await generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["description"]
    );

    expect(result.description).not.toContain("javascript:");
  });

  it("returns empty strings for missing tags", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse(`<META_TITLE>Only Title</META_TITLE>`)
    );

    const result = await generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["description", "metaTitle"]
    );

    expect(result.description).toBe("");
    expect(result.metaTitle).toBe("Only Title");
  });

  it("throws when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      generateProductContent({ title: "T" }, {}, ["description"])
    ).rejects.toThrow("ANTHROPIC_API_KEY is not configured");
  });

  it("retries on 5xx response", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Service Unavailable" })
      .mockResolvedValueOnce(makeApiResponse("<META_TITLE>Retry Works</META_TITLE>"));

    const result = await generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["metaTitle"]
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.metaTitle).toBe("Retry Works");
  });

  it("retries on 429 response and succeeds on second attempt", async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h) => (h === "Retry-After" ? "1" : null) },
        text: async () => "rate limited",
      })
      .mockResolvedValueOnce(makeApiResponse("<META_TITLE>After 429</META_TITLE>"));

    const promise = generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["metaTitle"]
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    vi.useRealTimers();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.metaTitle).toBe("After 429");
  });

  it("throws with isRateLimit:true after max 429 retries", async () => {
    vi.useFakeTimers();
    const rate429 = {
      ok: false,
      status: 429,
      headers: { get: (h) => (h === "Retry-After" ? "1" : null) },
      text: async () => "rate limited",
    };
    mockFetch
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(rate429);

    const promise = generateProductContent(
      { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
      {},
      ["description"]
    );

    // Catch before advancing timers so the rejection doesn't propagate as unhandled
    const caught = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const err = await caught;
    expect(err).toMatchObject({ isRateLimit: true });
  });

  it("throws with isContentPolicy:true on 400 invalid_request_error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({ error: { type: "invalid_request_error", message: "Content policy violation" } }),
    });

    await expect(
      generateProductContent(
        { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
        {},
        ["description"]
      )
    ).rejects.toMatchObject({ isContentPolicy: true });
  });

  it("does NOT retry on 400 content policy errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({ error: { type: "invalid_request_error", message: "Refused" } }),
    });

    await expect(
      generateProductContent(
        { title: "T", productType: "", vendor: "", description: "", descriptionHtml: "", imageUrl: "", variants: [], tags: [] },
        {},
        ["description"]
      )
    ).rejects.toThrow();

    // 400 should never retry — only one call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("generateAltText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
  });

  it("returns trimmed alt text from Claude", async () => {
    mockFetch.mockResolvedValueOnce(
      makeApiResponse("  Red running shoe on white background  ")
    );

    const result = await generateAltText("https://example.com/img.jpg", "Red Shoe");
    expect(result).toBe("Red running shoe on white background");
  });
});
