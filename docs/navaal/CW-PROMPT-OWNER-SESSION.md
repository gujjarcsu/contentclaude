# CW — THE OWNER SESSION: EVERYTHING ON HIS LIST, IN ONE SITTING, WITH HIM AT THE KEYBOARD

Paste this whole file **with the owner present at the computer for the whole session.** *(Revised
2026-09-15 after Phase 11: the privacy redirect is split in two, the three clean frames go up today,
the translations are gated per locale on the app speaking it, H18 is closed, the shop-kind seed is a
workflow.)* This is
the one session where every item that has ever been "owner-blocked" gets done, because the owner
is here to do the single thing you never do: **sign in.**

## THE PROTOCOL — read twice

1. **You never type a credential.** Not a password, not a 2FA code, not a recovery phrase. When a
   task reaches a login wall, you print exactly one line —
   `LOGIN NEEDED: <service> — please sign in in this browser now, then say "go"` —
   and stop until the owner says go. He signs in; you continue. Same for any 2FA prompt, any
   "approve on your phone", any CAPTCHA.
2. **Every write is announced before it is made**, one line, then made. Every write is read back
   on a fresh load. The owner is present; he can say stop at any point, and you stop.
3. **EBS (`askebs.myshopify.com`, `askebs.com.au`) is read-only, always.** The one thing in this
   session that names it is the lock secret, which is *about* it, not *to* it. Nothing else.
4. **Real merchants' stores: public pages only.** The two emails are drafted by you and sent by
   the owner's word — one "send" per email, after he has read it.
5. **Order is dependency order.** If a task is blocked (a login the owner cannot do today, a DNS
   provider nobody can name), say so in one line, skip it, and keep going. Nothing here blocks
   anything else except where marked.
6. Report at the end: every task with **done / skipped-because** and the verbatim read-back.
   Write-back to `06-QUEUE.md` under `## OWNER SESSION — CW, <date>`, no IDs. Move every closed
   item from `OWNER-CHECKLIST.md` to DONE with the date.

**Before starting, the owner needs at hand:** Fly.io login · Hostinger (hpanel) login · a
Microsoft account for Bing Webmaster Tools · Google (`navaal.aiiii@gmail.com`, and `gujjarcsu@`
for Gmail) · Shopify Partner (the account chooser, one click) · GitHub (optional, for the workflow
button) · wherever `askebs.com.au`'s DNS lives · UptimeRobot · phone for 2FA.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `06-QUEUE.md` INBOX and CC's latest post (has CC posted *"qa-fresh: CC
is done with it"*? note yes/no — it gates Task 12) · `OWNER-CHECKLIST.md` top to bottom ·
`_UPLOAD-W1-POST.md` · `_UPLOAD-LEGAL-REDIRECTS.md` · `docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md`.
`curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"`.

---

## TASK 1 — THE EBS LOCK: `REMEDIATION_LOCKED_SHOPS` (2 minutes; first, because it is the guardrail)

Two routes; use the first.

**Route A — Fly dashboard (no CLI, no `%xx` problem).** `LOGIN NEEDED: fly.io`. Navigate to app
`contentclaude` → Secrets → add. Name `REMEDIATION_LOCKED_SHOPS`, value
`askebs.myshopify.com` (add any other real store the owner names, comma-separated). Announce,
save. Fly restarts the machines; poll `/api/build-info` until `startedAt` is newer than your
ORIENT read, then `/api/health?deep=1` ok.

**Route B — CLI, only if the dashboard refuses.** Install flyctl in this VM, `fly auth login`
(the owner completes it in the browser), write the value to a file, `fly secrets import < file`.
**Never `fly secrets set`.** Never print the value into the queue — the shop is named here and in
`OWNER-CHECKLIST.md` already; that is enough.

Read back: `/app/fix` on **any dev store** still offers fixes (the lock is per-shop, not global).
The value is not readable from outside, so the proof is the app restarting and the secret listed
by **name** on the Secrets page.

---

## TASK 2 — HOSTINGER, ONE SESSION, THREE UPLOADS (10 minutes)

`LOGIN NEEDED: Hostinger hpanel`. Then, in the File Manager under `public_html/`:

**2a — the W1 post**, exactly as `_UPLOAD-W1-POST.md` §1–§3: upload
`blog/shopify-product-data-409-stores.html`; **hand-paste** the card into `blog/index.html` and
the item into `blog/feed.xml` (do not overwrite either file — the server copy may be newer).
Check live: `curl -sL "https://navaal.ai/blog/shopify-product-data-409-stores?cb=$(date +%s)" | grep -c "36.2%"`
must be **2**. If 0, pull the page down — the headline must never appear without its sensitivity
row.

**2b — the legal redirects, in two halves.** CW found `navaal.ai/privacy` is **not** a stale copy but
a two-part policy (website + the Bilby scan, and the app); a redirect would delete the website's only
policy. So: upload **`terms.html` only** now (the 8 July terms are stale app terms), plus the
`.htaccess` line for `/terms` only, exactly as `_UPLOAD-LEGAL-REDIRECTS.md` describes for that file.
**Do not upload `privacy.html`** until CC posts the Part B sha that merges both parts into the
generated page — if that sha is already in the queue when you get here, upload both. Check:
`curl -sI "https://navaal.ai/terms?cb=$(date +%s)"` → `301` + `location: https://app.navaal.ai/terms`.

**2c — `support@` on the marketing pages.** CC found `support@navaal.ai` on five marketing
pages while `hello@` is everywhere else. Find them (`grep -rl "support@navaal.ai"` on the local
copy in `navaal-platform`, then confirm each on the live server), replace with `hello@navaal.ai`
in place, read back live.

---

## TASK 3 — F10: THE FIRST REAL CRAWL-TIME RESULT (20 minutes; the highest-value item in this file)

**3a — one dev store goes public.** Pick `navaal-ttv-03` (not frozen, has products). Shopify
admin (Partner chooser click, no credentials) → Online Store → Preferences → **remove password
protection**. Announce, save. `curl -sI https://navaal-ttv-03.myshopify.com/` must return 200,
not 302 to `/password`. **Never a real store.**

**3b — Bing Webmaster Tools.** `LOGIN NEEDED: Bing Webmaster Tools (Microsoft account)`. Add the
site `https://navaal-ttv-03.myshopify.com`. Verify by the **meta tag** method: paste the tag into
`theme.liquid` `<head>` on that dev store (Online Store → Themes → Edit code; a dev store, so
allowed). Confirm verified. Then Settings → API access → generate/read the **API key**.

**3c — the key into the app.** Open the app on ttv-03 → Settings → the Bing Webmaster field
(P3.2 shipped it: encrypted, never logged). Paste the key. Save. Read back: the field shows
"saved" / a masked value, never the key. Turn **measurement on**.

**3d — ten products published.** Through the app, on ttv-03: generate and publish content for
ten products (approve → publish). Quote Home afterwards.

**3e — run the holdout.** Either the owner is logged into GitHub and you click **Run workflow** on
the Crawl-holdout workflow with `navaal-ttv-03` — or you post `F10 READY: navaal-ttv-03, key
saved, 10 published` to the queue and CC runs it. Either way, post it. The result reads out in
~72 hours; that screen — both arms, the interval, the seed — is the trial's hero moment.

**3f — tell CC** in the same post that a public dev store now exists, so its Lighthouse harness
(F13) and the rendered read of the escaped FAQ block (0b) can both run on it. If time allows, do
0b yourself: view source on a ttv-03 product page with the FAQ block and confirm `&lt;`-escaping.

---

## TASK 4 — P0.10: SHOPIFY LEVEL 2 / `read_reports` (10 minutes)

Partner Dashboard → the app → API access → request access to the protected scope. Fill the form
with the owner reading every field before you submit — it asks what the data is for: *"per-product
sessions referred by AI assistants, shown to the merchant inside the app; no export, no third
party"* is the true answer. **Submit only on the owner's "go".** Quote the confirmation.

---

## TASK 5 — THE THIRTY PROSPECTS, DRAFTED FROM DATA THE OWNER ALREADY OWNS (30 minutes)

B0.1 says *names, not channels*, and it is the critical path. The owner has a network; you have
**409 audited storefronts** in `docs/research/w1-eligibility-base-rate/auditA.jsonl` and
`auditB.jsonl`, each with `attrs.desc_short`, `attrs.no_type`, `attrs.no_image`, `products_seen`.

Build `docs/navaal/PROSPECTS.md`: **thirty stores** where (a) `products_seen` is between 20 and
2,000, (b) `desc_short` or `no_type` is a large share of `n`, (c) the storefront is live today
(200, not 404/password), (d) a contact route exists on the public site — contact page, email,
Instagram — and (e) it is not a household brand. One row each: domain, product count, the finding
in the merchant's own terms ("143 of 210 products have descriptions under 120 characters"), the
contact route, and why them in ten words. **No contact is made in this session.** The owner adds
his network names to the same file. Frame B (long-tail) first — smaller stores answer founders.

---

## TASK 6 — TWO EMAILS TO THE TWO REAL MERCHANTS (10 minutes)

`LOGIN NEEDED: Gmail (hello@navaal.ai or the account that sends as it)`. Draft one email each to
Zephyrine Wynter and Peter Shops, from the founder, in his voice, **under 90 words**: they
installed, they are pre-launch, he is the person behind the app, one question — *what did you hope
it would do for you?* — and an offer to look at their catalogue personally before launch. No
pitch, no link to a plan, no statistics. Show each to the owner. **He says "send" per email, or
edits, or declines.** You send only on that word. Record sent/declined in the queue.

---

## TASK 7 — THE SCOPE DECISION (1 minute)

Ask the owner: `write_publications`, `write_online_store_navigation`, `read_legal_policies` —
yes or no to each. Cowork's recommendation is **no to all three** until ten merchants (any new
scope forces every installed merchant to re-approve). Record his answer verbatim in the queue for
Cowork to move into `04-DECISIONS.md`.

---

## TASK 8 — THE THREE RECORDINGS (30 minutes, Playwright `recordVideo`, headed if the VM allows)

H4/H5/H6 have been on the owner's list since day one. Record with Playwright's video capture
(1440×900). The URL bar cannot be shown in a Playwright recording — say so in the file names and
the queue rather than pretending; the content is what matters.

- **H4** — a fresh install from the listing on a dev store → OAuth grant → first screen → first
  draft. Under 120 seconds. (`navaal-qa-fresh` is released — CC posted "done with it" and CW has already reinstalled it once;
  use it, or a `navaal-shape-*` store.)
- **H5** — a Free store driven from 0 toward its 100-credit cap: capture the warning surface when
  it appears and the 100% card. Stop when both are on film; do not burn the whole allowance for
  its own sake.
- **H6** — from the 100% card: Upgrade → Shopify's approval page (14-day, $29.99 every 30 days)
  → **Approve**, on a dev store, a **Test** charge, owner's "go" first → land back in the app.
  Then **cancel that test subscription** so B8's phantom does not come back. Read the plans page
  afterwards.

Files under `docs/history/recordings/`, names stating the store and the sha.

---

## TASK 9 — H16, THE GMAIL FORWARD (5 minutes)

**H16 — UptimeRobot second contact.** `LOGIN NEEDED: Gmail gujjarcsu@`. Add `hello@navaal.ai` as
a forwarding address; Google emails a confirmation code to `hello@` — the owner reads it out; you
enter it; create the filter *from UptimeRobot → forward*. If `hello@` and `gujjarcsu@` turn out to
be the same inbox, say so and close H16 as moot.

**H18 is closed, not skipped:** `askebs.com.au` is a WordPress site; the Shopify EBS store is not live. Nothing to verify. It returns only when a real merchant connects their own Search Console.

---

## TASK 10 — CLASSIFY THE SHOPS (5 minutes)

`Shop.kind` is live (`f974f49`). CC queued the **Shop kind seed workflow** with a domain-list step;
your ledger in `06-QUEUE.md` §PHASE 7 is the source — ours / Shopify's / real. Run it (GitHub, the
owner logged in — or post the domain list and CC runs it), then the **Funnel workflow** — not
Prisma from this VM, the client is Windows-built until CC adds the debian target. Quote the
reading: expect real 2 installed / 3 ever, ours 11, Shopify's 7, unclassified 0, published 0.

---

## TASK 11 — THE WEBHOOK READ (5 minutes, only if the window has cleared)

Dev Dashboard → Monitoring → Webhooks. If the 7-day window now starts **after 9 Sep 06:00 UTC**,
read it in H10's format — every percentage with its delivery count beside it. If the window still
contains the launch-day failures, one line: not yet.

---

## TASK 12 — THE LISTING IMAGES: THREE TODAY, TWO WHEN CC POSTS (15 minutes)

Decided in `04-DECISIONS.md`: **upload frames 02 (Review), 03 (Products) and 05 (Settings) now** —
the three you judged clean — replacing whatever launch screenshots are live (the earlier set showed
Shopify's admin chrome and a Sidekick glyph, a named BFS rejection reason). Captions from
`12-OFFER.md` §4 language only. Read the live listing back on a fresh load; the three showing are
the three you uploaded. Post `CAPTURE COMPLETE (3 of 8)`; dev2's freeze lifts.

**01 (Home) and 04 (First run)** wait on CC's Part A sha — the *"Unchanged since"* / *"Autopilot
optimized 15"* contradiction and the orange theme banner are both CC's. When the sha is live:
declare a short freeze, re-capture only those two on dev2 and qa-fresh, look at them, add them if
clean. **Never upload a frame with a contradiction on it**, whatever the gallery count.

## TASK 13 — LISTING TRANSLATIONS, ONE LOCALE AT A TIME, ONLY AFTER THE APP SPEAKS IT

`docs/navaal/LISTING-TRANSLATIONS.md` is ready — six languages, every string script-counted inside
Shopify's limits. **But the app's UI is English-only today**, and a translated listing for an
English-only app is a false claim on a Shopify submission. So the rule (`11-MASTERPLAN.md` §6.5 B):
**enter a locale's listing only after CC posts that locale live in the app** — German first, then
French, Spanish, Italian, Portuguese (Brazil), Japanese.

For each locale CC has posted: Partner Dashboard → listing → that language → paste every field
verbatim from the file → the editor's counter wins over the file's → save → read back on a fresh
load → switch the public listing to that language and confirm the subtitle and five bullets render
→ set the listing's **Languages** field to include it → post per locale, with any field the editor
made you trim, verbatim, for Cowork. If no locale is posted yet when you reach this task, skip and
say so — that is correct, not a failure.

## TASK 14 — THE SWEEP, LAST

Standing sweep, plus: `navaal.ai/privacy` → 301; the W1 post live with `36.2%` ×2; ttv-03 public.

---

## ORDER

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14. Tasks 5, 8 and 13 need no login
and can fill any gap while the owner fetches a credential.

Claim-vs-screen first. Verbatim. *Could not do* with the reason, never silently skipped. And at
the end, tell the owner in one paragraph what is now true that was not true this morning.
