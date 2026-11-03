/**
 * Hosts allowed to submit actions when the origin the browser sends does not
 * match the URL the server sees.
 *
 * Fly terminates TLS and forwards plain http, and `react-router-serve` does not
 * trust the proxy, so every request reaches React Router as `http://…` while
 * the browser's Origin is `https://…`. Since React Router 7.18 the CSRF check
 * compares the whole origin, scheme included, so without this every form and
 * fetcher POST in production was refused with 400 before the action ran —
 * Home's first run showed "Unexpected Server Error" (tests/utils/actionOrigin.test.js).
 *
 * Only our own host is listed: the production domain, and the URL the Shopify
 * CLI sets for a dev tunnel when it builds. Any other origin is still refused.
 */
const ownHosts = ["app.navaal.ai"];
try {
  if (process.env.SHOPIFY_APP_URL) ownHosts.push(new URL(process.env.SHOPIFY_APP_URL).host);
} catch {
  /* not a URL — the production host above still applies */
}

/** @type {import('@react-router/dev/config').Config} */
export default {
  allowedActionOrigins: [...new Set(ownHosts)],
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
};
