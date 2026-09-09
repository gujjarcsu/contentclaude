import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
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

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
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
