# CW — THE OWNER SESSION, CONTINUED: HOSTINGER IS SIGNED IN. EVERYTHING REMAINING, IN ORDER.

Paste this whole file into the running session that is paused at *LOGIN NEEDED: Hostinger* (or a
fresh one — it re-orients itself). Treat the earlier pause as answered: the owner has signed in. It replaces
the earlier owner-session file and the addendum; both are in `_superseded/`. The owner is at the
keyboard. **The protocol does not change:** you never type a credential; at any login wall you print
`LOGIN NEEDED: <service>` and wait for "go"; every write is announced, then made, then read back;
EBS is read-only; real merchants' stores are public pages only.

## WHAT IS ALREADY TRUE (do not redo)

- **Task 1 done.** `REMEDIATION_LOCKED_SHOPS` is set on Fly (digest `bdfe603349d3907c`), released
  via *Deploy Secrets*, which — your finding, now false green #18 — shipped the newest built image.
- **Task 5 done.** `docs/navaal/PROSPECTS.md`: thirty stores with whole-catalogue counts and a
  contact route; the barcode rule written in. Nobody is contacted in this session.
- **Owner answers, given:** `support@navaal.ai` **is a real inbox** — Task 2c is closed with nothing
  to edit; note in the queue that both addresses are real and `CONTACT_EMAIL` stays as is.
  **Every account this file names is already signed in in this browser** — Hostinger, Bing Webmaster
  Tools, GitHub, Gmail, UptimeRobot, Neon, the Shopify Partner chooser. So do **not** pause at the
  `LOGIN NEEDED` lines below; proceed. Print the line and stop **only** if a page actually presents
  a login wall or a 2FA prompt — then the owner handles it and says "go". You still never type a
  credential.
- **Phase 12 is live.** Cowork verified from outside: production **`4d32d98`**, 329 columns,
  healthy; `/privacy` and `/terms` answer `Accept-Language` for `de fr es it pt-BR ja` with
  `Content-Language` set; `grep -c 'id="part-1"'` on `app.navaal.ai/privacy` returns **1**, so the
  two-part privacy merge is deployed and **the privacy redirect is now safe**. Re-read
  `/api/build-info` yourself before Task 2 and again before Task 13.
- `navaal-qa-fresh` is released (CC's "IS YOURS AGAIN"), reinstalled once by you already.
- H18 closed (WordPress site). H17 closed (scheduled task deleted). B8 closed (Test charge).

## ORIENT (two minutes)

`curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"` — expect `4d32d98` or newer. Read
`06-QUEUE.md` from `## INBOX` down to CC's Phase 12 Part E post (the eight proved lines) and your
own `## OWNER SESSION` heading. `_UPLOAD-W1-POST.md` and `_UPLOAD-LEGAL-REDIRECTS.md` in full.

---

## TASK 2 — HOSTINGER: THE W1 POST AND BOTH REDIRECTS (10 minutes, signed in)

**2a — the W1 post.** Live is 404. Upload `blog/shopify-product-data-409-stores.html`; hand-paste
the card into `blog/index.html` and the item into `blog/feed.xml` per `_UPLOAD-W1-POST.md` §3 —
**do not overwrite either file**. Check:
`curl -sL "https://navaal.ai/blog/shopify-product-data-409-stores?cb=$(date +%s)" | grep -c "36.2%"`
→ **2**. If 0, pull the page — the headline never appears without its sensitivity row.

**2b — both redirects, now.** Upload `privacy.html` **and** `terms.html` from
`_upload-legal-redirects/` and paste both `.htaccess` lines at the position the file names —
**never overwrite `.htaccess`**. Run all four checks in `_UPLOAD-LEGAL-REDIRECTS.md` §3: `301` +
`location: https://app.navaal.ai/privacy` (and `/terms`), one hop each.

**2c — closed.** `support@` is real. One line in the queue; nothing edited.

---

## TASK 3 — F10: THE FIRST REAL CRAWL-TIME RESULT (20 minutes)

**3a** `navaal-ttv-03` → Online Store → Preferences → **remove password protection** (Partner
chooser click, no credentials). `curl -sI https://navaal-ttv-03.myshopify.com/` → 200, not 302.
**Never a real store.**
**3b** `LOGIN NEEDED: Bing Webmaster Tools (Microsoft account)`. Add
`https://navaal-ttv-03.myshopify.com`; verify by the **meta tag** in `theme.liquid` `<head>` (a dev
store; allowed). Settings → API access → read the key.
**3c** App on ttv-03 → Settings → Bing Webmaster field → paste → save → read back: masked, never
the key. Measurement **on**.
**3d** Generate and publish content for **ten** products through the app. Quote Home afterwards.
**3e** Run the **Crawl-holdout** workflow (GitHub, owner logged in — `LOGIN NEEDED: GitHub`) or post
`F10 READY: navaal-ttv-03, key saved, 10 published` for CC. Post either way.
**3f** Tell CC a public dev store exists (Lighthouse F13; the rendered FAQ read 0b). If time allows,
view source on a ttv-03 product page and confirm the FAQ block is `&lt;`-escaped.

---

## TASK 4 — P0.10: SHOPIFY LEVEL 2 / `read_reports` (10 minutes)

Partner Dashboard → the app → API access → request the protected scope. The owner reads every
field before you submit: *"per-product sessions referred by AI assistants, shown to the merchant
inside the app; no export, no third party."* **Submit on the owner's "go" only.** Quote the
confirmation.

---

## TASK 6 — TWO FOUNDER EMAILS (10 minutes)

`LOGIN NEEDED: Gmail (the account that sends as hello@navaal.ai)`. Draft one each to Zephyrine
Wynter and Peter Shops — under 90 words, founder voice: they installed, they are pre-launch, he is
the person behind it, one question — *what did you hope it would do for you?* — and an offer to look
at their catalogue personally before launch. No pitch, no plan link, no statistics, **no barcode
claim** (products.json exposes none). Show each to the owner. **He says "send" per email**, or
edits, or declines. Record which.

---

## TASK 7 — THE SCOPE DECISION (1 minute)

Ask: `write_publications`, `write_online_store_navigation`, `read_legal_policies` — yes/no each.
Cowork recommends **no to all three** until ten merchants. Record the answer verbatim.

---

## TASK 13 — ENTER ALL SIX LISTINGS (30 minutes; the app speaks each on production)

**Order (12:58Z): text for all six locales first, images last in one owner sitting.** Finish every
German text field (alt text, remaining plan lines, anything the editor flags), then fr, es, it, pt-BR,
ja — text only, saved and read back per locale. Then post ONE list for the owner: locale · slot · file
(the same three `listing-assets/1600x900/` files) · localized alt text — fifteen uploads in one
sitting, not five interruptions. If the editor publishes a translation without its own screenshots,
say so and text publishes first.

Re-read `/api/build-info` first. For each of **de, fr, es, it, pt-BR, ja**, from
`docs/navaal/LISTING-TRANSLATIONS.md`: Partner Dashboard → listing → that language → paste every
field verbatim (subtitle, introduction, details, five features, five search terms, the eighteen
plan lines) → the editor's counter wins over the file's → save → read back on a fresh load → switch
the public listing to that language → **do not read "the bullets render" as proof: Shopify
machine-translates every listing into every locale already, marked *"Enthält automatisch
übersetzten Text"* / *"Contient du texte traduit automatiquement"* (false green #19). Proof is
that line ABSENT plus one string only we wrote — de bullet 3 `…in Ihrer Markenstimme`, not
Shopify's `…in deiner eigenen Markenstimme`; for the other five, the §5.6 bullet 3 from
`LISTING-TRANSLATIONS.md` verbatim** → post per locale, with any field the editor made you trim,
verbatim. Then set the listing's **Languages**
field to all seven. This is the last Track B item that scales without the owner's time.

---

## TASK 15 — A5: THE ALERT REACHES A PHONE (5 minutes)

`LOGIN NEEDED: UptimeRobot`. From the deep-health monitor, send a **test notification** to the
owner's contact. He confirms receipt on his phone; post the time. While there: **H16** — if a second
contact can be added on the free tier, add `hello@`; if not, `LOGIN NEEDED: Gmail gujjarcsu@` and
create the forward (the owner reads the confirmation code out). If `hello@` and `gujjarcsu@` are the
same inbox, say so and close H16 as moot.

## TASK 16 — A4: THE RESTORE DRILL (10 minutes, if Neon is reachable)

`LOGIN NEEDED: Neon console`. Create a **branch** from a point in time ten minutes ago — never touch
`main` — time it, post the branch name and timestamp. **Do not connect the app to it.** CC runs the
schema and row-count comparison from your post and deletes the branch. If Neon cannot be reached
today, one line and skip.

---

## TASK 8 — THE THREE RECORDINGS (30 minutes, Playwright `recordVideo`)

**H4** a fresh install on a dev store → grant → first screen → first draft, under 120 s (qa-fresh
or a `shape-*` store). **H5** a Free store driven toward its cap: the warning surface and the 100%
card, then stop. **H6** from the 100% card → Upgrade → Shopify's approval page → **Approve on the
owner's "go"** (dev store, Test charge) → back in the app → **cancel that test subscription** so
B8's phantom does not return. The URL bar cannot be shown in a Playwright recording — say so in the
file names. Files under `docs/history/recordings/`.

---

## TASK 3-RE — THE RE-READS AT `4d32d98`, AND THE TWO ENGINEERING DONE COUNTS THAT ARE YOURS

- **FR13 by click:** on a `Ready to review` row press `[Review]`; assert you land on
  `/app/review?product=<numeric>` with approve and publish present. Quote the URL.
- **The GID form** shows drafts with a malformed-link notice, never *"all caught up"*.
- **The French shape store:** uninstall/reinstall (or the reset) and confirm French drafts and a
  splash naming the language.
- **A1 — the third confusion count:** a fresh reinstall of `navaal-qa-fresh`, same file format,
  FR0–FR14 by name, the number. The gate is ≤ 3.
- **A11 — the five remaining shape-store walks** (`variants`, `fr`, `b2b`, `cap`, `zero`, plus
  `drafts` already read): first screen quoted, the app's grading spot-checked against the catalogue.
- Then the German first run: set a shape store's primary locale to `de`, reinstall, read the first
  screen in German — the proof that Task 13's German listing is honest.

Post the two counts to the queue under **Engineering Done A1 / A11**. With CC's eight, the owner's
A4/A5 above, and these two, §6.5 closes.

---

## TASK 10 — SHOP CLASSIFICATION (5 minutes)

Run the **Shop kind seed** workflow (your ledger: ours / Shopify's / real), then the **Funnel**
workflow. Quote: expect real 2 installed / 3 ever, ours 11, Shopify's 7, unclassified 0, published 0.

## TASK 11 — THE WEBHOOK READ (only if the 7-day window now starts after 9 Sep 06:00 UTC)

H10's format, every percentage with its delivery count. Otherwise one line: not yet.

## TASK 12 — THE LISTING IMAGES (15 minutes)

**Status 2026-09-15 11:10Z:** frames re-captured at `1e1867e` and shape-verified (`81fa07a`);
CW's first upload saved alt text over the old pictures and was reverted (verified from outside:
three old images, old alt text, slots 4–5 gone). Cowork looked at 02/03/05 and says **ship all
three** — 03's header/tab count (8 vs 9 "published") is queued for CC and 03 is re-captured after;
the old images (pre-rename name, admin chrome) are worse. **01 stays held** (three identical
`56/100`), **04 waits with it.**

**TASK 12 CLOSED 13:20Z — Cowork re-read the public page: three new ids, three new alt texts, every old string 0. `CAPTURE COMPLETE (3 of 8; 01 and 04 held, 03 re-capture owed after CC)`. The fifteen locale uploads are pre-written for the owner in `_UPLOAD-LOCALE-IMAGES.md`.** Earlier status, kept: images DONE by the owner's own click (1600×900 exactly — the editor's requirement; the
3200×1800 files are rejected; use `listing-assets/1600x900/`). Three new ids live; ALT TEXT NOT YET —
CW types the three English alt texts, saves once, reads back, re-reads the public page (`usage stats`
must read 0). No script route fires this DropZone; do not try again.** The paragraph below is history:

**Upload 02, 03, 05 — CW does it, fully.** The editor's uploader ignores a synthetic file event.
Two routes that give it a real file, in order: (1) the browser extension's **file-upload tool**
(it attaches a real file from disk to the `<input type=file>` — this is not a synthetic event; try it
first); (2) if the extension cannot, the owner is at the keyboard: tell him **exactly which slot**,
he clicks *Upload image* and picks the file from `listing-assets\`, you do everything else. Either
way, per slot: upload → **wait until the slot's preview shows the new picture** (this is the step
that was skipped) → replace the alt text (`LISTING-TRANSLATIONS.md` English set: `Navaal Review:
six drafts, each approved before publishing` · `Navaal Products: catalogue view with content
status per product` · `Navaal Settings: brand voice, language and approval rules`) → Save once at
the end → read the editor back on a fresh load → **fetch each live image from the CDN and look at
it** — the new id must be a new picture and the alt text must describe that picture. Public page:
`Optimize Store` **0** · `usage stats` **0** · `Blog Post Generator` **0** · three new alt texts
present. Post the three CDN ids. Then `CAPTURE COMPLETE (3 of 8; 01 and 04 held, 03 re-capture
owed after CC)`. Mobile frames wait for the same CC pass.

## TASK 14 — THE SWEEP, LAST

Standing sweep plus: `navaal.ai/privacy` and `/terms` → 301; the W1 post live with `36.2%` ×2;
ttv-03 public; the listing's Languages field; six locales with the auto-translation line absent
and our bullet 3 present (not "rendering" — #19); the gallery's alt texts are the new set (the old
`One-click Optimize Store` and `usage stats` read 0). Not the feed: it caps at 20 by design.

---

## ORDER

2 → 3 → 4 → 6 → 7 → 13 → 15 → 16 → 8 → 3-RE → 10 → 11 → 12 → 14. Tasks 8, 13 and 3-RE need no
login and fill any gap while the owner fetches a credential.

Report at the end: every task **done / skipped-because**, verbatim read-backs, and one paragraph
for the owner on what is true now that was not this morning. Queue under `## OWNER SESSION — CW`,
no IDs. Move every closed item in `OWNER-CHECKLIST.md` to DONE with the date.
