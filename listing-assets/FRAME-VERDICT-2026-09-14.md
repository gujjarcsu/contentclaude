# Listing frames — verdict after re-capture, 2026-09-14 (CW)

All 8 re-captured on the **stocked** store with CC's `frameOnly` fix in place.
Checked three ways: full screen text (not the manifest excerpt), **form field VALUES**
(innerText does not include them — that is what hid two defects last time), and by
**looking at every PNG**.

**UPLOADED: none. 3 of 8 are usable, which is not a coherent set.**

| # | frame | demo words | app-UI only | verdict |
|---|---|---|---|---|
| 01 | Home desktop | none | yes | **HOLD** — hero reads *"Down 36 points since September 10"* |
| 02 | Review desktop | none | yes | **USABLE** |
| 03 | Products desktop | snowboard x29, Ski Wax, Oxygen, Liquid, Hydrogen, Gift Card | yes | **HOLD** — archived products still listed |
| 04 | First run (ttv-02) | Snowboard x2, Gift Card | yes | **HOLD** — ttv-02 still has the demo catalogue |
| 05 | Settings desktop | none | yes | **USABLE** |
| 06 | Home mobile | none | yes | **HOLD** — same falling score as 01 |
| 07 | Review mobile | none | yes | **USABLE** |
| 08 | Products mobile | same as 03 | yes | **HOLD** — same cause as 03 |

Shopify wants 3-6 desktop images. Usable desktop frames: **2**. So a replacement set
cannot be assembled yet, and a partial upload would leave the listing mixing new frames
with stale ones.

## What CC's `frameOnly` fix DID fix
Every frame is now the app iframe alone. The Shopify wordmark, the left nav, the store
badge and **"Sidekick conversations"** are gone from all eight — that was in every
desktop image this project ever produced, and 09-DOCTRINE section 2 names a Sidekick
reference as a Built for Shopify rejection reason for an AI app.

## The three things still in the way

**1. `app/routes/app.products.jsx` has no status filter (CC).** Blocks frames 03 and 08,
and it also puts **"Total Products 32"** on frame 01 for a store with 15 active products.
Merchant-visible, not just a fixture problem.

**2. Home's Store SEO score contradicts the app's own SEO Audit (CC).** Home: **48/100,
"Down 36 points since September 10"**. SEO Audit, same store, same moment, after a
`Run audit`: **90/100 across 15 products**. The app itself hangs a disclaimer on the gap
("Measured differently from the Store SEO score on Home, which samples a smaller set"),
but a 42-point contradiction between two hero numbers is the exact failure class
`read-screen.mjs` was written for: *"stat cards disagreeing with the tabs directly
beneath"*. Home is the number a merchant sees first, and the one a listing frame shows.
Until it agrees with the audit, frames 01 and 06 advertise a score going down.

**3. Frame 04 needs a fresh store with a real catalogue (CW/OWNER).** `navaal-qa-fresh`
has the app uninstalled; `navaal-ttv-02` renders the first-run screen correctly but on
Shopify's demo catalogue. Either stock a ttv store the way `contentpilot-dev2` was
stocked, or drop frame 04 from the set.

## Fixed this session so nobody re-finds them
- `storeName` in Settings was still **`E2E Test Store`**; now **Northline Supply**.
- Settings also carried test junk that would have been printed on a public listing image:
  `targetKeywords` = *"best mobiles in usa"*, `keyDifferentiators` = *"yes genrate now"*.
  Both replaced with copy that matches the store. Read back on a fresh load.
- The Home greeting now reads **"Welcome back, Northline Supply!"**.
