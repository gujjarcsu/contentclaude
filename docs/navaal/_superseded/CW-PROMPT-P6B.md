# CW — ONE QUESTION FIRST, AND IT MAY BE A SECURITY QUESTION

Paste this whole file. **Task 0 comes before everything, including re-reading your own standing
prompt.** Everything else in here is secondary and I have kept it short so it cannot distract you.

---

## WHAT YOUR LAST REPORT ACTUALLY FOUND

You went looking for why a stale annual price had not auto-corrected and found that **Shopify's copy
of this app's configuration has not moved since 9 September.** Active app version
`navaal-seo-geo-content-15`, created 9 Sep — five days before the pricing lock. `fly deploy` ships
code; it does not resync app configuration. That is a new false-green shape and the most
consequential one in this project so far: **a verified production deploy proves the code is live and
proves nothing about the configuration Shopify serves.** Three sessions, including mine, read green
deploys all week and none of us looked at the Versions surface.

You also caught that Shopify's own sentence — *"Changes to prices and billing cycles will be updated
automatically"* — makes the per-card `Edit` the **wrong** fix, because the next config sync
overwrites it. You stopped, determined, and reported rather than editing. That was the correct call
twice over.

**And you were right about the frames and I was wrong about the relabel.** I endorsed CC's P5.1
decision to change the word rather than the number. That was right about what the number *means* and
wrong about what a *screen* does: frame 01 — the first image on the listing — shows five product
counts that do not reconcile on a 15-product store. A merchant reads the screen. My endorsement is
corrected in the queue in my own name.

---

## TASK 0 — IS A STORED XSS FIX LIVE ON MERCHANT STOREFRONTS, OR NOT?

I checked what has changed in the app-version surface since 9 September. **`shopify.app.toml` is
unchanged**, so scopes, webhooks and URLs are not at risk. **Exactly one thing changed, and it is
this:**

```
7942c30  2026-09-09 21:26:53 +1000  "fix(phase-0 group D): the six security defects"
         extensions/geo-schema/blocks/faq_visible.liquid | 13 +++++---
```

From that commit message, verbatim:

> **Item 18 — stored XSS on the MERCHANT storefront.** … *and `faq_visible.liquid` rendered the AI
> FAQ text **unescaped** — Liquid does not auto-escape — so every interpolation is now escaped*

`faq_visible.liquid` is the **app block that renders on a merchant's live storefront.** If the
released extension version predates that commit, then every storefront running our theme extension
has been serving **unescaped AI-generated text** for five days, and the fix has been sitting in a
green deploy that Shopify never picked up.

**I cannot settle this from here. You can, two independent ways. Do both.**

### 0a. The timestamp
Dev Dashboard → Versions → `navaal-seo-geo-content-15`. Get its **creation time, not just its
date.** Compare against **2026-09-09 21:26:53 +1000** (= **11:26:53 UTC, 9 Sep**).
- Created **after** 11:26 UTC on 9 Sep → the fix is probably in. Still confirm with 0b.
- Created **before** → **the fix is not live. Stop and report immediately.** That is a P0.

Quote the timestamp verbatim, with its timezone as the page displays it. If the page shows only a
date, say so — *"could not read the time"* is a different finding from *"the time is X"*, and the
difference decides this.

### 0b. The storefront itself — this is the proof, the timestamp is only the clue
Read-only, on a **dev store**, never on `askebs.com.au` or any EBS property.

Find a product on a dev store where our FAQ app block renders, and look at what the storefront
actually outputs for a FAQ whose text contains an angle bracket, an ampersand or a quote. **View the
rendered HTML source of the storefront page**, not the admin, not our app.

- Escaped (`&lt;`, `&amp;`) → the fix is live. Say so and move on.
- Raw markup rendering as markup → **the fix is not live. Stop. Report. P0.**
- No FAQ block on any dev store product → say exactly that. It means the check could not be run,
  **not** that it passed (your own rule, and it is rule 4 in your standing prompt).

**Do not inject anything.** You are reading what the app already generated, not testing with
payloads. If no existing FAQ text happens to contain a special character, say the check was
inconclusive and why — do not create one to find out.

### 0c. Then say what releasing a new version would carry
Whatever 0a and 0b show, the release is happening. So report, from the Versions page: what the
active version contains, and what a new version would change. `shopify.app.toml` is unchanged, so
the expected answer is "the extension and the billing display, nothing else" — **confirm that
against the screen rather than trusting my repo read.** If the page shows a pending scope change or
a re-consent warning, that matters: there is **one live subscription**, and a scope change can
prompt them to re-consent.

---

## TASK 1 — PREPARE THE STORE SO THE NEXT CAPTURE IS THE LAST ONE

Do **not** capture frames. They are blocked on CC fixing the counts and the nameless
`Welcome back!` on frame 04.

But you found two things that fix themselves with store state and no code, and two capture rounds
have already been wasted:

- **02 / 07 Review are empty** — `Nothing to review` over a blank frame, illustrating our
  approve-before-publish bullet. Leave **several drafts pending** on the dev store so the Review
  screen has real content in it when the capture runs.
- **The frames were stale by one product when taken** (14 against the store's 15) because another
  worker's archive probe was running. Nothing else may be mutating the store during a capture.

So: get the dev store into the state a good capture needs, and write down in the queue exactly what
that state is — how many drafts, what condition, and the instruction that captures run alone. Then
the next round produces a set instead of another verdict table.

**One boundary:** generating drafts on a dev store is fine. The EBS commercial catalogue stays
read-only, always, no exception.

---

## TASK 2 — ENUMERATE EVERY NUMBER ON HOME AND PRODUCTS, WITH ITS LABEL

CC is fixing counts one at a time and has now missed the same class twice. Give it the complete
list instead, because you are the only worker that reads screens.

On the dev store, list **every** number visible on Home and on Products, with its exact label, and
the store's real product count beside it. Frame 01 alone showed:
`Autopilot optimized 15 new products` · `30 products optimized` · `0 drafts awaiting review` ·
`across 14 products sampled` · `Total Products 32` · `AI Content Published 30`.

That is the deliverable: one table, every number, every label, verbatim. Then CC can make the screen
reconcile in one pass rather than five.

---

## TASK 3 — THE SWEEP. UNCHANGED, AND THE NEW CHECKS EARNED THEIR PLACE.

`save 17%` **3** and `7-day` **3** on the public page, **0** in every field we author. They fired on
their first run and found exactly the gap they exist for — and we now know they come from the stale
app version, not from any field. Keep them. Re-run after the new version is released; both should
go to 0 without anyone editing a field, and if they do not, that is a finding.

Everything else in your last sweep was clean: doctrine phrases 0, superlatives 0,
`A/B variant testing` 0, `Priority support` 0, `ai content generations` 0, replacements 1/1, name
25/30, intro 86/100, details 449/500, bullets 58·69·74·60·63, search terms exactly 5. Fetch sanity
first, as always.

---

## TASK 4 — STILL OWNER-BLOCKED

The W1 post upload. Hostinger shows an email + password form. You do not type the owner's
credentials. Unchanged.

---

## ORDER

**Task 0 alone, then stop and report if either half comes back bad.** Only if it comes back clean:
Task 2, then Task 1, then Task 3.

Report the difference between claim and screen first, as you did last time. Quote verbatim. INBOX,
**no ID**. And re-read `/api/build-info` mid-session — you caught a deploy 31 seconds old last
round and it was the reason your report was right.
