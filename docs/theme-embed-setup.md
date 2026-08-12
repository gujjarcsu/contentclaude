# Enabling FAQ content on your storefront

Navaal writes your FAQ content as structured data (FAQPage JSON-LD) to a
product metafield when you publish, and can also render it as real,
visible FAQ copy on the product page. Two separate theme-editor steps
control these — both are off by default in every Shopify theme.

**Note (August 2026):** Google retired FAQ rich results from Search on
7 May 2026, so FAQPage schema no longer earns a special result in Google
Search. AI answer engines (ChatGPT, Perplexity, Gemini, Google AI
Overviews) can still read structured data, but the stronger signal for
being cited by any of them is real, visible on-page content — which is
why step 2 (the visible FAQ block) is recommended for every product, not
just the JSON-LD in step 1.

## Step 1 — Enable the JSON-LD app embed (structured data)

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

## Step 2 — Add the visible FAQ block (recommended, on-page content)

1. In the theme editor, open a product template (Templates > Products, or
   click a product page while customizing).
2. Select the product information section, click **Add block**, and choose
   **FAQ (Navaal)**.
3. Optionally edit the block's heading text.
4. Click **Save**.

This renders each published product's FAQ as a normal, readable accordion
on the page — using the same content as the JSON-LD, so the structured
data and the visible copy always match.

## Verifying it works

1. Publish FAQ content for any product in Navaal.
2. Open that product's page on your live storefront.
3. You should see the FAQ block rendered on the page (if you added it in
   step 2).
4. View the page source and search for `application/ld+json` — you should
   see a `FAQPage` block containing your questions and answers.

Google's Rich Results Test no longer validates FAQPage markup (support was
removed in June 2026 along with the feature), so it isn't a useful check
here — the two steps above are what actually matter now.

## Troubleshooting

- **No JSON-LD on the page?** Confirm the embed is enabled on the theme
  that is currently **published** (the editor defaults to the published
  theme, but check if you use multiple themes).
- **No visible FAQ section?** Confirm you completed step 2 — the block has
  to be added to the product template separately from the embed in step 1.
- **Enabled but still nothing?** Both only render for products whose FAQ
  content has been **published** in Navaal (drafts don't emit anything).
- Still stuck? Email us at hello@navaal.ai.
