# App Store listing images: redesigned app (Nov 2026)

Six images, each exactly **1600×900**. They replace the current listing images only after
approval; the live set in `../` is untouched.

Every screen and card is a real capture of the redesigned app on the dev store
`contentpilot-dev2`, taken through the dev-only app (`shopify.app.dev.toml`) at 2x and composed
by `compose.mjs` from `specs.json`. Nothing on a screen is mocked or retouched.

The composition follows the five competitor galleries
(`docs/redesign-handoff/screenshots/competitor-listing/`):
- brand-blue field with one soft shape
- 2–5 word headline and one line
- the real screen on a clean panel
- one floating card lifted from the real UI
- one callout: an outline around a real element, labelled outside the screen

To rebuild, put fresh captures in `raw/` (names as in `specs.json`) and run
`node compose.mjs specs.json out` (needs Playwright).

## Listing rules followed

From the Shopify App Store requirements and `docs/navaal/09-DOCTRINE.md` §2:
- No browser window or desktop background in any image (4.4.4).
- Each image shows a different screen (4.4.5).
- No prices (4.2.2), statistics or outcome claims (4.3.4), reviews (4.3.6), Shopify logo or
  marks (4.4.3), or Sidekick. The admin's Sidekick bar and dev badge are cropped out.
- No "best", no rankings, traffic or revenue. "AI shopping" names the feeds the score checks.
  It is not a promise of being listed or cited.

## Images

| File | Alt text | Caption (< 100 chars) |
|---|---|---|
| `01-score-audit-1600x900.png` | Navaal audit screen with three score rings (search readiness, AI shopping eligibility, audit coverage), a breakdown by part, and a product list sorted by lowest score. | Every product scored for search and AI shopping, read from your live store. |
| `02-fix-first-1600x900.png` | Navaal home screen with the store's search readiness ring and a "What to fix first" list grouped into Critical, Needs work and Passed, each row with its own fix button. | Issues sorted by severity and checked daily, with the fix on the same row. |
| `03-ai-writing-1600x900.png` | Navaal product editor: the description currently on the store above an editable AI draft, an AI optimize button on each field, a character bar, and a Google listing preview. | Each AI draft sits beside what is live. Edit anything before it publishes. |
| `04-bulk-optimize-1600x900.png` | Navaal Optimize screen with a bulk run card (written in the background, saved as drafts, you review and publish) and a finished job at 100%. | Write for your whole catalog in the background, saved as drafts. |
| `05-review-publish-1600x900.png` | Navaal review screen with current and proposed copy side by side for each field, a content quality ring, an Approve checkbox, and Approve all. | Current and proposed side by side. Approve, edit or reject. |
| `06-ai-shopping-1600x900.png` | Navaal AI shopping eligibility ring, the fields the OpenAI product feed requires with what is missing, and home-screen rows that name each gap with a fix. | See what AI shopping feeds need from each product, and fill the gaps. |

## Known limits of these captures

- **Dev store, not a public storefront.** Shopify won't remove a development store's
  password, so a public storefront capture isn't possible here. The password and crawler rows
  this causes are kept out of every image: image 2 shows the "Needs work" tab. Recapturing on
  a live store after the merge would replace the demo catalog "Northline Supply" with real
  products; same specs, new `raw/` files.
- **Plan shown is Growth.** Optimize and bulk are paid features. For the capture, the local
  test database's plan row was set to Growth (the dev app can't take a real subscription).
  The screens are the real paid-plan screens.
- **Image 4's screen is a 1x capture** taken just before the bulk run, so the run card still
  shows its button. It's sharp at the size shown.
- **No phone version.** Shopify documents no phone-sized listing image, and none of the five
  competitors uses one.
