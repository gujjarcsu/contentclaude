import { Outlet, useLoaderData, useRouteError, useNavigate, useFetcher, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import { Text, InlineStack, FooterHelp, Link } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useEffect, useRef, useState } from "react";
import { authenticate } from "../shopify.server";
import { ContentClaudeBrand } from "../components/ContentClaudeBrand";
import { AppRenderBoundary } from "../components/RouteError";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const host = new URL(request.url).searchParams.get("host") || "";
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", host, shopDomain: session.shop };
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
      if (h && !sp.get("host")) {
        sp.set("host", h);
        if (s && !sp.get("shop")) sp.set("shop", s);
        sp.set("embedded", "1");
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}?${sp.toString()}${window.location.hash || ""}`
        );
      }
    } catch {
      /* sessionStorage / history unavailable — best-effort only */
    }
  }, [location.pathname, location.search, host, shopDomain]);
}

const MESSAGES = [
  "✨ AI is crafting your product content…",
  "🔍 Researching keywords and SEO…",
  "📝 Writing descriptions in your brand voice…",
  "🚀 Almost there — polishing the content…",
  "⚡ Generating at full speed…",
];

function JobProgressTicker({ navigate }) {
  const fetcher = useFetcher();
  const timerRef = useRef(null);
  const [msgIdx, setMsgIdx] = useState(0);
  // Use a ref so the recursive timer always reads the latest count without
  // needing to restart the effect (which would create overlapping timers).
  const hasJobsRef = useRef(false);

  const data = fetcher.data;
  const hasJobs = data ? data.count > 0 : false;
  const pct = data?.pct ?? 0;
  const completedProducts = data?.completedProducts ?? 0;
  const totalProducts = data?.totalProducts ?? 0;

  // Keep ref in sync with latest render value.
  hasJobsRef.current = hasJobs;

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      if (cancelled) return;
      fetcher.load("/api/jobs-status");
    };

    const scheduleNext = () => {
      if (cancelled) return;
      // Read latest job state from ref so delay adapts after each poll response.
      // Poll fast (2s) while a job runs so the bar visibly moves; slow when idle.
      const delay = hasJobsRef.current ? 2_000 : 15_000;
      timerRef.current = setTimeout(() => {
        poll();
        scheduleNext();
      }, delay);
    };

    poll(); // immediate first fetch
    scheduleNext();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Effect is intentionally mount-only; hasJobsRef carries live state

  // Rotate messages while jobs are running
  useEffect(() => {
    if (!hasJobs) return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 3500);
    return () => clearInterval(t);
  }, [hasJobs]);

  if (!hasJobs) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      role="button"
      tabIndex={0}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 500,
        background: "linear-gradient(90deg, #1a3c6b 0%, #2C6ECB 50%, #1a3c6b 100%)",
        backgroundSize: "200% 100%",
        animation: "gradientPan 4s ease infinite",
        padding: "10px 20px",
        cursor: "pointer",
      }}
      onClick={() => navigate("/app/jobs")}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/app/jobs"); }}
    >
      <style>{`
        @keyframes gradientPan {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
      <InlineStack align="space-between" blockAlign="center" gap="400">
        <InlineStack gap="300" blockAlign="center">
          <span style={{ animation: "pulse 1.5s ease-in-out infinite", fontSize: "14px" }}>⚡</span>
          <Text as="span" variant="bodySm" fontWeight="semibold">
            <span style={{ color: "#ffffff" }}>{MESSAGES[msgIdx]}</span>
          </Text>
          <Text as="span" variant="bodySm">
            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              {completedProducts}/{totalProducts} products
            </span>
          </Text>
        </InlineStack>
        <InlineStack gap="300" blockAlign="center">
          {/* Bigger, smoothly-animating bar — the width transition glides it
              between poll updates instead of snapping. */}
          <div style={{ width: 260, height: 10, background: "rgba(255,255,255,0.25)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`,
              height: "100%",
              background: "#ffffff",
              borderRadius: 999,
              transition: "width 0.6s ease",
            }} />
          </div>
          <Text as="span" variant="bodyMd" fontWeight="bold">
            <span style={{ color: "#ffffff" }}>{pct}%</span>
          </Text>
          <span style={{
            background: "rgba(255,255,255,0.2)",
            borderRadius: "4px",
            padding: "2px 8px",
            fontSize: "11px",
            color: "#ffffff",
            fontWeight: "600",
            letterSpacing: "0.03em",
          }}>View Jobs →</span>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

export default function App() {
  const { apiKey, host, shopDomain } = useLoaderData();
  const navigate = useNavigate();
  useStickyEmbeddedParams(host, shopDomain);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <s-app-nav>
          <div slot="logo" style={{ padding: "8px 16px" }}>
            <ContentClaudeBrand />
          </div>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/products">Products</s-link>
          <s-link href="/app/optimize">Optimise Store</s-link>
          <s-link href="/app/review">Review &amp; Publish</s-link>
          <s-link href="/app/seo-audit">SEO Audit</s-link>
          <s-link href="/app/blog">Blog Generator</s-link>
          <s-link href="/app/collections">Collections</s-link>
          <s-link href="/app/results">Results</s-link>
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/jobs">Jobs</s-link>
          <s-link href="/app/settings">Settings</s-link>
          <s-link href="/app/plans">Plans &amp; Billing</s-link>
        </s-app-nav>
        {/* Live job progress ticker — polls /api/jobs-status every 5s when active */}
        <JobProgressTicker navigate={navigate} />
        <AppRenderBoundary>
          <Outlet />
          {/* Support & bug reporting — visible on every page of the app */}
          <FooterHelp>
            Questions, bugs, or suggestions?{" "}
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
  return boundary.headers(headersArgs);
};
