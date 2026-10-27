import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData, useMatches, useRouteError, isRouteErrorResponse } from "react-router";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import mobileStyles from "./mobile.css?url";

// PostgreSQL COUNT() returns BigInt via Prisma $queryRaw.
// This global patch ensures BigInts serialize to JSON correctly.
// Must run here (root module) before any route loader.
if (typeof BigInt.prototype.toJSON === "undefined") {
  BigInt.prototype.toJSON = function () { return Number(this); };
}

export function links() {
  return [
    { rel: "stylesheet", href: polarisStyles },
    { rel: "stylesheet", href: mobileStyles },
  ];
}

/**
 * P0.4 — the API key, so App Bridge can be declared in the `<head>`.
 *
 * Reads one environment variable and nothing else. It must never throw: this
 * loader runs for EVERY document, including the one that renders an error
 * boundary, so a failure here would replace a useful error page with a blank
 * one.
 */
export const loader = () => ({ shopifyApiKey: process.env.SHOPIFY_API_KEY || "" });

export default function App() {
  // useRouteLoaderData, not useLoaderData: during an error-boundary render the
  // root loader's data may be absent, and destructuring undefined would take the
  // whole document down instead of showing the error.
  const { shopifyApiKey } = useRouteLoaderData("root") ?? {};
  // Phase 12 Part D (D1) — the document's language is the app's display
  // language (the app route's loader decides it). entry.client.jsx reads
  // this attribute to load the locale's chunk before hydrating, and a screen
  // reader announces the right language.
  const matches = useMatches();
  const uiLocale = matches.map((m) => m?.data?.uiLocale).find((v) => typeof v === "string") ?? "en";

  return (
    <html lang={uiLocale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/*
          P0.4 — App Bridge, first in the head, on EVERY document.

          Measured from the rendered document before this change: app-bridge.js
          was present and was already the FIRST script overall (order 0), but it
          sat in the BODY, emitted by <AppProvider embedded> inside the route
          tree. React is 18.3.1, which does not hoist scripts into the head —
          that is a React 19 feature — so it stayed where AppProvider put it, and
          the `<head>` contained no scripts at all.

          Shopify's documented placement is the head, with the api-key meta, and
          the framework example is literally app/root.tsx. INP is only collected
          for apps using App Bridge, and INP is a Built for Shopify gate.

          The key is rendered only when it is actually set, so a missing
          environment variable produces no meta tag rather than an empty one
          claiming to be a key.
        */}
        {shopifyApiKey ? <meta name="shopify-api-key" content={shopifyApiKey} /> : null}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
        <title>Navaal: AI SEO, AEO & GEO</title>
        <meta name="description" content="Navaal: AI SEO, AEO & GEO — product descriptions, meta tags, FAQs with schema, and an llms.txt feed written to rank in Google and be quoted by ChatGPT, Perplexity and AI Overviews." />
        <meta name="theme-color" content="#0A84FF" />
        <meta property="og:title" content="Navaal: AI SEO, AEO & GEO" />
        <meta property="og:description" content="AI SEO, AEO & GEO content for Shopify merchants — descriptions, meta tags, FAQ schema and llms.txt." />
        <meta property="og:image" content="/icon-512.svg" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/logos/contentclaude-icon-square.svg" type="image/svg+xml" sizes="any" />
        <link rel="apple-touch-icon" href="/icon-512.svg" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Last-resort error screen (incident 2026-10-28).
 *
 * Errors that no route boundary handles — app.jsx's boundary hands anything
 * that is not a Shopify auth response up to here — used to fall through to
 * React Router's built-in page: "Application Error" over an empty pink box,
 * with no way forward. Merchants and testers saw exactly that.
 *
 * This renders a full document (the root has no Layout export), keeps App
 * Bridge in the head so the embedded admin frame still works, and offers a
 * reload, which re-enters the app through the normal auth path. It deliberately
 * uses no Polaris or i18n providers: those live below the root, and an error
 * page must not depend on the tree that may have just failed. Error details
 * are never shown in production; they are already logged by handleError in
 * entry.server.jsx.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const { shopifyApiKey } = useRouteLoaderData("root") ?? {};
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const title = notFound ? "Page not found" : "Something went wrong";
  const message = notFound
    ? "This page doesn't exist. Use the menu to get back to the app."
    : "Navaal hit a problem loading this page. Reloading usually fixes it, and your data is safe.";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {shopifyApiKey ? <meta name="shopify-api-key" content={shopifyApiKey} /> : null}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
        <title>{`${title} · Navaal: AI SEO, AEO & GEO`}</title>
        <Meta />
        <Links />
      </head>
      <body style={{ margin: 0, background: "#f1f1f1", fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, sans-serif", color: "#303030" }}>
        <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px" }}>
          <div role="alert" style={{ background: "#ffffff", border: "1px solid #e3e3e3", borderRadius: 12, padding: 24 }}>
            <h1 style={{ fontSize: 18, fontWeight: 650, margin: "0 0 8px" }}>{title}</h1>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{message}</p>
            {notFound ? null : (
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ background: "#303030", color: "#ffffff", border: 0, borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Reload
              </button>
            )}
            <p style={{ fontSize: 13, color: "#616161", margin: "16px 0 0" }}>
              Still stuck? Email <a href="mailto:hello@navaal.ai">hello@navaal.ai</a> and we&apos;ll sort it out.
            </p>
          </div>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
