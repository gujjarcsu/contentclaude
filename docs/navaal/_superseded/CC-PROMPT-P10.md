# CC — PHASE 10 BRIEF: FOUR SMALL THINGS THAT BLOCK THE LISTING IMAGES, THEN THE FUNNEL, THEN THE SHAPES

Paste this whole file. It replaces `CC-PROMPT-P9.md` (moved to `_superseded/`). Production
`1e6873e`, healthy, verified from outside: `/terms` carries the reset sentence, `/privacy` carries
`International transfers`, the bundle budget runs in CI. F3–F6 closed with a failing-then-passing
fixture. False green #15 — a `;` chaining a push after a suite you had watched fail — recorded and
fixed. Good phase.

**The Part A gate passed: CW's second count is 15 → 4.** FR1 fixed on the exact trigger that broke
it; FR9 proved fixed by a 105-second poll across twenty re-renders. That is the number that
mattered, and it moved.

**But one of the four remaining got worse, and it is the pattern this project keeps repeating.**

---

## PART A — FOUR ITEMS. THEY BLOCK THE CAPTURE. NOTHING ELSE COMES FIRST.

| | Finding, from CW's screen | What "fixed" means |
|---|---|---|
| **FR8** | The row used to say `Now 21/100` — the store score, obviously misplaced. It now says **`This product: 21/100`** on every row, and **21 is still the store score.** Your `31/100` read was on a different store; on `navaal-qa-fresh` every row carries the same number. **The relabel turned a misplaced number into a false claim.** Third time this shape has appeared (Products `live`, Home `Live on your storefront`, now this). | Each row shows **that product's** score from the per-product scorer, or the row shows no score. A test with two products of different scores asserts two different numbers render. |
| **N1** (new) | First-run splash: *"3 credits of the 100 you have left"*; the usage card on the same load: `3 / 100 used · 97 left`. The splash counts the credits it is spending as still available. | One source for "left", read after the debit. Test: splash number equals card number on the same render. |
| **FR13** | Row `[Review]` on a `Ready to review` draft opens `/app/products/<id>` with `Generate Content` and no approve/publish control. Unchanged since the first walk. | It opens Review scoped to that product, with approve and publish on it — or the button is not called Review. |
| **FR14** | `3/100 → 3%` is **correct**; CW's original finding was the dev2 case: `19/4000 → 0%`. | Spent credits never display as 0%. Ceil above zero, or show `<1%`. Test both cases. |

Then: **run the First-run reset workflow on `navaal-qa-fresh`** (it is frozen; the reset is the one
sanctioned mutation) and **post the sha to the queue**. CW re-reads the splash — three rows, three
different product scores, 97 not 100 — and captures frame 04 and the dev2 set in the same session.
That capture is the listing images, which is Track B, which is the only track that moves the
scoreboard. Do not start Part B until the sha is posted.

---

## PART B — THE FUNNEL. WE CANNOT SEE WHERE MERCHANTS LEAVE.

Scoreboard metric 9, churn, reads *"not instrumented"*. Hoodify installed and left in one minute;
we know that only because CW read the Partner Dashboard by hand. Two real merchants are installed
and pre-launch, and nobody can say whether either has opened the app twice.

Instrument the funnel, per shop, **no PII, no product content, no merchant names in any log**:

`installed → first screen rendered → first draft seen → first approve → first publish →
returned on a later day → (uninstalled)`

Timestamps only, one row per shop, written by the paths that already exist (`firstDraftSeenAt` is
one of them). Then **one internal weekly digest to the owner** — counts at each stage across all
non-test shops, and the median time between stages — sent through the same mailer as support, only
when there is at least one non-test shop. That digest is B0.3's *"what they did not understand"*
turned into a number, and it is what the owner reads before every outreach call.

Boundaries: nothing here reaches a merchant-facing screen; nothing here is a statistic that could
end up on the listing; test-store shops are excluded by the same name-pattern guard the reset
workflow uses.

Ship gate.

---

## PART C — THE STORE SHAPES WE HAVE NEVER TESTED (backlog F1, F2)

Every real merchant will be a shape we have not run. `05-EVIDENCE.md` §4 lists the axes. Two
things, in this order:

1. **The fixture matrix** over those axes — all-draft catalogue, variant-heavy (barcodes on later
   variants, now that F3 is fixed), non-English product data, B2B-only with no online store,
   catalogue above the plan cap, a store with zero products (FR0, untested by CW). Report per
   phase which cells pass, and which you did not run. *A cell you did not test is a defect you have
   not found yet.*
2. **One real dev store per shape that matters most.** Fixtures model reality; a store is reality.
   Name them `navaal-shape-*` so the guards recognise them. **None of them is captured, none is
   frozen, and none of them is EBS.**

Ship gate.

---

## STAYS ROUTED

P3.1 on a real batch, the Lighthouse number (F13) and the storefront read all wait on the owner's
F10 twenty minutes. P3.4 on P0.10. P3.5 on a real holdout. Phase 5 on ten merchants. BFS Apply on
100 admin calls.

## HYGIENE

`git diff --cached --stat` · gates read the script's exit, pushes branch on the suite's exit (#15) ·
toml or `extensions/` change ⇒ app version (#12) · suite after the last edit · no secret printed ·
**dev2 and qa-fresh frozen until CW posts `CAPTURE COMPLETE`** — the reset is the only sanctioned
touch, and only on qa-fresh.

## DONE MEANS

- [ ] FR8: each row shows its own product's score, or none — proved with two different numbers
- [ ] N1, FR13, FR14 fixed with tests; reset run on qa-fresh; sha posted; **CW's capture happened**
- [ ] Funnel rows per shop, weekly digest to the owner, no PII, test shops excluded
- [ ] Fixture matrix reported per cell; one real dev store per priority shape
- [ ] Written back (**L18**)
