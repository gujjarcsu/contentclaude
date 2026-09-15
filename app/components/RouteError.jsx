import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router";
import { useT } from "../i18n/react.jsx";
import { I18nContext } from "../i18n/react.jsx";
import { Component } from "react";
import { Page, Banner, Text } from "@shopify/polaris";

/**
 * Data-layer error boundary (React Router loaders/actions throwing).
 * Usage at bottom of any route file:
 *   export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
 */
export function RouteError() {
  const t = useT();
  const error = useRouteError();
  const navigate = useNavigate();

  const status = isRouteErrorResponse(error) ? error.status : null;
  const is404 = status === 404;
  const is401 = status === 401 || status === 403;

  const title = is404
    ? "Page not found"
    : is401
      ? "Session expired — please re-authenticate"
      : "An unexpected error occurred";

  const message = is404
    ? "This product or page doesn't exist. It may have been deleted from your Shopify store."
    : is401
      ? "Your session has expired. Click below to log back in — your data is safe."
      : `Something went wrong on our end.${error?.message ? ` Details: ${error.message}` : ""} Please try refreshing the page.`;

  const action = is404
    ? { content: t("Back to Products"), onAction: () => navigate("/app/products") }
    : is401
      ? {
          // 2.1.1: never send an embedded merchant to the /auth/login form (a
          // dead-end inside the admin). Re-enter the app at /app with the current
          // embedded params — the app re-authenticates silently via token
          // exchange / the App Bridge bounce.
          content: t("Re-authenticate"),
          onAction: () => {
            const search = typeof window !== "undefined" ? window.location.search : "";
            if (typeof window !== "undefined") window.location.href = `/app${search}`;
          },
        }
      : { content: t("Back to Dashboard"), onAction: () => navigate("/app") };

  return (
    <Page>
      <Banner tone={is404 ? "warning" : "critical"} title={title} action={action}>
        <Text as="p" variant="bodyMd">
          {message}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {t("Still stuck? Email us at")} <a href="mailto:hello@navaal.ai">hello@navaal.ai</a> {t("— include what you were doing when this happened and we'll sort it out.")}
        </Text>
      </Banner>
    </Page>
  );
}

/**
 * React class-based render error boundary.
 * Catches JS errors during render that React Router's ErrorBoundary cannot.
 * Usage in app.jsx: wrap <Outlet /> with <AppRenderBoundary>
 */
export class AppRenderBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  static contextType = I18nContext;

  render() {
    if (!this.state.hasError) return this.props.children;
    const t = this.context;
    return (
      <Page>
        <Banner
          tone="critical"
          title={t("A component crashed unexpectedly")}
          action={{ content: t("Reload page"), onAction: () => window.location.reload() }}
          secondaryAction={{ content: t("Try again"), onAction: this.reset }}
        >
          <Text as="p" variant="bodyMd">
            {this.state.error?.message ?? "An unexpected rendering error occurred."}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {t("If this keeps happening, email us at")} <a href="mailto:hello@navaal.ai">hello@navaal.ai</a> {t("and we'll fix it.")}
          </Text>
        </Banner>
      </Page>
    );
  }
}
