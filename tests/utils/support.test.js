/**
 * P6.2 — the support surface, and the one thing it must never do.
 *
 * The listing already promises "Questions answered within 1 business day". The
 * failure that breaks that promise is not a crash — it is a merchant being told
 * their question was sent when it was not. At 0 reviews, "I asked for help and
 * heard nothing" is the review that halves the rating.
 *
 * So the invariant under test is: **the row is written before the email, and
 * `ok` and `emailed` are reported separately and truthfully.**
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import {
  validateSupportRequest,
  looksLikeEmail,
  SUBJECT_MAX,
  MESSAGE_MAX,
} from "../../app/utils/support.js";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    supportRequest: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (a) => ({ id: "sr_1", ...a.data })),
      update: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));

const { sendOperatorEmail } = vi.hoisted(() => ({
  sendOperatorEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock("../../app/utils/notify.server.js", () => ({
  sendOperatorEmail,
  OPERATOR_EMAIL: "hello@navaal.ai",
}));

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/logger.server.js", () => ({ default: logger }));

const { submitSupportRequest } = await import("../../app/utils/support.server.js");

const GOOD = {
  shop: "s.myshopify.com",
  replyTo: "merchant@example.com",
  subject: "Alt text is not generating",
  message: "I clicked Generate on three products and nothing happened. No error either.",
};

describe("validation says something a merchant can act on", () => {
  it("accepts an ordinary address", () => {
    expect(looksLikeEmail("merchant@example.com")).toBe(true);
    expect(looksLikeEmail("a.b+c@sub.example.co.uk")).toBe(true);
  });

  it("rejects what is obviously not one", () => {
    for (const bad of ["", "merchant", "merchant@", "@example.com", "a@b"]) {
      expect(looksLikeEmail(bad), bad).toBe(false);
    }
  });

  it("names the field that is wrong, never just 'invalid'", () => {
    expect(validateSupportRequest({ ...GOOD, replyTo: "nope" }).error).toMatch(/email/i);
    expect(validateSupportRequest({ ...GOOD, subject: "" }).error).toMatch(/subject/i);
    expect(validateSupportRequest({ ...GOOD, message: "hi" }).error).toMatch(/bit more/i);
  });

  it("bounds both fields, and tells you the number", () => {
    const longSubject = validateSupportRequest({ ...GOOD, subject: "x".repeat(SUBJECT_MAX + 1) });
    expect(longSubject.ok).toBe(false);
    expect(longSubject.error).toContain(String(SUBJECT_MAX));

    const longMessage = validateSupportRequest({ ...GOOD, message: "x".repeat(MESSAGE_MAX + 1) });
    expect(longMessage.ok).toBe(false);
    // And it gives them somewhere to go rather than a dead end.
    expect(longMessage.error).toMatch(/hello@navaal\.ai/);
  });

  it("trims, so a pasted address with a trailing space still works", () => {
    const r = validateSupportRequest({ ...GOOD, replyTo: "  merchant@example.com  " });
    expect(r.ok).toBe(true);
    expect(r.clean.replyTo).toBe("merchant@example.com");
  });
});

describe("THE ROW IS WRITTEN BEFORE THE EMAIL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.supportRequest.count.mockResolvedValue(0);
    prisma.supportRequest.create.mockImplementation(async (a) => ({ id: "sr_1", ...a.data }));
    sendOperatorEmail.mockResolvedValue({ sent: true });
  });

  it("stores, then emails, then stamps emailedAt", async () => {
    const r = await submitSupportRequest(GOOD);
    expect(r).toMatchObject({ ok: true, emailed: true, id: "sr_1" });
    expect(prisma.supportRequest.create).toHaveBeenCalled();
    expect(prisma.supportRequest.update).toHaveBeenCalledWith({
      where: { id: "sr_1" },
      data: { emailedAt: expect.any(Date) },
    });
  });

  it("a FAILED email still leaves the question safe, and says so", async () => {
    // The whole point. ok: true because we HAVE the question; emailed: false
    // because it did not reach the inbox. The screen shows different words for
    // each, and the merchant is never told "sent" for something that was not.
    sendOperatorEmail.mockResolvedValue({ sent: false, reason: "HTTP 500" });
    const r = await submitSupportRequest(GOOD);
    expect(r.ok).toBe(true);
    expect(r.emailed).toBe(false);
    expect(prisma.supportRequest.update).not.toHaveBeenCalled();
  });

  it("an email that THROWS is treated as not sent, not as a crash", async () => {
    sendOperatorEmail.mockRejectedValue(new Error("socket hang up"));
    const r = await submitSupportRequest(GOOD);
    expect(r.ok).toBe(true);
    expect(r.emailed).toBe(false);
  });

  it("a `{sent:false}` OBJECT is not mistaken for success", async () => {
    // `sendOperatorEmail` returns an OBJECT. `if (await sendOperatorEmail(...))`
    // is always true, so a failed send would be reported as emailed. I wrote it
    // that way first; this is the assertion that would have caught it.
    sendOperatorEmail.mockResolvedValue({ sent: false, reason: "RESEND_API_KEY not set" });
    const r = await submitSupportRequest(GOOD);
    expect(r.emailed).toBe(false);
  });

  it("an un-emailed question is logged at WARN, not swallowed", async () => {
    sendOperatorEmail.mockResolvedValue({ sent: false, reason: "x" });
    await submitSupportRequest(GOOD);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "support_request_not_emailed" }),
      expect.any(String),
    );
  });

  it("ONLY a failed WRITE tells the merchant to email us directly", async () => {
    // This is the one case where we genuinely do not have their question, so it
    // is the only case where sending them elsewhere is the honest answer.
    prisma.supportRequest.create.mockRejectedValue(new Error("db down"));
    const r = await submitSupportRequest(GOOD);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/hello@navaal\.ai/);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "support_request_not_stored" }),
      expect.any(String),
    );
  });

  it("captures the plan and the sha, so the first reply is not a question back", async () => {
    await submitSupportRequest({ ...GOOD, planName: "pro" });
    const data = prisma.supportRequest.create.mock.calls[0][0].data;
    expect(data.planName).toBe("pro");
    expect("appSha" in data).toBe(true);
  });

  it("the open-request brake counts OPEN only, so an answered history is not a lockout", async () => {
    prisma.supportRequest.count.mockResolvedValue(10);
    const r = await submitSupportRequest(GOOD);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/open/i);
    expect(prisma.supportRequest.count).toHaveBeenCalledWith({
      where: { shop: GOOD.shop, status: "open" },
    });
  });

  it("a FAILED count never blocks a merchant asking for help", async () => {
    prisma.supportRequest.count.mockRejectedValue(new Error("db hiccup"));
    const r = await submitSupportRequest(GOOD);
    expect(r.ok).toBe(true);
  });
});

describe("the screen tells the truth about which happened", () => {
  const SRC = code(readFileSync("app/routes/app.support.jsx", "utf8"));

  it("branches on `emailed`, rather than showing one confirmation", () => {
    expect(SRC).toMatch(/actionData\.emailed/);
  });

  it("the not-emailed wording does not claim it was sent", () => {
    // The banner title in that branch is "your question is saved", not "sent".
    expect(SRC).toMatch(/your question is saved/i);
    expect(SRC).toMatch(/did not go[\s\S]{0,40}through/i);
  });

  it("gives a reference the merchant can quote", () => {
    expect(SRC).toMatch(/Reference:/);
  });

  it("does not import a server module into the component", () => {
    // React Router's build refuses this, but the failure message is obscure
    // enough that it is worth naming here.
    expect(SRC).not.toMatch(/from "\.\.\/utils\/support\.server\.js"/);
  });
});
