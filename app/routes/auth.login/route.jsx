import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { useActionData, useLoaderData } from "react-router";
import { login, addDocumentResponseHeaders } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { isEmbeddedRequest, renderReembedPage } from "../../utils/embedded.server.js";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // App Store rejection 2.1.1 / #4: the login form must be UNREACHABLE from
  // inside the admin. The Shopify library redirects here (validateShopAndHostParams
  // -> redirect("/auth/login")) whenever a session-less document request lacks
  // shop/host — e.g. a bare <s-link> navigation App Bridge didn't intercept, in
  // a cookie-blocked (incognito) context. A server redirect back to /app LOOPS
  // (/app is missing the same params). Instead we render an App Bridge re-embed
  // page: App Bridge restores the embedded context from the parent admin (even
  // when the URL dropped shop/host) and navigates to /app, where token exchange
  // authenticates silently. The form is reserved for a true top-level visit.
  if (isEmbeddedRequest(request)) {
    return renderReembedPage(request, addDocumentResponseHeaders, "/app");
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
