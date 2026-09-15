# Listing asset check — 2026-09-14 (CW)

Re-captured 7 of 8 frames on `contentpilot-dev2` from the current build, then checked
each one properly. **All 8 fail. Do not upload any of them.**

## Method (and why the last check passed something it should not have)
The previous check grepped `manifest.json` excerpts. Each excerpt is the first 140
characters of the screen, which stops above the product lists — so it reported zero
demo-store words on frames that are full of them. This check reads the WHOLE screen
text via `tools/proof/read-screen.mjs`, and then LOOKS at the PNG.

## Full-screen-text banned-word counts (contentpilot-dev2, 2026-09-14)
| screen | frames | hits |
|---|---|---|
| /app | 01, 06 | Snowboard x4, Liquid, Gift Card, "E2E Test Store" |
| /app/review | 02, 07 | Snowboard x22, Gift Card x5, "E2E Test Store" x2 |
| /app/products | 03, 08 | snowboard x29, Ski Wax, Selling Plans, Oxygen, Liquid, Hydrogen, Gift Card |
| /app/settings | 05 | 0 in innerText — BUT SEE BELOW |

## What only looking at the image caught
1. **Every DESKTOP frame is the whole Shopify admin, not the app.** Shopify wordmark,
   the entire left nav, the store badge and **"Sidekick conversations"** are in all of
   them. 09-DOCTRINE.md section 2 names a Sidekick reference as a Built-for-Shopify
   rejection reason for an AI app. Cause: `tools/proof/listing-assets.mjs`
   `const target = f.frameOnly ? await frame.frameElement() : page;`
   — `frameOnly: true` is set only on the three MOBILE frames.
2. **Each desktop image contradicts itself**: admin badge "Northline Supply",
   app hero "Welcome back, E2E Test Store!".
3. **05-settings is NOT clean.** The Store Name input holds the value `E2E Test Store`.
   innerText does not include form field values, so a text-only check understates this.

## 04-start-desktop.png
Not captured. `navaal-qa-fresh` has the app UNINSTALLED (0 iframes in the DOM).
On `navaal-ttv-02`, where it is installed, the first-run screen renders correctly
(34/100, "Your starting score", 3 drafts) but the harness guard `/scores \d+\/100/i`
no longer matches the current copy. THE GUARD IS STALE, NOT THE SCREEN. Not loosened
here — routed to CC. The manifest now records 04 as ok:false with that error, so it no
longer points at a file that does not exist.

## What has to change before ANY of this can be uploaded
- desktop frames must screenshot the app iframe only (`frameOnly` on all frames), and
- a dev store with a plausible non-demo catalogue, and
- the app's stale shop-name greeting fixed (it shows the name captured at install).
