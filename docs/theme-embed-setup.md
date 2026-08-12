# Enabling the "AI-search FAQ schema" app embed

Navaal writes your FAQ content as structured data (FAQPage JSON-LD) to a
product metafield when you publish. For that structured data to actually
appear on your storefront — where Google, ChatGPT, Perplexity, and other AI
answer engines can read it — you must enable Navaal's app embed in your
theme. **App embeds are off by default in every Shopify theme.**

This is a one-time step and takes under a minute.

## Steps

1. In the Navaal app, click **Open theme editor** on the setup card
   (Dashboard or Review & Publish page). This opens your theme editor with
   the embed pre-selected.

   Direct link (replace `your-store` with your store's domain):

   ```
   https://your-store.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4/faq_schema
   ```

2. In the theme editor's left sidebar you'll see **App embeds** with
   **AI-search FAQ schema** toggled on (pending save).

3. Click **Save** in the top right.

4. Back in Navaal, click **"I've enabled it"** on the setup card.

## Verifying it works

1. Publish FAQ content for any product in Navaal.
2. Open that product's page on your live storefront.
3. View the page source and search for `application/ld+json` — you should
   see a `FAQPage` block containing your questions and answers.
4. Optionally, paste the product URL into Google's
   [Rich Results Test](https://search.google.com/test/rich-results) and
   confirm it detects **FAQ** structured data.

## Troubleshooting

- **No JSON-LD on the page?** Confirm the embed is enabled on the theme
  that is currently **published** (the editor defaults to the published
  theme, but check if you use multiple themes).
- **Enabled but still nothing?** The schema only renders on product pages
  for products whose FAQ content has been **published** in Navaal (drafts
  don't emit schema).
- Still stuck? Email us at hello@navaal.ai.
