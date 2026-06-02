import { Outlet, useLoaderData, useRouteError, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import { Text, InlineStack, ProgressBar } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useEffect, useRef, useState } from "react";
import { authenticate } from "../shopify.server";
import { ContentClaudeBrand } from "../components/ContentClaudeBrand";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

const MESSAGES = [
  "✨ AI is crafting your product content…",
  "🔍 Researching keywords and SEO…",
  "📝 Writing descriptions in your brand voice…",
  "🚀 Almost there — polishing the content…",
  "⚡ Generating at full speed…",
];

function JobProgressTicker({ navigate }) {
  const fetcher = useFetcher();
  const pollRef = useRef(null);
  const [msgIdx, setMsgIdx] = useState(0);

  const data = fetcher.data;
  const hasJobs = data ? data.count > 0 : false;
  const pct = data?.pct ?? 0;
  const completedProducts = data?.completedProducts ?? 0;
  const totalProducts = data?.totalProducts ?? 0;

  // Poll every 5s when jobs are active, 15s when idle
  useEffect(() => {
    function poll() {
      fetcher.load("/api/jobs-status");
    }
    poll(); // immediate first fetch
    const delay = hasJobs ? 5000 : 15000;
    pollRef.current = setInterval(poll, delay);
    return () => clearInterval(pollRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJobs]);

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
          <div style={{ width: 120 }}>
            <ProgressBar progress={pct} tone="highlight" size="small" />
          </div>
          <Text as="span" variant="bodySm" fontWeight="bold">
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
  const { apiKey } = useLoaderData();
  const navigate = useNavigate();

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
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/jobs">Jobs</s-link>
          <s-link href="/app/settings">Settings</s-link>
          <s-link href="/app/plans">Plans &amp; Billing</s-link>
        </s-app-nav>
        {/* Live job progress ticker — polls /api/jobs-status every 5s when active */}
        <JobProgressTicker navigate={navigate} />
        <Outlet />
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
