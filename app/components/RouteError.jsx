import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router";
import { Component } from "react";
import { Page, Banner, Text } from "@shopify/polaris";

/**
 * Data-layer error boundary (React Router loaders/actions throwing).
 * Usage at bottom of any route file:
 *   export { RouteError as ErrorBoundary } from "../components/RouteError";
 */
export function RouteError() {
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
    ? { content: "← Back to Products", onAction: () => navigate("/app/products") }
    : is401
    ? { content: "Re-authenticate", onAction: () => { window.location.href = "/auth/login"; } }
    : { content: "← Back to Dashboard", onAction: () => navigate("/app") };

  return (
    <Page>
      <Banner tone={is404 ? "warning" : "critical"} title={title} action={action}>
        <Text as="p" variant="bodyMd">{message}</Text>
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

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Page>
        <Banner
          tone="critical"
          title="A component crashed unexpectedly"
          action={{ content: "Reload page", onAction: () => window.location.reload() }}
          secondaryAction={{ content: "Try again", onAction: this.reset }}
        >
          <Text as="p" variant="bodyMd">
            {this.state.error?.message ?? "An unexpected rendering error occurred."}
          </Text>
        </Banner>
      </Page>
    );
  }
}
