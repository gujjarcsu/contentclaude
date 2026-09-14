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
 * Persistent setup card for the FAQ content this app publishes.
 *
 * App Store requirement 5.1.3: apps must ship setup instructions and a deep
 * link for app embeds. Until the merchant confirms the step is done, this card
 * stays visible; it can only be dismissed by confirming.
 *
 * P1.2 — WHICH HALF IS THE VALUE, AND WHICH HALF IS MERELY HARMLESS.
 *
 * This card used to lead with the schema and mention the visible FAQ second, in
 * subdued small text, as an optional extra. That is backwards.
 *
 * `09-DOCTRINE.md` §3 is explicit about both halves:
 *
 *   FAQPage JSON-LD  — "The rich result NO LONGER EXISTS. The markup is inert.
 *                       Emitting it is harmless; CLAIMING A BENEFIT IS NOT."
 *                       Google retired FAQ rich results from Search on
 *                       7 May 2026. Keep emitting it; remove every claim that
 *                       it improves visibility.
 *   Visible FAQ      — "THIS IS THE REAL VALUE — evidence density on the page,
 *                       and Google requires markup to match visible content.
 *                       Promote it. It is the answer-first content, not the
 *                       schema."
 *
 * So the visible FAQ block leads and the schema embed is described as what it
 * actually is. The sentence removed was: "This step adds the structured data AI
 * answer engines like ChatGPT and Perplexity can read" — an unevidenced benefit
 * claim for inert markup, which is precisely what §3 bans.
 *
 * WHY THE VISIBLE BLOCK HAS NO DEEP-LINK BUTTON YET. `faq_visible` is an app
 * BLOCK (`"target": "section"`), not an app embed (`faq_schema` is
 * `"target": "head"`), so it needs the other deep-link form:
 * `?template=product&addAppBlockId=<id>/<handle>&target=mainSection`. Shopify's
 * documentation writes that first segment as `{api_key}`, while the embed link
 * we know works uses the extension UID — and those are different values. A
 * merchant-facing button that dead-ends is worse than a written instruction, so
 * the exact click path is spelled out below and verifying the deep link is
 * routed to CW, who has a browser and a dev store. Do not guess it into place.
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
    <Banner tone="warning" title="One-time setup: put your FAQ content on your product pages">
      <BlockStack gap="300">
        <Text as="p" variant="bodyMd">
          The FAQ answers this app writes are stored on your products, but nothing shows them until you add
          them to your theme. Publishing alone doesn&apos;t make them live.
        </Text>

        <Text as="p" variant="bodyMd">
          <strong>1. Show the FAQ to shoppers</strong> — this is the part that does the work. In your theme
          editor open your <strong>product</strong> template, click <strong>Add block</strong> in the main
          product section, choose <strong>Apps</strong>, add <strong>FAQ (Navaal)</strong>, then{" "}
          <strong>Save</strong>. Your questions and answers become real page content that shoppers, and
          anything else reading the page, can see.
        </Text>

        <Text as="p" variant="bodyMd">
          <strong>2. Add the FAQ structured data</strong> (optional). The button below turns on the{" "}
          <strong>AI-search FAQ schema</strong> app embed, which adds machine-readable FAQ markup to the page.
          Worth knowing: Google retired FAQ rich results in May 2026, so this will not change how your
          pages look in Google Search. It costs nothing, and some non-Google readers of structured data
          still use it.
        </Text>

        <List type="number">
          <List.Item>Click the button below — it opens your theme editor with the embed pre-selected.</List.Item>
          <List.Item>
            Click <strong>Save</strong> in the theme editor.
          </List.Item>
          <List.Item>Come back here and click &quot;I&apos;ve enabled it&quot;.</List.Item>
        </List>
        <InlineStack gap="300">
          <Button onClick={openEditor}>
            Open theme editor
          </Button>
          <fetcher.Form method="post" action="/app/embed-status">
            <input type="hidden" name="actionType" value="confirm" />
            <Button submit loading={fetcher.state !== "idle"}>
              I&apos;ve enabled it
            </Button>
          </fetcher.Form>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
