import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router";
import { Page, Card, BlockStack, Text, Button, InlineStack, Box } from "@shopify/polaris";
import { AlertCircle } from "lucide-react";

/**
 * Drop-in ErrorBoundary for any route.
 * Usage at bottom of any route file:
 *   export { RouteError as ErrorBoundary } from "../components/RouteError";
 */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Something went wrong";
  let message = "An unexpected error occurred. Please try again.";
  let status = null;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = "Page not found";
      message = "The page you're looking for doesn't exist or has been moved.";
    } else if (error.status === 403) {
      title = "Access denied";
      message = "You don't have permission to view this page.";
    } else if (error.status >= 500) {
      title = "Server error";
      message = "Something went wrong on our end. Please try refreshing the page.";
    } else {
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = error.message || message;
  }

  return (
    <Page backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}>
      <Card>
        <BlockStack gap="400" inlineAlign="center">
          <Box paddingBlockStart="400">
            <AlertCircle size={40} color="#D82C0D" />
          </Box>
          <BlockStack gap="200" inlineAlign="center">
            <Text as="h1" variant="headingLg" alignment="center">{title}</Text>
            {status && (
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">Error {status}</Text>
            )}
            <Text as="p" variant="bodyMd" tone="subdued" alignment="center">{message}</Text>
          </BlockStack>
          <InlineStack gap="300">
            <Button onClick={() => navigate("/app")}>Go to Dashboard</Button>
            <Button variant="plain" onClick={() => window.location.reload()}>Refresh page</Button>
          </InlineStack>
          <Box paddingBlockEnd="400" />
        </BlockStack>
      </Card>
    </Page>
  );
}
