# OWNER CHECKLIST — things only Waqas can do

**Regenerated from the pending `OWNER` rows of `06-QUEUE.md` and from `11-MASTERPLAN.md`.**
Last regenerated: 2026-09-10 (revision 2). **Appended 2026-09-14 (P0.6): the pricing decision below,
and the one cost figure still unmeasured.** Appended rather than regenerated on purpose — a parallel CW
session was editing `06-QUEUE.md` at the time (it updated H7 and H10 the same day), and regenerating the
whole file would have clobbered work in flight. Nothing existing was removed.

Ordered by what each one unblocks. Every item is minutes, not hours. The number in brackets is how
many other tasks are waiting on it.

---

## ⚠ 2026-09-14, B8 — "THERE ARE NO PAYING MERCHANTS" IS NOT TRUE. ONE ACTIVE PAID SUBSCRIPTION EXISTS.

**Read before anything else on this page. 2 minutes.**

`14-PRICING.md` §6 item 8 says *"There are no paying merchants. This is the only moment this change
is free."* The Phase 4 brief said *"Expect zero."* **I queried production instead of believing it,
and it is not zero.**

Read from the database at `8831444`, 2026-09-14:

| | |
|---|---|
| Plan rows | **10** |
| `free:active` | **9** |
| **`pro:active`** | **1** |
| **Active paid WITH a subscription id** | **1** |
| Rows that ever held a charge | 1 |
| Currently trialling | 0 |

**WHAT I NEED FROM YOU, and it is the only thing I cannot answer myself.** Open the Partner
Dashboard and look at the one **Professional** subscription. **Is it a real charge, or a `(Test)`
charge on one of our own dev stores?** Dev-store subscriptions are billed as test charges and cost
nobody anything; the app history already shows one on 10 Sep (*"Starter Plan $9.99 USD (Test)"*).
The query cannot tell the two apart, and **it deliberately does not print the shop domain or the
subscription id** — a subscription GID identifies a merchant's billing record and that output goes
into a CI log. That privacy choice is what makes this question yours rather than mine.

**WHAT ALREADY SHIPPED TO THEM, and why I did not roll it back.** The locked allowances went live in
`7d23792` before this query ran. Every change is **neutral or favourable** to a Pro subscriber:

- credits **1,000 → 4,000** (4× more)
- annual **$799.90 → $767.90** (cheaper on renewal)
- alt text now costs **0 credits** instead of 1
- product cap: Pro is **unlimited**, so no new restriction
- bulk: Pro already had it

Rolling back would **cut their allowance from 4,000 to 1,000**. That is worse for them than leaving
it, so it stays. But the premise the change was made on was wrong, and you should know that rather
than find out later.

**The one thing to check if it IS a real charge:** a blog post now costs 3 credits where it cost 1.
At 4,000 credits that is not a constraint, but it is the only line that moved against them.

**What to paste back:** "test charge" or "real charge", and the plan name. If real, `14-PRICING.md`
§6 item 8 needs correcting and `04-DECISIONS.md` should record that the change shipped to a live
subscriber.

**Re-run it yourself any time:** the **Paid plans check** workflow in GitHub Actions. Read-only.

---

## NEW, 2026-09-14 — READ THIS ONE FIRST. IT IS A DECISION, NOT A TASK.

### ✅ CLOSED 2026-09-14 — the owner answered **(b) with a floor**: stay inside the category on price, win on allowance and honesty, never below 42% margin.
The decision is `14-PRICING.md`, recorded in `04-DECISIONS.md` under **PRICING — LOCKED 2026-09-14**.
Free-tier model spend is accepted at ≈$1.51/shop/month. **Nothing below this line needs an answer.**
It is kept only as the reasoning that produced the decision.

### THE PRICE LIST AND THE DOCTRINE CONTRADICT EACH OTHER **[blocks the pricing table, the listing copy and Phase 1's truth gate]** — 10 minutes of thinking, then one sentence

Measuring the real cost per generation (P0.6) turned up something larger than the cost.
**`08-ECONOMICS.md` was pricing a business we do not sell.**

| | What the doc modelled | What we actually bill |
|---|---|---|
| Free | $0 / 150 generations | **$0 / 25** |
| Starter | $19 / 1,000 | **$9.99 / 50** |
| Growth | $49 / 5,000 | **$29.99 / 200** |
| — | Scale $99 / 25,000 | **does not exist** |
| — | Enterprise $299 / unlimited, own key | **does not exist** |
| Pro | — | **$79.99 / 1,000** |

Not one row matched. There is no Scale plan, no Enterprise plan and no bring-your-own-key path
anywhere in the code or the database — searched and confirmed. The doc's headline risk ("Scale is
the plan to watch… negative at full use") named a plan we do not have.

**The good news, and it is genuinely good:** cost is **not** a problem. Measured, every paid plan
clears **62.5%–85%** margin even if a merchant spends every credit on the most expensive content
type, every month. A free install costs at most **$0.75/month**. There is room to move prices in
either direction.

**The problem is revenue.** `09-DOCTRINE.md` says we sell *proof*, not a utility, and should price
at roughly **double** the category ARPU of $25–35. The real list yields about **$27.49** ARPU at a
plausible mix — *inside* the category, not double it. The old ladder promised **~$9.9k** MRR at 150
merchants. The real list gives **~$4.1k**.

**Your decision — one of two, and only you can make it:**

- **(a) Raise the prices** toward the premium the doctrine claims. The margin data says there is
  headroom, and nothing in the cost structure argues against it.
- **(b) Drop the premium claim** from the doctrine and position inside the category at these prices.

Either is defensible. **Continuing with both is not**, because the listing copy, the pricing table
and every revenue projection depend on which is true.

**What done looks like:** one dated sentence in `04-DECISIONS.md` saying which. Until then
`08-ECONOMICS.md` §4 says in writing that none of its figures should be used for planning.
**Paste back:** "(a) raise prices" or "(b) drop the premium claim", and any target ARPU you have in
mind.

### The one cost figure still unmeasured needs your billing dashboards — 5 minutes
Every per-generation cost is now `MEASURED`. Infrastructure is not, and nothing in the repository
can see an invoice. Read last month's actual totals from **Fly**, **Neon**, and whoever bills the
**Redis**, and paste the three numbers with the month they cover.
*Why it matters:* at 25 installs, model spend is pennies — so infrastructure may well be the
**larger** line, which changes where the free-tier ceiling actually binds.

---

## THE PLAN CHANGED ON 2026-09-10. THESE SIX COME FIRST.

`11-MASTERPLAN.md` revision 2 put money and clocks ahead of everything. Four of these are calendar-
bound — they cost nothing to start and they block months of work if they are not started now.

### A. Prove the billing chain with real money **[blocks all revenue]** — half a day, **this week**
Nobody has ever completed a paid subscription on this app, and it is the largest unquantified risk
in the company. On a dev store: **subscribe → upgrade → downgrade → cancel**, each confirmed in the
Partner Dashboard. Then drive the 100%-quota upgrade card → Approve → confirm you land back
in-admin and `diag-shop.cjs` shows `upgradePromptSource: "quota100"`.
*A billing bug found by a merchant is a one-star review, and at zero reviews that is existential.*

### B. Start Google OAuth app verification **[blocks the whole Google proof engine]** — **this week**
Assume `webmasters.readonly` is a sensitive scope. You need a published privacy policy on a verified
domain, domain ownership proven via Search Console, current contact info, and a demo video.
**Google's calendar is 3–8 weeks and there is no appeal.** Unverified apps are capped at **100 users
total**. Free to start. Not started.

### C. Apply for Shopify Level 2 protected customer data access **[blocks every AI-referral number]** — **this week**
`shopifyqlQuery` needs `read_reports` **and** Level 2, even for queries that touch no customer data —
Shopify staff confirmed this. Security questionnaire plus a review cycle. Not started.

### D. Write the list of 30 named prospects **[the critical path]** — **within 7 days**
Names, not channels. Network, Bilby's audience, the navaal.ai list, communities where merchants
discuss this problem. **The goal is ten real stores on the free tier within 30 days and one paying
merchant within 60.** No real merchant has ever used this app; nothing in the product plan changes
that by itself, and Phase 5 is hard-gated on it.

### E. The listing-copy test — twenty five-minute calls — **next week**
Two variants: the bold claim versus the honest claim. Which do merchants choose, and can they tell
the difference? This falsifies or confirms the assumption the whole positioning rests on
(`09-DOCTRINE.md` §0.1). **If they consistently pick the bolder claim, we change the words, not the
doctrine.**

### F. Keep the human service — change two words — **decided 2026-09-10**
You said you have time to do this personally, and at a small number of merchants that is a real
advantage no large competitor can match, so **the offer stays.** What changes is the wording:
"SLA support" and "Dedicated account manager" become **"Direct access to the founder. Every question
answered within one business day. A setup call when you start."** "SLA" means a contractual
guarantee with remedies we have not written; "account manager" implies someone who exists while you
are asleep. The replacement is truer and reads better. Full wording in `12-OFFER.md` §6.

---

## 1. Approve the device binding for the two webhook scheduled tasks **[unblocks 2]** — 1 minute

Both tasks were recreated with `requires_local_device: true` and both came back
**`not bound: no_signed_approval — this task will run in the cloud only`**. Declaring the flag is
not enough; you have to approve the binding on this computer. Until you do, both fire into a
browserless cloud session at 23:00 UTC and produce nothing.

- Task IDs: `trig_01SS3kD3gVKfSeNg4LESz6S2` (11 Sep) · `trig_01TdvqbuYAcYTAoEJnNVhvhW` (17 Sep)
- **Done looks like:** both tasks list this computer, and the next run returns real figures.

*If the approval prompt does not appear, say so — the manual reading is Task 3 in `CW-BRIEF.md`
and covers the same ground.*

## 2. Log in to `flyctl` on this computer **[unblocks 2]** — 2 minutes

The local token expired mid-session on 2026-09-10: `fly status -a contentclaude` returns
`Error: no access token available`. Deploys are unaffected (CI uses the `FLY_API_TOKEN` secret) —
only local inspection is blocked, which blocks two INFRA items.

- Run `flyctl auth login` in a terminal and complete the browser flow.
- **Done looks like:** `fly status -a contentclaude` lists four machines.

## 3. Then clear the dead feature flag (INFRA6) — 1 minute

- `fly secrets unset FEATURE_MAGIC_MOMENT -a contentclaude`
- then `curl -s "https://app.navaal.ai/api/health?deep=1"` and confirm `status: ok`
- **Note:** this restarts the machines, so do it at a moment when a deploy would be acceptable.
- **Done looks like:** deep health `ok`, and `fly secrets list` no longer shows the name.

## 4. Decide the UptimeRobot alert-contact route **[unblocks 1]** — a decision, not a task

Alerts currently reach one inbox. A second contact needs a team member, and UptimeRobot puts team
members on paid plans with notify-only seats "sold separately". The account is free tier.

- **(a) Gmail forward** `gujjarcsu@gmail.com` → `hello@navaal.ai` — free, recommended
- (b) change the account email
- (c) buy a seat — billable, needs your explicit approval

**Reply with a, b or c** and the rest is a CW task.

## 5. Verify a Search Console property for a **merchant** store **[unblocks Phase D]** — 10 minutes

`navaal.ai` is verified; `askebs.com.au` is **not** (both `sc-domain:` and `https://` forms probed
2026-09-10). Phase D — indexation proof, Search Console result proof, the control-group holdback —
is the moat, and all three need a *shop's* Search Console data, not ours. Without one verified
merchant property, Phase D has nothing to develop against.

- **Done looks like:** a property verified on an account the app can OAuth into, showing impression
  data.

## 6. Run the restore drill (INFRA7) **[removes a false promise]** — 15 minutes

The runbook promises a restore path nobody has ever exercised, and Neon retention was **6 hours**
until 2026-09-10 — the promise was false for the whole time it was written.

- In the Neon console, restore the latest state into a **NEW branch**. Never production.
- Against that branch: `npx prisma migrate status`, then count rows in `Shop` and `GeneratedContent`.
- **Done looks like:** the date, the branch name and the two row counts recorded in `PROGRESS.md`.

## 7. Prove the billing chain with real money (C11, H6) **[unblocks revenue]** — 20 minutes

Nobody has ever completed a paid subscription on this app. A billing bug found by a merchant is a
one-star review, and at zero reviews that is existential.

- On a dev store: subscribe → upgrade → downgrade → cancel.
- Confirm each step appears in the Partner Dashboard.
- Separately, drive the 100%-quota upgrade card → Approve → confirm you land back in-admin, and
  that `diag-shop.cjs` shows `upgradePromptSource: "quota100"`.
- **Done looks like:** four billing events visible in the dashboard, and the attribution field set.

## 8. Two short screen recordings — 10 minutes

Both are acceptance evidence, and one of them is a listing asset.

- **(a)** ONE install, URL bar visible, grant → first proposal, **under 120 seconds**. The cohort
  store `navaal-ttv-01` (*Harbourline Goods*) did this in **under 18 seconds** on 2026-09-10, so
  the recording should be easy.
- **(b)** A dev store driven 0 → 20 → 25 generations, URL bar visible: nothing below 20, one banner
  from 20, actions replaced at 25. Confirm the banner stays dismissed on reload **and on another
  device**.

---

## STANDING DECISIONS STILL OPEN

These sit in `04-DECISIONS.md` waiting on you. None blocks work today, but each will block a phase
when it arrives.

- [ ] Free-tier model spend, ~$0.75 per active free install per month — acceptable ceiling?
- [ ] Enterprise "onboarding call + 1-business-day response" — confirmed honourable in writing?
- [ ] `navaal.ai/tools` — keep or cut? It exists and now carries an install link.
- [ ] Bilby ↔ Navaal bundling: one company, two products, one shared probe.
- [ ] Done-for-you setup at $750 — the process has to exist before it is promoted.
