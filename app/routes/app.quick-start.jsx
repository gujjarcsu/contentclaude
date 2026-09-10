import { redirect } from "react-router";
import { authenticate } from "../shopify.server.js";
import logger from "../utils/logger.server.js";
import { runQuickStartOne, PRODUCT_GID_RE, QUICK_START_MESSAGES } from "../utils/quickStart.server.js";

// Resource route (action only) — the dashboard hero POSTs one product per
// request here: { productId, mode: generate | enhance }. It ALWAYS answers
// HTTP 200 JSON with { ok: false, … } on an expected failure (a thrown
// Response would land the merchant on the ErrorBoundary mid-run); only a
// malformed product id is a 400. A loader hit (someone typing the URL) goes
// back into the app with its auth params — it never renders anything and
// never a login form (2.1.1).

function authParamString(request) {
  const url = new URL(request.url);
  const p = new URLSearchParams();
  for (const k of ["host", "shop", "id_token", "session", "embedded", "locale", "timestamp", "hmac"]) {
    const v = url.searchParams.get(k);
    if (v) p.set(k, v);
  }
  return p.toString();
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  throw redirect(`/app?${authParamString(request)}`);
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: QUICK_START_MESSAGES.invalid }, { status: 400 });
  }
  const productId = String(form.get("productId") || "");
  const mode = form.get("mode") === "enhance" ? "enhance" : "generate";
  if (!PRODUCT_GID_RE.test(productId)) {
    return Response.json({ ok: false, error: QUICK_START_MESSAGES.invalid }, { status: 400 });
  }
  try {
    return Response.json(await runQuickStartOne({ admin, shop, productId, mode }));
  } catch (err) {
    // Last resort: runQuickStartOne handles every expected failure itself (and
    // refunds). An unexpected throw must still be a 200 the card can show.
    logger.error(
      { shop, productId, mode, err: err?.message, stack: err?.stack, event: "quick_start_unexpected" },
      "quick start: unexpected error",
    );
    return Response.json({ ok: false, productId, retryable: true, error: QUICK_START_MESSAGES.generic });
  }
};
