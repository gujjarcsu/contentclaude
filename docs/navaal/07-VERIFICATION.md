# VERIFICATION — what proof each kind of claim requires

Read this before writing the word "verified". Every technique here exists because a claim of the
same shape was once wrong, confidently, in this project.

**The one question behind all of it:** *if the thing I am claiming were completely false, would
what I just looked at look any different?* If not, you have not verified anything.

---

## THE CLAIM CLASSES

### 1. "The guard works"
Not proved by the suite passing. **Break the thing it watches and count the failures.**
Report the count: *"disabled X → 4 tests fail."* A guard you have not broken is a guard you have
not tested; it is the single most common false green in this repo.

Also state the L1 answer explicitly: what would this print if the watched thing were completely
broken?

*Failure shapes seen here: an ESLint `--cache` that reported clean on unlinted code; a CI guard
comparing an empty commit range; a suite passing over a GraphQL query containing a `//` syntax
error; a consistency guard that compared the same RULE on two different populations and so could
never fail.*

### 2. "A merchant can use it"
Three separate things, all required (L15):
1. the control exists and is wired,
2. a merchant can **reach** it from a screen they already visit,
3. it is **visible on a rendered page**.

Source assertions prove only the first. A control in a collapsed section, behind a plan gate, or
on a route with no entry point passes every source-level test ever written for it. Prove it in a
browser — that is a `CW` task if you cannot open one, and it is routed, not skipped.

*`includeDraftProducts` had a column, a read path, a write path and a green suite, and no control
on any screen.*

### 3. "This number is right"
State the number, **where you read it**, and **when**. A number without a source is folklore (L3).
A percentage without its denominator is worse than nothing: **0% failure over 0 deliveries is not
a pass.** Always print the count beside the rate.

For anything shown to a merchant, also state its scope and its N *in the UI itself* (L5), and check
no other screen states a different value for the same fact.

### 4. "It is faster / it is fixed"
Give the measurement and the tool that took it. "~40 ms" with nothing behind it is a defect, not a
result. Compare like with like: **every latency and time-to-value figure captured before commit
`d272222` (2026-09-10) is deploy-contaminated** and is not a baseline (see `05-EVIDENCE.md` §6b).

Measure from **outside** the system under test. A harness pointed at the wrong document has
produced four false greens here — including one measuring `admin.shopify.com` instead of our own
iframe.

### 5. "It is deployed"
`/api/build-info` returns the expected `shortSha`, **and** `/api/health?deep=1` returns
`status: ok` with `schema.ok: true` and a column count that matches the migrations applied.
A green CI run is not a deploy. A successful `fly deploy` is not a verification (L19).

### 6. "The live page says X"
Fetch the **raw bytes**, cache-busted, and grep them. Never trust a summariser, a preview pane, a
file manager, or a save confirmation (L4).

**Assert the byte delta.** If you inserted 71 characters the file must grow by exactly 71. A stale
cached read once silently reverted a verified fix here; only the byte count caught it.

### 7. "It holds at scale"
Name the shape and the number: *"walked 20,000 products in 80 requests, 3.4 MB — and it reports
why it stopped."* Then say what is **simulated** versus what met a real store. The largest real
catalogue this code has met is 3,148 products; everything above that is modelled until a real one
proves otherwise, and the report must say so.

Every scale claim must answer: cursor exhaustion · a THROTTLED response mid-run · a job outliving a
deploy · worker memory · and **what the merchant is told when it stops early** (a cap is never
presented as a total, L5).

### 8. "It works for every store"
Name the shapes from `05-EVIDENCE.md` §4 that you proved it against, and the ones you did not.
"It works on the store we tested" is not done (L2). EBS is an instrument, not the customer (L13).

*1,374 tests did not find 29 defects that one real catalogue surfaced in ninety minutes.*

### 9. "The file / workflow does X"
Read the whole file and quote the line number (L16). A grep hit proves a string exists, never that
a behaviour is true.

### 10. "The external service is in the state I expect"
Read it back on a **fresh page load**, not from the confirmation screen that just told you it
worked. Screenshot or quote the value. If access failed, the finding is **"could not read"** — never
"no change", which is a different claim entirely.

---

## THE REPORTING RULES

- Numbers first, interpretation second.
- Quote verbatim what you read; paraphrase is where accuracy dies.
- **"Could not check" and "no change" are different findings.** Never substitute one for the other.
- Report what you found that nobody asked about (L14). It has been the most valuable part of every
  session so far.
- If a verification failed and you fixed it, say both — the fix and what the failure means about
  the class of thing that failed.

---

## THE FALSE GREENS, AS A CHECKLIST

Before claiming a pass, check you are not repeating one of these:

1. A cached or stale read presented as current state.
2. A tool with caching left on, reporting clean on unchecked input.
3. A guard whose comparison can never fail (empty range, same rule both sides).
4. A test suite passing over code that never actually executes.
5. A harness measuring the wrong document, page or process.
6. A feature complete in every layer except a screen a merchant can reach.
7. A document confidently describing a file nobody read to the end.
8. A page-wide scan that counted content belonging to someone else's app.
9. A read that was fresh while the cached value behind it was not.
10. Two sections in one file answering to the same name, the dead one first.

---

## FALSE GREENS 8, 9 AND 10 — all three found on 2026-09-14

**8. A page-wide scan that counts someone else's page.** CW checked the live App Store listing for
statistics and testimonials by scanning the whole public page, and found the number **46,877** and
the word **testimonial** — both belonging to **Judge.me**, in Shopify's own "other apps" carousel.
Neither is our copy and neither can be removed by us.
**The rule: a claim about OUR listing is proved in the listing EDITOR, field by field**, and the
public page is used only to cross-check that the field values actually went live. A whole-page grep
over a Shopify-rendered page measures Shopify, not us — the same shape as false green 5.

**9. A read that is fresh but the value is not.** Home reported **48/100**, then **78/100** on the
same store **with no deploy between the two reads**. The read was live; the value was served from a
cache (`STORE_SCORE_TTL_S = 600` in `storeScore.server.js`) and was lagging behind published
content by far more than its own TTL.
**The rule: for any number the app computes and caches, a single read proves nothing.** Read it,
change something that must move it, read it again, and say how long the change took to appear. A
merchant who publishes and then looks at Home is in exactly that window, and a number that is
stale there is a number that is wrong there.

**10. Two sections in one file with the same name.** A brief said *"read `04-DECISIONS.md`
§PRICING"*. The file had **two** matching sections, and the one that came first was the dead one —
five tiers at $19/$49/$99/$299, plus a row naming two things `09-DOCTRINE.md` §2 bans. A session
following the brief exactly would have published false prices and banned claims.
**The rule: superseded content is renamed, not just annotated.** A heading that still answers to
the live name is reachable, and being reachable is the whole problem. This was Cowork's own bug,
introduced by appending a new section instead of replacing the old one.

**Also worth a line, from the same day:** Playwright on this computer's Linux VM dies with
*"Target page, context or browser has been closed"* unless `libxdamage1` is extracted by hand
(`apt-get download libxdamage1; dpkg-deb -x`) and `LD_LIBRARY_PATH` points at it. That error reads
exactly like a broken harness and is not one.
