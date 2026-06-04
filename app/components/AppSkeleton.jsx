/**
 * Lightweight page-level skeleton shown while any data route is loading.
 * Prevents the 30-second blank-pane freeze by giving instant visual feedback.
 *
 * Usage:
 *   const navigation = useNavigation();
 *   if (navigation.state === "loading") return <AppSkeleton title="Page Title" />;
 *
 * All hooks must be called BEFORE this early return.
 */
import {
  SkeletonPage,
  SkeletonDisplayText,
  SkeletonBodyText,
  Card,
  BlockStack,
  Box,
  Layout,
} from "@shopify/polaris";

export function AppSkeleton({ title = "", sections = 2, layout = "full" }) {
  if (layout === "twoThird") {
    return (
      <SkeletonPage title={title} primaryAction>
        <Layout>
          <Layout.Section>
            {Array.from({ length: sections }).map((_, i) => (
              <Box key={i} paddingBlockEnd="400">
                <Card>
                  <SkeletonDisplayText size="small" />
                  <Box paddingBlockStart="400">
                    <SkeletonBodyText lines={4} />
                  </Box>
                </Card>
              </Box>
            ))}
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <SkeletonDisplayText size="small" />
              <Box paddingBlockStart="400">
                <SkeletonBodyText lines={6} />
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  return (
    <SkeletonPage title={title} primaryAction>
      <BlockStack gap="400">
        {Array.from({ length: sections }).map((_, i) => (
          <Card key={i}>
            <SkeletonDisplayText size="small" />
            <Box paddingBlockStart="400">
              <SkeletonBodyText lines={i === 0 ? 3 : 5} />
            </Box>
          </Card>
        ))}
      </BlockStack>
    </SkeletonPage>
  );
}
