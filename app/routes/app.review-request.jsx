// Resource route (action only) — records what shopify.reviews.request() came
// back with, against the attempt the SERVER opened.
//
// Phase 3 item 3.3. The attemptId is the whole security model: this route
// records an outcome for an attempt that already exists, and it refuses
// anything else. A client cannot invent one, cannot record against another
// shop's attempt (the row is checked to belong to this session's shop), and
// cannot answer the same attempt twice (a second report is a 409). So the ask
// is opened exactly once, inside a publish action the merchant confirmed, and
// closed exactly once.
//
// It never redirects. A background fetcher that receives a redirect to a login
// form renders it into nothing and loses the outcome, which would leave the
// attempt permanently "pending" — and a pending attempt holds the shop for 60
// days. Errors are JSON with a status.
import { authenticate } from "../shopify.server.js";
import { recordReviewOutcome } from "../utils/reviewAsk.server.js";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const attemptId = String(form.get("attemptId") || "");
  if (!attemptId) return Response.json({ ok: false, error: "missing_attempt" }, { status: 400 });

  const result = await recordReviewOutcome(shop, attemptId, {
    code: String(form.get("code") || "unknown"),
    success: form.get("success") === "1",
    message: String(form.get("message") || ""),
  });

  return Response.json({ ok: result.status === 200, ...result }, { status: result.status });
};
