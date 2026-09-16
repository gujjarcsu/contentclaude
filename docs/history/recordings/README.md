# Recordings — what is here and what each take proves

Playwright `recordVideo` writes one `page@<hash>.webm` **per tab**. `-no-urlbar` is in every name
because Playwright cannot record the browser URL bar; the JSON `trail` is the substitute.

## H4 — PASSES, 21 s against a 120 s gate. Read from frames.

Clean take, 2026-09-16T00:09:48Z, store `navaal-qa-fresh` (Northline Supply).

| moment | at | evidence |
|---|---|---|
| Install app grant dialog first visible | **3 s** | `H4-frames-grant-1s-to-6s.png` |
| Install pressed (button shows a spinner) | 5 s | same sheet |
| App listed under Installed | 6 s | same sheet |
| App first screen, "Let's get your store found by AI", 21/100 | 12 s | tab1 |
| "2 drafts ready to review" banner | 23 s | `H4-frames-drafts-20s-to-27s.png` |
| **First generated draft text on screen** | **24 s** | same sheet |

**Grant → first draft = 21 s. Budget 120 s. Within budget, with 99 s to spare.**

Written into the JSON by hand with `verdictSource: "read from frames"`. The harness could not measure
it: **the install opened the app in a NEW tab**, and the old harness trailed only the first page, so
its trail stopped dead at `apps.shopify.com/navaal-ai-seo-geo-content` at 73 s and it returned no
verdict at all. Fixed — `record-h456.mjs` now attaches the same `framenavigated` handler to every
page via `ctx.on('page')`, tags each entry with its tab, and brackets across all of them.

**Which video is which.** `-tab1.webm` (265 s) is the one with the flow: the grant dialog, the
install, the first screen and the drafts. `-tab2.webm` (442 s) is the App Store listing page for its
whole length — the Install button is never clicked in it. Confirmed by reading contact sheets of
both at 1 frame per 10 s.

**Incidental, and it corroborates the owner's FR8 read:** at 16 s tab1 shows all three products —
Stoneware Mug 400ml, Cast Iron Skillet 26cm, Brass Watering Can 1.5L — each tagged `This product:
21/100`, identical to the store's 21/100, with the app's own line underneath: *"These 3 products all
score 21: they are missing the same things, so each one's number is the same as the store's."*

Six stray `page@*.webm` deleted with the owner's permission: four takes with no report, plus the two
now saved under their `-tab1` / `-tab2` names.

## H5, H6 — not recorded yet

See the queue for the Free-store-at-cap problem that H5 needs solved first.
