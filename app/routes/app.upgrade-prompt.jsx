import { redirect } from "react-router";
import { authenticate } from "../shopify.server.js";
import { markPromptEvent } from "../utils/upgradePrompts.server.js";

// Resource route (action only) — the client confirms upgrade-prompt exposures
// and clicks here: { promptId, event: shown | opened | dismissed | cta_clicked }.
// A loader hit (someone typing the URL) goes back into the app; it never
// renders anything, and never a login form (2.1.1). The action is called by a
// background fetcher, so an auth miss must NOT yank the app to a login page —
// it answers { ok: false } instead. The write is shop-scoped, so a foreign
// promptId is a no-op.

const PROMPT_ID_RE = /^[a-z0-9]{20,40}$/i;
const EVENTS = new Set(["shown", "opened", "dismissed", "cta_clicked"]);

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
  let shop;
  try {
    ({
      session: { shop },
    } = await authenticate.admin(request));
  } catch {
    return Response.json({ ok: false, reason: "unauthenticated" });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, reason: "bad_form" }, { status: 400 });
  }
  const promptId = String(form.get("promptId") || "");
  const event = String(form.get("event") || "");
  if (!PROMPT_ID_RE.test(promptId) || !EVENTS.has(event)) {
    return Response.json({ ok: false, reason: "bad_input" }, { status: 400 });
  }
  const count = await markPromptEvent(shop, promptId, event);
  return Response.json({ ok: count > 0, count });
};
