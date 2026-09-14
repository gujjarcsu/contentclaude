# CC — PHASE 6: CLOSE THE APP. THIS IS THE LAST APP-COMPLETION PHASE.

Paste this whole file. It is deliberately short. Phase 5 was the best work this project has
produced and there is not much left that is code.

**Verified independently before writing this:** production `43f56a2`, **245 columns**, deep health
ok, worker running, zero failed, zero stuck. Local HEAD `13a5a0e`. Your P5 claims hold.

Three things from your report I want to name, because they are the reason this brief is short:

- **The diagnostic built to verify P5.0's lesson contained P5.0's defect, and caught itself by
  refusing to conclude from a miss.** That is the single most valuable habit in this system. It is
  worth more than the fix it was chasing.
- **Checking `invalidateCache` prefixed BEFORE fixing your own script.** If it hadn't, P5.2's whole
  fix would have been a no-op that every mocked test called green. You looked for the expensive
  failure first.
- **"Four times today a guard fired on the comment explaining it."** Writing that into
  `07-VERIFICATION.md` with the fix — instead of deleting the explanation and leaving the rule
  enforced and its reason gone — is exactly L18.

And the honesty in P5.2 is the standard: *"what this does not prove is that a click on Review
reaches that function."* You stated both halves separately instead of letting one imply the other.

---

## P6.0 — THE THREE LOOSE ENDS FROM P5. ALL SMALL.

**1. Prove the click reaches the invalidator.** You named this gap yourself. Asserted at the source
and break-tested is good; it is not the same as a merchant clicking Review and the cache clearing.
Do it on the dev store, read the key before and after, and report the two reads. Your guard that
finds a fourth publish site before it ships stays.

**2. `BYOK_ENCRYPTION_KEY` is unset, so BYO key fails closed.** Failing closed is correct — do not
change that. Run the init workflow. **`fly secrets import` from a file, never `fly secrets set`:**
`cmd.exe` strips `%xx` and corrupts the value silently, and a corrupted encryption key is a feature
that appears to work and cannot decrypt anything afterwards. Print nothing — not the key, not a
prefix, not a length. Then prove one round-trip: save a key, read it back through the app, confirm
it decrypts, confirm it appears nowhere in any log.

**3. Record the metrics decision in the file, not just in two route comments.** Your P5.1 call was
right and I want it defended in writing rather than re-litigated. `metrics.server.js` counts
`GeneratedContent` by `shop` and `productId` with **no join to Shopify product status**, so it keeps
counting archived and deleted products — and that is *correct* for "how much has this app published
for me" and false only when the word beside it claims something about the storefront. You fixed the
word. But that decision now lives in `app._index.jsx` and `app.products.jsx` comments, while
`metrics.server.js` — the first file a future session opens — says nothing. One paragraph at its
top, one row in `04-DECISIONS.md`. Otherwise the next session "fixes" the count and quietly destroys
the record.

---

## P6.1 — THE THIRD HOME OF THE PRICE. READ THIS EVEN THOUGH IT IS NOT YOUR TASK.

CW found Shopify's **registered plan metadata** on the public listing: `$99.90/year and save 17%`,
and Shopify's own `7-day free trial` badge sitting directly under our true 14-day line.

Your code is right. I confirmed the app is on the **Billing API** — `billing:` built by
`buildBillingConfig()` from the locked table, `billing.request()` at `app.plans.jsx:154`, and the one
live subscription carries an id created through that path. So those figures are **display, not
charging**. Nobody pays $99.90 and nobody gets 7 days. It is routed to the owner.

**The lesson is yours to carry, because it defeated two of your own audits.** A locked price has
**three** homes: the code, the listing fields we author, and **Shopify's registered plan metadata,
which we do not author and cannot see from the code.** Phase 4 audited (1) and (2) and declared the
price consistent. Phase 5 audited (1) and (2) harder — a 0-second-copy sweep, a break test, three
new importers — and declared it consistent again. Both were true and both were incomplete, because
(3) was never in the inventory and (3) is what a merchant reads first.

Add it to `07-VERIFICATION.md` as the rule: **a claim that a value is consistent "everywhere" must
enumerate every system that stores it, including systems outside this repo.** A sweep that is
exhaustive within its own boundary and silent about the boundary is false green #11 wearing a
different layer.

---

## P6.2 — PHASE 6 PROPER: WHAT A MERCHANT NEEDS THAT DOES NOT EXIST

From `11-MASTERPLAN.md` Phase 6. Nothing here is glamorous and all of it is required before a real
merchant pays real money:

- **Support surface.** One reachable route for a question, and a reply path the owner can actually
  serve. The listing already promises `Email support from the founder` and
  `Questions answered within 1 business day`. **Those promises are live right now and there is no
  mechanism behind them.** At 0 reviews, one unmet promise halves the rating.
- **Legal.** Privacy policy and terms reachable from inside the app and from the listing, accurate
  about what we store (including, now, an encrypted merchant AI key) and what we send to Anthropic.
  This is a submission requirement, not a nice-to-have.
- **Uninstall and reinstall.** Prove what happens to a merchant's data, their credits, their trial
  and their BYO key across uninstall → reinstall. You already made the annual 2× boost
  structurally once-ever against exactly this. Prove the rest, and write down what is intentional.
- **GDPR webhooks.** `shop/redact` is delivering again (12 successes, 0 failures since 2026-09-10
  per H10). Prove `customers/redact` and `customers/data_request` actually do something, not just
  return 200.

**Then stop.** Do not start Phase 2 or Phase 3 in this brief. They are the differentiators and they
deserve their own phase with their own gate.

---

## DONE MEANS

- [ ] The Review click proved to clear the cache, both reads reported
- [ ] `BYOK_ENCRYPTION_KEY` set via `fly secrets import`, one round-trip proved, nothing printed
- [ ] The metrics decision in `metrics.server.js` and `04-DECISIONS.md`
- [ ] The three-homes rule in `07-VERIFICATION.md`
- [ ] Support route live and reachable, matching what the listing already promises
- [ ] Privacy policy and terms accurate and reachable from both places
- [ ] Uninstall → reinstall behaviour proved and documented for data, credits, trial and BYO key
- [ ] `customers/redact` and `customers/data_request` proved to do work
- [ ] Written back (**L18**)

Same gates: push only at boundaries, poll `/api/build-info` until the sha matches, deep health ok,
then record. A push to `main` **is** a deploy. Route on the four reasons in `03-PROTOCOL.md` only.
