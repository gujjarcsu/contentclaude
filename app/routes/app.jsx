import { Outlet, useLoaderData, useRouteError, useNavigate, useFetcher, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import { FooterHelp, Link, Banner, Box, ProgressBar } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useEffect, useRef } from "react";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { ContentClaudeBrand } from "../components/ContentClaudeBrand.jsx";
import { AppRenderBoundary } from "../components/RouteError.jsx";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const host = new URL(request.url).searchParams.get("host") || "";
  // Phase 1 item 6 — the progress ticker used to poll /api/jobs-status every 15
  // seconds, forever, in every open admin tab, with each poll costing an
  // authenticate.admin plus a Prisma query. Almost all of those polls asked
  // about jobs that did not exist. The layout already knows the answer, so it
  // says so once and the ticker only starts polling when there is something to
  // watch. One indexed COUNT, on a page load that was already hitting the
  // database.
  const activeJobCount = await prisma.generationJob.count({
    where: { shop: session.shop, status: { in: ["queued", "processing"] } },
  });
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", host, shopDomain: session.shop, activeJobCount };
};

// Keep the embedded context (host/shop/embedded) STICKY in the browser URL.
//
// App Store rejection 2.1.1 (#4) root cause: a client-side navigation (nav-menu
// click) lands on a bare path like /app/products with NO host query param. A
// later reload or document load of that URL then reaches the Shopify library
// with no host, and validateShopAndHostParams throws redirect("/auth/login") —
// the "Shop domain" login form inside the admin. We capture the embedded params
// on first load and re-append them (via history.replaceState, no navigation) on
// every route change, so every URL always carries host/shop and a reload can
// re-authenticate silently instead of dead-ending on the form.
function useStickyEmbeddedParams(host, shopDomain) {
  const location = useLocation();
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const h = sp.get("host") || sessionStorage.getItem("navaal:host") || host;
      const s = sp.get("shop") || sessionStorage.getItem("navaal:shop") || shopDomain;
      if (h) sessionStorage.setItem("navaal:host", h);
      if (s) sessionStorage.setItem("navaal:shop", s);
      // (The navaal_shop persistence cookie is set SERVER-SIDE in entry.server.jsx
      // with the Partitioned attribute — a client document.cookie write was
      // rejected by the browser in the embedded third-party context.)
      if (h && !sp.get("host")) {
        sp.set("host", h);
        if (s && !sp.get("shop")) sp.set("shop", s);
        sp.set("embedded", "1");
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}?${sp.toString()}${window.location.hash || ""}`,
        );
      }
    } catch {
      /* sessionStorage / history unavailable — best-effort only */
    }
  }, [location.pathname, location.search, host, shopDomain]);
}

function JobProgressTicker({ navigate, activeJobCount, onJobsPage }) {
  const fetcher = useFetcher();
  const timerRef = useRef(null);
  const hasJobsRef = useRef(false);
  // Phase 1 item 6 — how many consecutive polls came back with nothing.
  const idleStreakRef = useRef(0);

  const data = fetcher.data;
  const hasJobs = data ? data.count > 0 : activeJobCount > 0;
  const pct = data?.pct ?? 0;
  const completedProducts = data?.completedProducts ?? 0;
  const totalProducts = data?.totalProducts ?? 0;

  hasJobsRef.current = hasJobs;

  // Phase 1 item 6 — poll only while there is something to watch.
  //
  // This used to be a mount-only effect that polled forever: every 15 s in every
  // open admin tab, whether or not a job existed, each poll costing an
  // authenticate.admin and a Prisma query. Now the layout loader says whether a
  // job is running, and the ticker stops itself after two consecutive empty
  // responses — two rather than one so a poll that lands in the gap between one
  // job finishing and the next starting does not cut the display short.
  //
  // Starting a job re-runs the layout loader, so activeJobCount goes above zero
  // and this effect starts again on its own.
  useEffect(() => {
    // The Jobs page revalidates its own loader, so the ticker polling there is
    // the second half of a double-poll for the same data.
    if (onJobsPage) return undefined;
    if (activeJobCount === 0 && !hasJobsRef.current) return undefined;

    let cancelled = false;
    idleStreakRef.current = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      if (idleStreakRef.current >= 2) return; // nothing running — stop entirely
      const delay = hasJobsRef.current ? 2_000 : 5_000;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        fetcher.load("/api/jobs-status");
        scheduleNext();
      }, delay);
    };

    fetcher.load("/api/jobs-status");
    scheduleNext();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobCount, onJobsPage]);

  // Count empty responses so the loop above can stop.
  useEffect(() => {
    if (!data) return;
    idleStreakRef.current = data.count > 0 ? 0 : idleStreakRef.current + 1;
  }, [data]);

  if (!hasJobs) return null;

  /* Phase 2 item 2.5 — this was a `div` with `role="button"`, an animated
     gradient, a `<style>` element injected into the DOM at runtime declaring two
     @keyframes, a pulsing emoji, a fixed 260px progress track that overflowed at
     375px, and a "View Jobs" pill made of a styled span. Its accessible name
     was the concatenation of a rotating emoji sentence, a product count and a
     percentage — a screen reader announced a long string that changed every 3.5
     seconds.

     It is now a Polaris Banner with a Polaris ProgressBar and a real Button.
     The rotating messages are gone: five emoji sentences cycling every 3.5
     seconds said nothing the progress bar does not, and "Almost there" was a
     claim the code had no basis for. */
  return (
    <Box paddingBlockStart="200" paddingInlineStart="400" paddingInlineEnd="400">
      <Banner
        tone="info"
        title={
          totalProducts > 0
            ? `Generating content — ${completedProducts} of ${totalProducts} products`
            : "Generating content"
        }
        action={{ content: "View progress", onAction: () => navigate("/app/jobs") }}
      >
        <Box paddingBlockStart="200">
          <ProgressBar progress={pct} size="small" tone="primary" />
        </Box>
      </Banner>
    </Box>
  );
}

export default function App() {
  const { apiKey, host, shopDomain, activeJobCount = 0 } = useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();
  useStickyEmbeddedParams(host, shopDomain);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <s-app-nav>
          <div slot="logo" style={{ padding: "8px 16px" }}>
            <ContentClaudeBrand />
          </div>
          {/* Phase 2 item 2.2 — thirteen nav items became five.
              Thirteen, not the twelve the brief counted: `Home` and `Dashboard`
              both pointed at /app, so the sidebar offered the same destination
              twice under two different words.

              Home · Products · Review · Blog · Settings.

              NOTHING IS DELETED. Every merged route still exists, still works,
              and is still reachable from inside the app: Optimize is the primary
              action on Products, Collections is a tab there, SEO Audit and
              Results and Analytics are cards on Home, Jobs is reached from the
              progress banner, and Plans is a section in Settings and the target
              of every usage card. Removing the routes themselves is the owner's
              call and waits for it.

              rel="home" stays on the first item: without a home link Shopify
              points the app title at "/", and a bare "/" used to reach the login
              form (App Store rejection 2.1.1). */}
          <s-link href="/app" rel="home">
            Home
          </s-link>
          <s-link href="/app/products">Products</s-link>
          <s-link href="/app/review">Review</s-link>
          <s-link href="/app/blog">Blog</s-link>
          <s-link href="/app/settings">Settings</s-link>
        </s-app-nav>
        {/* Live job progress ticker. Phase 1 item 6: it polls only while a job
            is actually running, stops after two empty responses, and stays
            quiet on the Jobs page, which revalidates its own loader. */}
        <JobProgressTicker
          navigate={navigate}
          activeJobCount={activeJobCount}
          onJobsPage={location.pathname.startsWith("/app/jobs")}
        />
        <AppRenderBoundary>
          <Outlet />
          {/* Support & bug reporting — visible on every page of the app */}
          <FooterHelp>
            Questions, bugs, or suggestions?{""}
            <Link url="mailto:hello@navaal.ai">Contact us at hello@navaal.ai</Link>
          </FooterHelp>
        </AppRenderBoundary>
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  // Phase 0 item 22 — every /app/* document carries the merchant's own catalogue
  // content plus their plan and usage figures. No shared cache (and no
  // back/forward restore on a shared machine) should keep any of it, and the
  // connection must never be downgraded to http.
  const h = new Headers(boundary.headers(headersArgs));
  h.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  return h;
};
