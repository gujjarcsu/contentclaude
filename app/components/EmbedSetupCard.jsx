import { useFetcher } from "react-router";
import { Banner, BlockStack, Text, InlineStack, Button, List } from "@shopify/polaris";

// The theme editor deep link that opens App embeds with our FAQ-schema embed
// pre-activated (merchant just clicks Save). uid from
// extensions/geo-schema/shopify.extension.toml; block handle = the liquid
// filename in extensions/geo-schema/blocks/.
const EMBED_EXTENSION_UID = "6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4";
const EMBED_BLOCK_HANDLE = "faq_schema";

export function embedDeepLink(shopDomain) {
  return `https://${shopDomain}/admin/themes/current/editor?context=apps&activateAppId=${EMBED_EXTENSION_UID}/${EMBED_BLOCK_HANDLE}`;
}

/**
 * Persistent setup card for the "AI-search FAQ schema" theme app embed.
 *
 * The FAQ JSON-LD this app writes only reaches the storefront once the
 * merchant enables the app embed in their theme — it is OFF by default.
 * Until they confirm it's on, this card stays visible (App Store
 * requirement 5.1.3: apps must ship setup instructions and a deep link for
 * app embeds). It can only be dismissed by confirming the step is done.
 */
export function EmbedSetupCard({ shopDomain, confirmed }) {
  const fetcher = useFetcher();
  // Optimistic: hide as soon as the confirm post is in flight
  if (confirmed || fetcher.formData?.get("actionType") === "confirm") return null;

  const openEditor = () => {
    // Embedded apps live in an iframe — the theme editor must open in the
    // top-level admin window.
    window.open(embedDeepLink(shopDomain), "_top");
  };

  return (
    <Banner tone="warning" title="One-time setup: turn on the AI-search FAQ schema">
      <BlockStack gap="300">
        <Text as="p" variant="bodyMd">
          Your published FAQ content only appears to Google, ChatGPT, and Perplexity after you
          enable the <strong>AI-search FAQ schema</strong> app embed in your theme. It&apos;s off by
          default — publishing alone doesn&apos;t make it live.
        </Text>
        <List type="number">
          <List.Item>Click the button below — it opens your theme editor with the embed pre-selected.</List.Item>
          <List.Item>Click <strong>Save</strong> in the theme editor.</List.Item>
          <List.Item>Come back here and click &quot;I&apos;ve enabled it&quot;.</List.Item>
        </List>
        <InlineStack gap="300">
          <Button variant="primary" onClick={openEditor}>Open theme editor →</Button>
          <fetcher.Form method="post" action="/app/embed-status">
            <input type="hidden" name="actionType" value="confirm" />
            <Button submit loading={fetcher.state !== "idle"}>I&apos;ve enabled it</Button>
          </fetcher.Form>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
