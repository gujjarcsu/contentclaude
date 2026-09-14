# CC — PHASE 8 BRIEF: WHAT A NEW MERCHANT ACTUALLY HITS, THEN PROOF ON BING

Paste this whole file. It replaces `CC-PROMPT-P7.md` (moved to `_superseded/`). Production
`40d8a93`, 255 columns, healthy — verified from outside. Phase 2 is live and proved on production
with counts; the three corrections you made under proof (password-protected stores nulling
`onlineStoreUrl`, P2.5 verified unreadable before building, the false §5 bullet) are the standard,
and false green #13 — a piped gate returning `tail`'s exit — is now in the file with the others.

**One reassignment before anything else: F8 is yours.** You routed it to the owner. Both real
merchants installed before B2, so **they are on 25 credits today** while the listing, the plans
page and the locked table say 100. That is the app contradicting itself on a real merchant's first
screen, the change is favourable to every row it touches, and `14-PRICING.md` §6 item 8 —
*grandfather nobody* — was written for exactly this. It is Part A1 below. Inform the owner; do not
wait for him.

**One ID collision to carry in your head:** CW's first-run findings are numbered **F0–F14** in
`docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md`, and `02-BACKLOG.md` already has
**F1–F8** of yours. From here, CW's are **FR0–FR14**. Do not "fix F3" without saying which F3.

---

## PART A — THE FIRST RUN. CW WALKED IT AS A MERCHANT: ~20 SECONDS TO VALUE, 15 CONFUSIONS.

Twenty seconds from opening the app to a finished, specific, good draft on screen. That number is
excellent and it is the whole product. Then fifteen things a merchant has to stop and think about,
on the way to it and just after. Hoodify installed, looked, and uninstalled in **one minute**. This
part is about the fifteen.

Read CW's file §3 in full before touching anything. Then fix **as classes**, in this order:

### A1 — F8: re-base every existing Plan row to the locked table
Migration or one-shot script, before/after counts, favourable-only by construction (a test asserts
no row loses credits or products). Prove on `navaal-ttv-02`, which reads *"3 / 25 used · 22 of 25
left"* today; it must read against 100 afterwards. Post the row count re-based.

### A2 — The name comes from Shopify, live, every load (FR1, FR2)
`brandVoice.storeName` is captured at install and never refreshed; CW renamed `navaal-qa-fresh`
after install and twenty minutes and five loads later the hero still said *"Welcome back, Navaal QA
Fresh!"* under an admin badge reading *Northline Supply*. Part B fixed dev2's path; this proves a
second path. Read `shop.name` from Shopify on every session (cache it for the session, not the
install), and **never greet a first visit with "Welcome back"** — first-visit copy is its own
state. `firstDraftSeenAt` already exists; use it.

### A3 — One count path per number (FR3, FR4, FR11)
The first screen says three drafts are ready; Review says *"Nothing to review"* for minutes; then
Review says 3 while Home and the Products header still say **0**, permanently, for first-run
drafts. On dev2 all four agree, so the first-run draft path writes somewhere the counts do not read
— or a second cache sits in front of the first screen. This is false green #9's shape a third time.
Find it by read → change → read, not by reasoning. Every number a merchant sees comes from **one**
path; the header and its own tabs cannot disagree.

### A4 — One unit (FR5, FR9, FR12)
*"3 of your 100 remaining free generations"* on the first screen; *"Monthly Generations"* on
Products; *"Monthly Usage"* on Home. `12-OFFER.md` §1 forbids mixing "generations" with weighted
credits, and the first sentence a merchant reads about cost uses the banned unit. **Credits, one
label, everywhere** — and a test that greps the rendered copy for the old word.

### A5 — Buttons do what they say (FR13, FR10, FR0)
- A row's *Review* button opens the generate page. It opens Review, or it is not called Review.
- *"Optimize store (12) · Starter"* as the primary CTA on a Free store is an upsell wearing an
  action's clothes. The primary action on Free does what Free can do; the upgrade is offered where
  the limit is hit, with the reason (B3's rule).
- An empty store dead-ends with a button that leaves the app. Say what to do, and keep them inside.

### A6 — The score, presented so a new merchant is not scared off (FR6, FR7, FR8, FR14)
A red **21/100** is the first thing a new merchant sees; the headline is one of two unlabelled
numbers beneath it; *"Now 21/100"* — the store score — is printed on every product row as if it
were the product's; `3/100` renders as 3% and `19/4000` as 0%. Label every number for what it is,
show the store score once, show a product's score on its row, and round so that spent credits
never display as 0%.

### A7 — `Live` means live on the storefront
`Rope Basket Large` is a Shopify **draft** with no storefront page and the app badges it *Live*
because our content on it is published. The badge takes product status into account, or it is
called something else. Same class as Part B, one more place.

### 🚢 Ship gate
Then post the sha. **CW re-walks the first run through your First-run reset workflow and counts
the confusions again.** The number was 15. The gate is not "fixed"; it is CW's second count.
Frame 04 is captured from that walk.

---

## PART B — THE LEGAL PAGES HAVE TWO HOMES

Your generated `/privacy` and `/terms` are current on **`app.navaal.ai`** (14 Sep). The listing's
Privacy policy URL is `https://navaal.ai/privacy` — the **static Hostinger** copy (4 Sep), and
`navaal.ai/terms` is from **8 July**: 7-day trial, "25 generations", "two months free", no BYO-key
disclosure, `support@`. CW read those; you verified yours; both reports were true. False green
**#14**, the third-homes lesson in a new costume.

In `navaal-platform`: prepare `privacy` and `terms` as **301 redirects** to the `app.navaal.ai`
pages — `.htaccess` rules plus a meta-refresh HTML fallback in case the host ignores `.htaccess` —
and add `rel="canonical"` on the app pages. Put the files and a one-line upload instruction beside
`_UPLOAD-W1-POST.md`; the owner uploads all three in one Hostinger session. Check the marketing
site's footer links while you are there. CW is re-pointing the listing field today.

---

## PART C — PHASE 3: PROOF, ON BING FIRST. THE TRIAL'S HERO MOMENT.

Read `11-MASTERPLAN.md` Phase 3 in full. The reason it exists: Bing has a REST API and Google does
not, so **a causal, free, no-OAuth, no-approval result that reads out in 72 hours** is available to
every store on the trial. Revision 1 buried it; it is the best thing in the plan. Gate: *a merchant
sees, inside the trial, a causal result about their own store.*

| | Item | Notes |
|---|---|---|
| P3.1 | **The IndexNow crawl-time holdout.** | Submit a **random half** of changed URLs, withhold the other half, measure time-to-crawl for both. Genuinely causal; IndexNow is not a ranking factor, so zero risk; no competitor found doing it. The randomisation is the product — record the seed, show both arms, show the interval, never the point estimate alone (`10-MARKET.md` §6 on power; a small store gets a wide interval and the UI says so). |
| P3.2 | **Bing Webmaster REST API.** | URL submission (~10,000/day, sanctioned for commerce pages) and **per-page query stats with separate impression and click positions**. SOAP/POX retired 31 Aug 2026 — REST only. Merchant supplies their own API key; encrypted like the Anthropic key, never logged. |
| P3.6 | **The weekly report.** | Only when there is something true to say. One email per week across the app. Every number links to the screen that proves it. The review ask (Part C of P7) fires only after a result like this — wire them together. |
| **🚢** | | |
| P3.4 | **First-party AI sessions** via ShopifyQL `agentic_referring_channel`. | Perplexity and Claude inferred from referrer and **labelled inferred**; state that AI-assisted visits arriving via Google count as organic, so the number is a floor. CW already read Shopify's own Agentic channel: per-channel sessions, nothing per product — build only the per-product delta. |
| P3.3 | **Teach the two reports that have no API** — Google's generative-AI report and Bing's AI Performance — guided, in-app. | We teach it; we never scrape it. |
| **🚢** | | |
| P3.5 | Shared-corpus prompt sampling, per vertical. | The biggest item; last. ~50 prompts × 4 engines × 7 runs/day per **vertical**, fanned out; cited separated from mentioned; interval always shown; method labelled on every screen; the honest n=1 view labelled as one observation and never trended. Start only if the two gates above are live. |

**Boundaries:** IndexNow submissions and Bing API calls are made only for stores whose merchant
turned it on; **never for EBS by default** and never while `REMEDIATION_LOCKED_SHOPS` is unset.
Every number carries its method. No statistic from this phase reaches the listing — `12-OFFER.md`
§5's two Phase 3 lines become publishable only when this is *live*, and CW publishes them, not you.

---

## HYGIENE THAT IS NOW MANDATORY

- `git diff --cached --stat` before every commit — the shared index swept files three times today,
  once by Cowork twice.
- Deploy gates read the **script's** exit, never a pipe's (#13).
- Any ship gate touching `shopify.app.toml` or `extensions/` also releases an app version (#12).
- Run the suite **after** the last commit, not before it.
- Never print a secret; `fly secrets import` from a file.

## DONE MEANS

- [ ] F8 re-based; ttv-02 reads against 100; count posted; owner informed
- [ ] FR0–FR14 and the `Live` badge fixed as classes; sha posted; **CW's second confusion count
      recorded** — that number, not your list, is the gate
- [ ] Redirect files and instructions beside `_UPLOAD-W1-POST.md`; canonicals on the app pages
- [ ] P3.1, P3.2, P3.6 live with the holdout showing both arms and an interval
- [ ] P3.4, P3.3 live
- [ ] P3.5 started only if the above are live; otherwise scoped and routed
- [ ] Written back (**L18**): backlog, queue, decisions, PROGRESS

Route only on the four reasons in `03-PROTOCOL.md`.
