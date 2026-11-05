/**
 * BlogParts — pieces shared by the Blog and Blog posts screens
 * (redesign v2, Nov 2026; SEOWILL 128/132, Avada 046).
 *
 * BlogTabs: "Write · Posts n" across the top of both screens, the category's
 * tabs-with-a-count. BlogEmpty: the empty state draws a blog post, as the
 * category's empty states draw their feature, with one action.
 */
import { BlockStack, InlineStack, InlineGrid, Box, Card, Text, Button, Tabs } from "@shopify/polaris";
import { useT } from "../i18n/react.jsx";
import { IlluBlog } from "./Illustrations.jsx";

/**
 * @param {object} props
 * @param {"write"|"posts"} props.selected
 * @param {number} props.postCount  every saved post, drafts and published
 * @param {(path: string) => void} props.navigate
 */
export function BlogTabs({ selected, postCount, navigate }) {
  const t = useT();
  const tabs = [
    { id: "write", content: t("Write"), panelID: "blog-write" },
    { id: "posts", content: t("Posts"), badge: t.number(postCount ?? 0), panelID: "blog-posts" },
  ];
  return (
    <Tabs
      tabs={tabs}
      selected={selected === "posts" ? 1 : 0}
      onSelect={(i) => navigate(i === 1 ? "/app/blog/posts" : "/app/blog")}
    />
  );
}

/** A drawing of a post, a heading, one line and one action. */
export function BlogEmpty({ heading, body, actionLabel, onAction }) {
  return (
    <Card>
      <Box paddingBlock="600" paddingInline="400">
        <InlineGrid columns={{ xs: 1, md: "auto 1fr" }} gap="600" alignItems="center">
          <InlineStack align="center">
            <IlluBlog width={200} />
          </InlineStack>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              {heading}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {body}
            </Text>
            {actionLabel ? (
              <InlineStack>
                <Button variant="primary" onClick={onAction}>
                  {actionLabel}
                </Button>
              </InlineStack>
            ) : null}
          </BlockStack>
        </InlineGrid>
      </Box>
    </Card>
  );
}
