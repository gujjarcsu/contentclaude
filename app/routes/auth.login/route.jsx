import { redirect } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { isEmbeddedRequest, embeddedAppParams } from "../../utils/embedded.server.js";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // App Store rejection 2.1.1: the login form must be UNREACHABLE from inside
  // the admin. Any embedded/admin request (host or embedded=1) is sent back into
  // the app — `/app` re-authenticates silently via token exchange / the App
  // Bridge bounce, so the merchant lands on the dashboard, never on this form.
  // (The previous host-recovery here called login(), which THROWS an OAuth
  // redirect, then swallowed that throw in a try/catch and fell through to the
  // form — so recovery never happened. Redirecting to /app avoids that entirely
  // and keeps the merchant embedded instead of doing a top-level OAuth.)
  if (isEmbeddedRequest(request)) {
    const params = embeddedAppParams(url);
    throw redirect(`/app?${params.toString()}`);
  }

  // Outside the admin. Only call login() when there's a shop param to process —
  // the Shopify library calls request.formData() internally, which Node 24+
  // rejects on plain GET requests that have no form body. login() may THROW an
  // OAuth redirect for a valid shop; let it propagate (do not catch it).
  const shopParam = url.searchParams.get("shop");
  const errors = shopParam ? loginErrorMessage(await login(request)) : {};
  return { errors };
};

export const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        {/* Use native form with target="_top" so the OAuth redirect breaks
            out of the Shopify embedded iframe and opens at the top window level.
            React Router's <Form> uses fetch() internally and ignores target. */}
        <form method="post" action="/auth/login" target="_top">
          <s-section heading="Log in">
            <s-text-field
              name="shop"
              label="Shop domain"
              details="example.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </form>
      </s-page>
    </AppProvider>
  );
}
