import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export function links() {
  return [{ rel: "stylesheet", href: polarisStyles }];
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>ContentClaude - AI Product Content Powered by Claude</title>
        <meta name="description" content="Generate product descriptions, blogs, and SEO content powered by Claude AI" />
        <meta name="theme-color" content="#0A84FF" />
        <meta property="og:title" content="ContentClaude - AI Product Content" />
        <meta property="og:description" content="AI-powered product content and blog generation for Shopify merchants" />
        <meta property="og:image" content="/logos/contentclaude-icon-square.svg" />
        <link rel="icon" href="/logos/contentclaude-icon-square.svg" type="image/svg+xml" />
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
