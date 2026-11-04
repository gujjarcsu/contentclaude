# App Store listing frames — redesigned app (Nov 2026)

Six desktop frames, each exactly **1600×900** (the size the listing editor accepts, see
`../README.md`). Each pairs a short headline and one line with a crop of the real redesigned
screen, captured on the dev store `contentpilot-dev2` through the dev-only app
(`shopify.app.dev.toml`). `render.mjs` rebuilds them from fresh captures; its paths point at
the capture session's scratch folder and need adjusting before reuse.

Listing rules these follow (`docs/navaal/09-DOCTRINE.md` §2): no statistics, no superlatives,
no reviews, no prices, no Shopify marks, no Sidekick icon, no purple for AI. The admin's
Sidekick bar is cropped out of every frame.

| File | Caption (< 100 chars) | Ready |
|---|---|---|
| `01-home-1600x900.png` | See your score and what to fix first, product by product. | Yes. Dev-store rows show a password-protected storefront; recapture on a public store if possible. |
| `02-audit-1600x900.png` | Every gap in your catalog, and the products behind it. | Yes |
| `03-editor-1600x900.png` | Your current copy beside the proposed copy, field by field. | **No.** The draft shown is test text, shorter than the store's copy. Recapture after a real generation. |
| `04-review-1600x900.png` | Nothing goes live until you approve it. | **No.** Same reason; the drafts score lower than the current copy. |
| `05-products-1600x900.png` | Every product, its score and its next step. | Yes. Stronger once some content is published (strip shows 0). |
| `06-settings-1600x900.png` | Set your brand voice once. Every draft is written in it. | Yes. Fill "Target audience" before recapturing. |

What each frame does not claim: no rankings, traffic or revenue; "AI shopping" names the
feeds the score checks, not a promise of being listed or cited.
