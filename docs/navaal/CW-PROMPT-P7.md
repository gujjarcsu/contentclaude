# CW — PHASE 7 BRIEF, THIRD PASS: THE CAPTURE IS OPEN, AND FIVE READS NOBODY HAS DONE

Paste this whole file. It replaces the previous `CW-PROMPT-P7.md` in full. One current brief per
worker. It is long on purpose: every gate you were waiting on has opened, and the remaining work is
mostly eyes-on-screen, which is yours.

---

## WHAT CHANGED SINCE YOUR REPORT — read this, it re-orders your day

| | Was | Now |
|---|---|---|
| **P0** | open; exposure unknown | **CLOSED at `cad2f10`.** A5 read **every** `faq_schema` metafield on every installed shop since 2 July: **5 metafields, 25 question/answer pairs, zero markup.** The hole existed for 74 days and was never exercised. Nothing to disclose. The dev2 storefront password is now optional evidence, not a blocker. |
| **Part B** (the screen that could not count) | blocked on CC | **LIVE at `3e1c161`** — one population per screen, the content record joined to product status, the greeting taken from Shopify's own name. CC posted its readings for you at the end of the queue. **Task 5 is unblocked.** |
| **Part C** (review ask) | CC to build | Already existed and meets all five rules; CC pinned them as tests at `e40aee6`. |
| **Price cards** | your edit | Cowork's cache-busted read at 07:33: `save 17%` 0 · `save 20%` 3 · `7-day` 0 · `14-day` 6 · `95.90` 1 · `767.90` 1. Your standing expect-value `save 20% = 3` is adopted. |
| **B8** | owner item | **Closed by your Task 3.** `contentpilot-dev2`, `(Test)`, 27 Aug, never cancelled. Owner checklist updated. |
| **Subtitle** | your flag | **Decided: keep.** Third-party names allowed descriptively, never as endorsement, never as a logo. Recorded in `04-DECISIONS.md`. |
| **Production** | `3e1c161` | **`e40aee6`**, 255 columns, healthy. Re-read mid-session; it has moved four times today. |

Two things from your report that are now facts in the plan: the scoreboard's real-merchant count is
**2** (Zephyrine Wynter, Peter Shops), and Hoodify's **one-minute** uninstall with reason *"Testing
multiple apps"* is the first recorded first-run churn event — exactly what P2.7 exists to fix.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `06-QUEUE.md` from `## PHASE 7 — CW` to the end (CC's Part B readings are
the last rows) · `12-OFFER.md` §4 · `11-MASTERPLAN.md` §6 (Track B) and §7 (scoreboard).
`curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"`.

**Store rules for today:** `contentpilot-dev2` is frozen by your own declaration until you post
`CAPTURE COMPLETE`. `navaal-qa-fresh` has the app **uninstalled** and is yours to install on for
Task 1. **EBS, `askebs.com.au`, `elitepeps`: read-only, always.** The two real merchants' stores:
**public pages only, never their admin, never contact.**

---

## TASK 1 — THE FIRST RUN, WALKED AS A MERCHANT. DO THIS BEFORE THE CAPTURE.

`11-MASTERPLAN.md` B0.3: *"Watch every first run and write down what they did not understand. Ten
merchants confused by the same screen outranks a hundred backlog items."* Nobody has done one since
the Phase-5 rebuilds, and P2.7 — the 60-second first run — is about to be built on assumptions.

On `navaal-qa-fresh` (app uninstalled, a clean first run), install from the **App Store listing**
the way a merchant would — not from the Partner Dashboard — and walk it with a stopwatch:

1. **Time it.** Install click → OAuth grant → first screen → first proposal visible. Record each
   timestamp. The last one is time-to-value and it goes on the scoreboard.
2. **Read every screen verbatim as it appears**, in order, including anything that says
   **"Welcome back"** to a merchant who has never been here (frame 04's nameless greeting lives on
   this path — if it appears, quote it and the URL).
3. **Write down every moment you had to stop and think.** Not bugs — *confusion*. A label you had
   to read twice. A number you could not reconcile. A button whose result you could not predict.
   A screen with nothing to do. This list is the deliverable.
4. **The trial.** Go to Plans, pick **Growth**, and read Shopify's own charge-approval page
   verbatim — the amount, the interval, the trial length. That page is rendered by Shopify from
   `billing.request()`: it is **the fourth home of the price**, and nobody has read it since the
   pricing lock. Expect `$29.99 every 30 days` and a **14-day** trial. **Then back out. Do not
   approve** — it would be a Test charge and harmless, but it would also create another "active
   paid plan" row of the kind B8 just spent a day chasing.
5. Follow the defaults as a merchant would: let it scan, look at what it proposes, approve **one**
   product's content, publish it, and look at what Home says afterwards. Read the numbers.
6. Leave the store in that state — installed, one product published, the rest as the app left
   them. That is what frame **04** should be captured from: a real first-run screen, on a store
   with a real name.

Write it up as `docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md`: the timeline, the
verbatim screens, the confusion list, and the Shopify charge page quote. Post the confusion list to
the queue for CC under a heading of its own.

---

## TASK 2 — THE CAPTURE. THE LAST ONE, IF THE STORE STAYS FROZEN.

1. Re-read `/api/build-info`. `3e1c161` or later must be **live**.
2. On `contentpilot-dev2`, re-read Home and Products against your 28-row table's "Real" column and
   CC's posted readings. The four populations must now agree: **15** non-archived, **14 active +
   1 draft**, no count larger than the catalogue, `AI Content Published` labelled for what it
   counts. **If any number still contradicts the catalogue, do not capture — post the numbers and
   stop.** A frame with a wrong number on it is a listing image that lies.
3. Capture: **01/06 Home, 02/07 Review, 03/08 Products, 05 Settings from `contentpilot-dev2`; 04
   First run from `navaal-qa-fresh`** in the state Task 1 left it. Nothing else touches either store
   during capture.
4. **Look at every PNG.** One sentence per frame: usable or not, and precisely why not. Check for:
   any Shopify admin chrome or Sidekick glyph; demo/test words; contradictory numbers; a nameless
   greeting; a red score or warning banner dominating the frame; PII; pricing.
5. Upload only with **≥3 clean desktop frames** (Shopify wants 3–6). Captions from `12-OFFER.md` §4
   language only. Read the live listing back on a fresh load and confirm the images showing are
   the ones you uploaded.
6. Post `CAPTURE COMPLETE`. The freeze on dev2 lifts.

---

## TASK 3 — THE TWO REAL MERCHANTS, FROM THE PUBLIC WEB ONLY

A5 says no harm was possible. What we still do not know is whether **any real merchant uses the
theme extension at all**, and that decides how much Phase 2 should lean on it.

For **Zephyrine Wynter** and **Peter Shops**: find the storefront domain (the Partner Dashboard's
merchant list, or the store name on the open web — do not guess a `.myshopify.com` and do not try
passwords). Then, on the **public** storefront only:

- Is it live, or password-protected / not launched?
- On one product page, view source: is our FAQ block markup present (`navaal-faq` class, or a
  FAQPage JSON-LD whose text matches our generated style)? Present / absent / could not read.
- Does the product content look like it has been through the app (descriptions, meta title
  pattern)? Say what you see; do not conclude more than the page shows.

**Never log in, never use the admin, never contact them.** Names stay in the queue and
`docs/history/`. This is a read, and it produces one line per merchant.

---

## TASK 4 — WHERE WE ACTUALLY RANK TODAY. THE BASELINE NOBODY HAS WRITTEN DOWN.

The goal is #1 in the category. No one has recorded where the app currently appears.

In the App Store, signed out or in a fresh context: search each of our **five terms** (`seo audit`,
`product descriptions`, `meta tags`, `alt text`, `ai visibility`) plus `seo` and `ai seo`. For each:
Navaal's position (page and slot) or *not in the first N results* with N stated. Then the **SEO
category** page itself: our position, and the three apps immediately above us with their review
counts. Record the date and time. This becomes a weekly read; today's is the baseline.

---

## TASK 5 — READ `/privacy` AND `/terms` THE WAY A REVIEWER WILL

CC generated both from the schema and the scopes, with build-time guards. That makes them
*consistent*; it does not make them *right*. Read both pages in full, on the public URLs, as an App
Store reviewer and as a merchant deciding whether to trust us:

- Anything that describes a feature that is not live, or omits one that is (the BYO Anthropic key
  disclosure should be there — confirm it).
- Anything that contradicts the listing or the plans page (trial length, credits, what we store).
- Missing basics a reviewer bounces on: company identity, contact address, governing law, data
  retention period, sub-processors (Anthropic, Fly, Neon, Redis host), how to request deletion.
- Anything written in a register that would worry a merchant.

Do not edit. Quote each finding with its section. Route to CC (the pages are generated; a hand edit
would drift) — or to Cowork if the fix is a decision rather than a fact.

---

## TASK 6 — TWO DASHBOARD READS, FIVE MINUTES EACH

**6a. Admin performance** (Dev Dashboard → Monitoring): LCP / CLS / INP p75 with **call counts**,
same format as your 10 Sep read. INP was *"Not enough data"*; is it still? The count toward 100 is
the number that matters.

**6b. Webhooks**, only if the 7-day window now starts on or after **8 Sep 20:00 UTC** (so the Sep
8–9 failures have aged out): overall rate and per-topic counts, same format as H10. If the window
has not moved past them yet, skip and say so.

---

## TASK 7 — THE SWEEP

Standing. Editor fields first, public page cross-check, fetch-sanity before both. Expect-0 list as
before; expect `save 20%` **3**, `14-day` **≥3**, replacements **1** each; limits and five terms.
Integers.

---

## STILL OWNER-BLOCKED

- W1 post upload (Hostinger password).
- dev2 storefront password — now optional; a rendered read of the escaped block would be nice to
  have, not needed.

---

## ORDER

Task 1 (fresh install walkthrough) → Task 2 (capture, then `CAPTURE COMPLETE`) → Task 3 → Task 4 →
Task 5 → Task 6 → Task 7. Tasks 3–7 are all read-only and can be done while anything else is
deploying.

Report claim-vs-screen first, verbatim, *could not read* when you could not. Queue under
`## PHASE 7 — CW`, no IDs. Re-read `/api/build-info` between tasks. And keep flagging what nobody
asked about — the timezone trap on App history and the computed `save 20%` badge were both that.
