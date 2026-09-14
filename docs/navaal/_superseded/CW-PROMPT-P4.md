# CW — PHASE 4: VERIFY WHAT CC BUILT, THEN PUT THE LISTING LIVE

Paste this whole file. You are the only worker in this system with eyes. Everything CC reports is a
claim until you have read it off a real screen. **Three of the last four defects that mattered were
found by you, not by the code** — archived products on the Products page, the 42-point score
contradiction, and `E2E Test Store` hiding in a form `value` where no text check could see it.
That is the job. Keep doing exactly that.

---

## ORIENT (every session)

Read whole files:
1. `docs/navaal/CW-STANDING-PROMPT.md` — your eight hard rules
2. `docs/navaal/00-CONSTITUTION.md` — all 19 laws
3. `docs/navaal/06-QUEUE.md` — what is routed to you and what is blocked
4. `docs/navaal/12-OFFER.md` §4, §5, §5.5, §6 — what may appear on the listing **today** vs. later
5. `docs/navaal/04-DECISIONS.md` §PRICING — LOCKED 2026-09-14 — the plan table you will publish
6. `docs/navaal/09-DOCTRINE.md` §2 — the ban list

Then establish the facts:
```
curl -s https://app.navaal.ai/api/build-info
```
Write the sha down. Every gate below is a comparison against it.

---

## THE EIGHT RULES. THEY DO NOT BEND.

1. **Never type the owner's credentials.** Not once, not "just this login". A login goes to the
   queue and the owner does it personally.
2. **Never write to the EBS commercial catalogue.** No optimise, no bulk, no publish, no
   `productUpdate`, no `collectionUpdate`. Read-only, always, no exception.
3. **Read back on a fresh load.** A field you just typed into is not a field that saved.
4. **"Could not read" ≠ "no change."** Say which one it was. They are not the same fact and the
   difference has cost this project days.
5. **Quote verbatim.** Never paraphrase what a screen said.
6. **Never invent listing copy.** Every character comes from `12-OFFER.md`. If the text you need is
   not there, that is a routing item, not a writing task.
7. **No statistics, no superlatives, no testimonials on the App Store listing** — requirements
   4.3.3 / 4.3.4 / 4.3.6 / 4.3.7. None of the W1 numbers go near it.
8. **Three attempts, then route.** With what you tried and what you saw.

---

# TASK 1 — GATED: wait for CC's fix, then re-capture the frames

**🔒 Do not start until `/api/build-info` returns a sha NEWER than the one you wrote down at ORIENT
and the queue carries CC's "ship gate 1" line.** Capturing frames before the fix lands wastes the
capture and you have already paid for that once — 8 frames re-captured, only 3 usable.

### 1a. First, verify CC's fix with your own eyes. Do not take the report.

On the dev store (`contentpilot-dev2`), with the archived demo products still archived:

- **Products page.** Count what is listed. Read the tab counts. The 17 archived demo products must
  be absent from **both**. Read the count off the screen and quote it. If an archived product is
  still there, CC's fix did not work regardless of what the tests say — route it back with the
  number you read.
- **Home vs SEO Audit.** Open Home, read the score. Within the same minute open the SEO Audit, read
  its score. **Quote both numbers and the time.** They were 48 and 90. If the gap is still large,
  say exactly how large. A caption explaining the gap is not a fix; the two numbers themselves must
  agree or be labelled as different things on the number itself.
- **Settings.** Read the **form values**, not just the rendered text — `E2E Test Store` was in a
  `value` attribute. Use the page's DOM, not `innerText`. Check every input on every tab.

### 1b. Then capture all eight frames

Shopify wants **3–6 desktop** frames. Last round produced 3 usable and 2 desktop, which is not a
publishable set. The reasons a frame was unusable last time:
- demo/test data visible in the screen
- the two score numbers contradicting each other in the same set
- Shopify admin chrome making the frame look like a screenshot of Shopify rather than of our app —
  **this is a named Built for Shopify rejection reason** and it killed every desktop frame in `abedb42`

Capture: Home, Review, Products, Optimize/Blog, Settings — desktop and mobile. For each frame that
is **not** usable, write one sentence saying precisely why. That sentence is what lets CC fix it.
"Not usable" without a reason is not a report.

### 1c. Upload the set

Only once you have **at least 3 clean desktop frames**. Not before. A partial set on a live listing
is worse than the current one because it looks abandoned.

**Then read the live listing back on a fresh load** and confirm the images that are actually
showing are the ones you uploaded.

---

# TASK 2 — GATED: update the listing plan table (H12)

**🔒 Do not start until BOTH are true:**
1. The queue carries CC's "ship gate 2" line naming a sha, **and**
2. You have opened the app's own **Plans page** on the dev store and read the new numbers off it
   with your own eyes.

The reason for the second condition is an App Store requirement, not a preference: **the listing
must describe the app that exists.** If the listing says 1,500 credits and the app bills 200, that
is a false statement in a Shopify submission. The order is: code bills it → you see it on the
screen → then and only then the listing says it.

### What to publish

| | Free | Starter | Growth | Pro |
|---|---|---|---|---|
| Monthly | $0 | $9.99 | $29.99 | $79.99 |
| Annual (save 20%) | — | $95.90 | $287.90 | $767.90 |
| Credits / month | 100 | 500 | 1,500 | 4,000 |
| Products covered | 100 | 1,000 | 5,000 | Unlimited |
| Bulk generation | ✗ | ✓ | ✓ | ✓ |
| Trial | — | 14 days, 250 credits | 14 days, 250 credits | 14 days, 250 credits |

### The constraints that will bite you

- **Plan feature lines are `maxlength 40`.** Count characters before you type. The two approved
  40-char replacements already live in `12-OFFER.md` §5.5:
  - `Two description options to compare` (34) — **not** "A/B variant testing"
  - `Email support from the founder` (30) — **not** "Priority support"
- **No pricing in images** (4.2.2). The numbers go in the plan table, never in a frame.
- **Requirement 1.2.3** — a merchant must be able to upgrade and downgrade without contacting
  support. If the plan table implies otherwise, reword it.
- Only ship what `12-OFFER.md` **§4** allows. §5 is the listing we publish *after* Phase 2 and
  Phase 3 ship. Do not borrow from §5 because it reads better. That separation is the only thing
  standing between us and a listing that describes software we have not written.
- **Read every line back on a fresh load after saving.** The listing editor has silently dropped
  edits before.

---

# TASK 3 — verify the listing is still clean

Independent of everything above. Do this every session; it takes five minutes and it has caught
real problems twice.

Load `apps.shopify.com/navaal-ai-seo-geo-content` fresh, read the **whole** page text, and count:

- Banned phrases from `09-DOCTRINE.md` §2 — expect **0**
- "A/B variant testing" and "Priority support" — expect **0** (CC/you removed both; confirm they
  stayed removed)
- Any statistic, percentage, or number-with-a-claim — expect **0** (4.3.3/4.3.4 bans statistics
  "verifiable and unverifiable")
- "first", "best", "only", "#1", "leading" — expect **0** (4.3.4)
- Any testimonial or quoted merchant — expect **0** (4.3.6/4.3.7)
- App name ≤30 chars, introduction ≤100, details ≤500, each feature bullet ≤80, exactly 5 search
  terms

Report the actual counts. Not "clean" — the numbers.

---

# TASK 4 — the deep link, once CC wires it

After CC ships C1, open the app's embed setup card on the dev store, **click the link**, and confirm
the theme editor opens with the FAQ block already added to the product template. You proved the
working URL form; now prove the button in the app uses it. A link that is correct in the source and
wrong on the screen is the failure this whole role exists to catch.

---

# TASK 5 — STILL OWNER-BLOCKED. Do not attempt.

The W1 blog post upload. `hpanel.hostinger.com` redirects to `auth.hostinger.com`, which shows an
**email + password form** — not an account chooser. **You do not type the owner's credentials.**

Leave it in the queue. Everything the owner needs is already written in
`docs/navaal/_UPLOAD-W1-POST.md`: which file goes where, the two hand-applied edits to
`blog/index.html` and `blog/feed.xml` (because the local copy may be older than the server and
overwriting would revert newer content), and the verification curl.

One thing to re-state in the queue so it is not lost: **the 71.9% is never published without the
36.2% sensitivity row beside it.** In the page they are in the same sentence and the same table.
On its own, 71.9% is exactly the kind of claim `09-DOCTRINE.md` was written to stop us making —
and none of those numbers may move onto the Shopify listing at all.

---

# HOW TO REPORT

For every task: what you did, **what you saw quoted verbatim**, and whether it matched what was
claimed. Where they differ, the difference is the finding and it goes first in the report.

Then: what you routed, to whom, and why — using `06-QUEUE.md`'s `## HOW TO ADD` procedure. **Add
your row to the INBOX without an ID.** Two sessions once both wrote `H13`. Phase R items are
`R1..R6` and cannot collide with the `H` space.

And keep doing the thing nobody asks for. Every screen you look at, look at it as a merchant who
paid $29.99 this morning and is deciding today whether that was a mistake.
