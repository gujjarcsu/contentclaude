# CW — the outreach run. Thirty stores, re-counted today, ready to send.

## Why this and not the app

Every embedded load of the app is answering **401** right now — a client-secret
mismatch, diagnosed from the production log, the owner's to fix. **Do not open
the app in a dev store, do not try to work around the 401, do not touch
`fly secrets`.** Every task that needs the app inside a Shopify admin is
blocked until the owner reports it fixed, and none of them are in this brief.

What is not blocked is the only thing that actually moves the north star:
getting the first real merchants. Do that.

## ORIENT

- `docs/navaal/OUTREACH-PACK.md` — the messages, the reply scripts, the
  never-say list, and the empty send log at §8.
- `docs/navaal/PROSPECTS.md` — the thirty stores, built 2026-09-15, with a
  whole-catalogue count each.
- `docs/navaal/09-DOCTRINE.md` — binding on every word you draft.
- `tools/prospects/recheck.mjs` — re-counts one store's public catalogue.

Three rules from the pack that you will be tempted to break, so read them
twice: **quote the store's own number, never a market number**; **no barcode
claim to anyone, ever** (the public `products.json` does not expose it — the
100% we once measured was an artifact of the field not existing); **no W1
statistic in a first message**.

---

## 1. Re-count all thirty. The counts are a day old and a day is enough.

`node tools/prospects/recheck.mjs <host>` for each of the thirty hosts in
`PROSPECTS.md`. Run them politely — sequential, not thirty at once; the tool
already sends an identifying user agent.

Write the result to `docs/navaal/PROSPECTS.md` as a new column dated today,
beside the 2026-09-15 figure. Do not overwrite the old one; the pair is the
evidence that the number we quote is today's.

Three outcomes and what each means:

- **The count moved by a little.** Normal. Use today's number.
- **The count moved a lot, or the short-description count collapsed.** Someone
  is already working on it. **Drop the store from the send list** and say why
  in the row. Arriving to tell a merchant about a problem they fixed last week
  is the single fastest way to be deleted unread.
- **The fetch fails, or the store 404s.** Drop it, note the status code.

Report the tally: how many of thirty survive.

---

## 2. Confirm the contact route, one at a time, before anything is drafted

For each surviving store, open the contact route `PROSPECTS.md` recorded and
check it is still there and still the best one: a named human beats a generic
inbox, a contact form beats an Instagram DM. **Read-only. Do not submit any
form, do not send any DM, do not sign in anywhere.** If the recorded route is
gone, find the current one or drop the store.

Record the route you confirmed and the date. If you found a named person, put
the name in the row — the pack's email template uses it.

---

## 3. Draft one message per surviving store. Do not send any of them.

Use the pack's §2 templates — email ≤120 words, contact form ≤80, Instagram DM
≤50 — and fill in **that store's own re-counted number** from step 1. One
draft per store, in a new file `docs/navaal/OUTREACH-DRAFTS.md`, each under a
heading with the store, the route, and the number being quoted.

Then check your own drafts against `09-DOCTRINE.md` and the pack's never-say
list, and write the check into the file: for each draft, the claim it makes,
where that claim's number came from, and the doctrine line it could have
tripped but did not. A draft you cannot source is a draft you delete.

**You do not send.** The owner sends, from his own address, in his own time.
Your output is a file he can work through.

---

## 4. One thing only the owner knows — ask for it in your report

§8 of the pack, the send log, is empty, but the owner has already emailed
some of these stores by hand. **Ask him which ones, by store name, and on
what date.** Until he answers, mark every draft `UNCONFIRMED — may already
have been contacted` at the top of the file. A second cold email from the
same founder about the same thing reads as automation, which is precisely
what the pack is written to avoid.

---

## 5. A regression check that costs five minutes and needs no login

The six translated listings went live yesterday after a lot of editing. Re-run
the #19 test from outside, cache-busted, on all six —
`apps.shopify.com/navaal-ai-seo-geo-content?locale=de` and the other five:
**the auto-translation marker absent AND our bullet 3 present as an exact,
whole-string match, in the same fetch.** Prefix matching is not good enough;
false green #23 was overstated exactly that way, and the correction is in the
queue. Report six results, pass or fail, with the string you matched.

---

## 6. Report

Plain prose. The tally from step 1 and which stores you dropped and why; the
routes you confirmed or replaced; the drafts file and how many drafts are in
it; your question to the owner from step 4; and the six locale results. Where
you could not do something, say what blocked you rather than substituting a
weaker version of the task and reporting it as done.
