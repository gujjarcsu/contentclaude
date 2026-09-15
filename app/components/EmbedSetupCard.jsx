import { useState } from "react";
import { useFetcher } from "react-router";
import { Banner, BlockStack, Text, InlineStack, Button, List } from "@shopify/polaris";

// The theme editor deep link that opens App embeds with our FAQ-schema embed
// pre-activated (merchant just clicks Save). uid from
// extensions/geo-schema/shopify.extension.toml; block handle = the liquid
// filename in extensions/geo-schema/blocks/.
const EMBED_EXTENSION_UID = "6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4";
const EMBED_BLOCK_HANDLE = "faq_schema";

/**
 * C1 — the app's client_id, which is what the APP BLOCK deep link wants.
 *
 * The two deep links take DIFFERENT identifiers, which is the whole reason this
 * sat unresolved:
 *
 *   app EMBED (faq_schema, target "head")   -> activateAppId=<extension UID>
 *   app BLOCK (faq_visible, target "section") -> addAppBlockId=<app client_id>
 *
 * Shopify's own documentation writes the second as `{api_key}` while the embed
 * link we already had working uses the extension UID, and they are different
 * values. I would not guess between them, so it was routed — and CW opened both
 * in a real theme editor and photographed the result:
 * `docs/history/screen-reads/deeplink-app-client_id.png` works,
 * `deeplink-extension-UID.png` does not.
 *
 * This is the string that was PROVED. Do not re-derive it and do not "tidy" it.
 */
const APP_CLIENT_ID = "1279a14cca41d4a6f8e6e3c485870b77";
const VISIBLE_BLOCK_HANDLE = "faq_visible";

export function embedDeepLink(shopDomain) {
  return `https://${shopDomain}/admin/themes/current/editor?context=apps&activateAppId=${EMBED_EXTENSION_UID}/${EMBED_BLOCK_HANDLE}`;
}

/**
 * Opens the theme editor on the product template with the visible FAQ block
 * ready to add. This is the half that does the work (09-DOCTRINE.md §3: the
 * visible FAQ is the real value; the JSON-LD is inert since Google retired FAQ
 * rich results on 7 May 2026).
 */
export function visibleBlockDeepLink(shopDomain) {
  return `https://${shopDomain}/admin/themes/current/editor?template=product&addAppBlockId=${APP_CLIENT_ID}/${VISIBLE_BLOCK_HANDLE}&target=mainSection`;
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
 * THE VISIBLE BLOCK NOW HAS A BUTTON (C1). It did not, and the reason is worth
 * keeping: `faq_visible` is an app BLOCK (`"target": "section"`) while
 * `faq_schema` is an app EMBED (`"target": "head"`), and the two deep links take
 * DIFFERENT identifiers — `addAppBlockId=<app client_id>` against
 * `activateAppId=<extension UID>`. Shopify's documentation writes the first as
 * `{api_key}`, which is neither obviously one nor the other. Rather than guess
 * between them and ship a button that dead-ends, it was routed; CW opened both
 * in a real theme editor and photographed the outcome. See
 * `visibleBlockDeepLink` above for which one won.
 */
export function EmbedSetupCard({ shopDomain, confirmed }) {
  const fetcher = useFetcher();
  // Optimistic: hide as soon as the confirm post is in flight
  if (confirmed || fetcher.formData?.get("actionType") === "confirm") return null;

  const openVisibleBlock = () => {
    // Same reason as below: the theme editor must open in the top-level admin
    // window, not inside our iframe.
    window.open(visibleBlockDeepLink(shopDomain), "_top");
  };

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
          <strong>1. Show the FAQ to shoppers</strong> — this is the part that does the work. The button
          below opens your theme editor with the <strong>FAQ (Navaal)</strong> block ready to add to your
          product template; click <strong>Save</strong> there. Your questions and answers become real page
          content that shoppers, and anything else reading the page, can see.
        </Text>

        <Text as="p" variant="bodyMd">
          <strong>2. Add the FAQ structured data</strong> (optional). The button below turns on the{" "}
          <strong>AI-search FAQ schema</strong> app embed, which adds machine-readable FAQ markup to the page.
          Worth knowing: Google retired FAQ rich results in May 2026, so this will not change how your
          pages look in Google Search. It costs nothing, and some non-Google readers of structured data
          still use it.
        </Text>

        <List type="number">
          <List.Item>
            Press a button below — each one opens your theme editor with that piece ready to add.
          </List.Item>
          <List.Item>
            Click <strong>Save</strong> in the theme editor.
          </List.Item>
          <List.Item>Come back here and click &quot;I&apos;ve enabled it&quot;.</List.Item>
        </List>
        <InlineStack gap="300">
          {/*
            NOT variant="primary": this card sits inside a page that already has
            one, and tests/routes/primaryActions.test.js exists because six
            primaries once appeared at once for the merchant least able to tell
            them apart. Order carries the emphasis instead — the visible FAQ
            comes first because it is the half that does the work.
          */}
          <Button onClick={openVisibleBlock}>
            Add the FAQ to my product pages
          </Button>
          <Button onClick={openEditor}>
            Turn on the FAQ schema
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

/**
 * Phase 12 A4 — before the first publish there is nothing for the theme block
 * to show, so the setup card would be a chore in front of a result. One line,
 * dismissible for this visit; the full card takes over after the first publish.
 */
export function EmbedLaterNote({ confirmed }) {
  const [dismissed, setDismissed] = useState(false);
  if (confirmed || dismissed) return null;
  return (
    <Banner tone="info" onDismiss={() => setDismissed(true)}>
      <Text as="p" variant="bodySm">
        Later, once you publish: a two-minute theme step puts the FAQ answers on your product pages. We will show it here
        when there is something to show.
      </Text>
    </Banner>
  );
}
