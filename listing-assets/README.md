# App Store listing assets — captured from the current build

**Do not upload from here without reading "Two gaps" at the bottom.** Two of the eight frames are not
ready, and one of the ready ones carries a placeholder store name.

## Why these exist

The live listing shows the **pre-Phase-2 app**: a dark gradient hero, a thirteen-item sidebar, and a
button called "Optimise Store". None of that exists any more. Every merchant who reaches the listing sees
five pictures of software they will not receive, and then installs something different — a conversion
leak on the one surface every single install passes through.

These are captured from production by `tools/proof/listing-assets.mjs`, on a dev store with 17 real
products and 13 products of published content, so the screens are populated rather than empty.

## The frames

Captured against deploy `0740f67`. Sizes are 2× (deviceScaleFactor 2), so a 1600×900 frame is a
3200×1800 PNG — which is what Shopify wants for a crisp listing.

| # | File | Slot | Caption (< 100 chars) |
|---|---|---|---|
| 1 | `01-home-desktop.png` | Desktop 1 | `See what is live, what is waiting for you, and what to do next.` |
| 2 | `02-review-desktop.png` | Desktop 2 | `Your current copy beside the proposed copy. Nothing goes live until you approve it.` |
| 3 | `03-products-desktop.png` | Desktop 3 | `Every product, and exactly where it stands. Generate one or hundreds.` |
| 4 | `04-start-desktop.png` | Desktop 4 | `We score your store on install, then write the three products holding it back.` |
| 5 | `05-settings-desktop.png` | Desktop 5 | `Set your brand voice once. Every description is written in it.` |
| 6 | `06-home-mobile.png` | Mobile 1 | `The whole app works on your phone.` |
| 7 | `07-review-mobile.png` | Mobile 2 | `Approve drafts from anywhere.` |
| 8 | `08-products-mobile.png` | Mobile 3 | `Your catalog and its status, on a phone.` |

Captions are US English (`catalog`, not `catalogue`), no jargon, and every one of them describes
something visible in its own frame.

### What each caption is careful NOT to claim

The app cannot promise rankings, traffic or revenue, so no caption mentions them. "Written for AI search"
appears in the product itself where it is explained; a caption is too short to explain it, and an
unexplained claim is one a merchant cannot check.

- Caption 2 says "Nothing goes live until you approve it" — true, and the confirm is in the frame.
- Caption 4 says "score your store" — the number is computed from the merchant's own catalog and is
  shown in the frame.
- Caption 6-8 say the app works on a phone; the frames are 375px captures, which is the narrowest width
  Shopify's admin supports.

## How they were captured

```bash
node tools/proof/listing-assets.mjs        # all frames
node tools/proof/listing-assets.mjs 03     # just the ones matching "03"
```

The harness refuses to write a frame unless the app's own iframe exists (no `mainFrame()` fallback), the
frame is not a 4xx page, the frame contains a string only that screen renders, and the PNG is a plausible
size and not byte-identical to another frame in the run. `manifest.json` records what was on screen for
each one.

**Those four guards are still not proof.** They caught a real failure on this run — the first-run frame
was captured against a store with no products and the harness accepted the empty state, because the
"is this the right screen" pattern was loose enough to match it. The guard was tightened; the point is
that a guard which would print the same thing when the capture is useless is decorative. Every frame here
was looked at.

## Two gaps — read before uploading

### 1. `04-start-desktop.png` is NOT captured

The first-run Start state only renders while a shop has never seen a draft, and it is only worth
photographing on a shop that has products. Right now no store is in both states: the populated dev store
has passed its first run, and the fresh store has no products. The harness **refuses** to substitute the
empty state, which is why there are seven files and not eight.

This is one action away and it is already on the list: **HUMAN-NEEDED item 9** asks for five fresh
dev-store installs to produce the time-to-first-value number. Any one of those installs, on a store with
at least ten products, is this screenshot. Run this while it is on screen:

```bash
FRESH_STORE=<that-store-handle> node tools/proof/listing-assets.mjs 04
```

### 2. The store is called "E2E Test Store" in frames 1 and 6

The Home hero greets the merchant by their store name, and this dev store's brand-voice name is literally
`E2E Test Store`. It is honest, and it looks like what it is. Frames 2, 3, 5, 7 and 8 are unaffected.

Fixing it is a settings change on the dev store, not a code change, and it is deliberately left to a
human — an agent rewriting store records to make a screenshot look better is not a habit worth having:

1. Open the app on `contentpilot-dev2` → **Settings** → **Brand voice** → **Store name**
2. Set something plausible for the catalog, e.g. `Alpine Supply Co.`
3. Save, then re-capture just the two affected frames:
   ```bash
   node tools/proof/listing-assets.mjs 01
   node tools/proof/listing-assets.mjs 06
   ```
4. Set the name back afterwards if you want the e2e suite's fixture unchanged.

## One thing the brief asked for that is not here yet

The brief asks for Home **"with the SEO score"**. Home does not show a store SEO score yet — that is
**Phase 4 item 4.3** ("Store SEO score 61 → 84 since install"), which is two items away in the current
order. Frame 1 shows the state-driven primary action and the live/draft/needs-content counts, which is
the rest of what was asked.

**Re-capture frame 1 after 4.3 ships.** The score is the single most persuasive thing this app can put in
a listing image, and the frame is worth redoing for it.
