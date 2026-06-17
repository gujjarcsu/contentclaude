import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // If the app is embedded (Shopify always passes `host`), decode the shop
  // from the host param and redirect to OAuth automatically — the merchant
  // should never have to type their shop domain when coming from Shopify admin.
  const host = url.searchParams.get("host");
  if (host && !url.searchParams.get("shop")) {
    try {
      const decoded = atob(host.replace(/-/g, "+").replace(/_/g, "/"));
      // decoded = "{shop}/admin"
      const shop = decoded.split("/")[0];
      if (shop && shop.includes(".myshopify.com")) {
        const next = new URL(request.url);
        next.searchParams.set("shop", shop);
        const errors = loginErrorMessage(await login(new Request(next.toString(), request)));
        if (!errors.shop) return { errors };
      }
    } catch {
      // ignore decode errors — fall through to manual form
    }
  }

  // Only call login() when there's a shop param to process — the Shopify
  // library calls request.formData() internally, which Node 24+ rejects on
  // plain GET requests that have no form body.
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
