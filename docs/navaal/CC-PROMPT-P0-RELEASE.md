# CC — P0: RELEASE THE APP VERSION. A STOREFRONT XSS FIX HAS BEEN UNRELEASED SINCE 9 SEPTEMBER.

Paste this whole file. **Do this before anything else in your queue**, including the Review-click
proof and Phase 2. Nothing in Phase 6 is more important than this, and most of it is one command.

Production is `6429bd9`, 255 columns, healthy — your GDPR and uninstall work is live and I checked
it. (Its commit message is mine and describes one file in six; that was my `git add` sweeping your
staged files, mirror of the mistake you recorded on yourself. Noted in the queue. Code is fine.)

---

## WHAT CW PROVED

From the Versions page, verbatim: active version **`navaal-seo-geo-content-15`**, *Created September
9, 2026 at 4:34 am +0000*. It is the newest entry; nothing has been released since.

Commit **`7942c30`** — *"fix(phase-0 group D): the six security defects"* — landed at
2026-09-09 21:26:53 +1000 = **11:26:53 UTC**, six hours fifty-two minutes **after** the version was
cut. Item 18 in that commit escaped every interpolation in
`extensions/geo-schema/blocks/faq_visible.liquid` because *"Liquid does NOT auto-escape"*.

**`fly deploy` ships the container. It does not ship `extensions/` or `shopify.app.toml`. Only
`shopify app deploy` — a new app version — does.** So every green deploy this week was true about
the container and said nothing about the block that renders on merchant storefronts. Shopify has
been serving the `bf55847` (12 Aug) Liquid with `{{ qa.name }}` and `{{ qa.acceptedAnswer.text }}`
unescaped, for five days.

This is false green **#12** and it is now in `07-VERIFICATION.md`, `00-CONSTITUTION.md`, and — as a
mandatory third step at every ship gate that touches those paths — in `CC-STANDING-PROMPT.md`.
Read that section before you run the command.

---

## STEP 1 — CONFIRM THE DELTA (two minutes)

```
git diff 7942c30^ HEAD -- extensions/ shopify.app.toml
```

Expected: **13 lines in `faq_visible.liquid`, nothing else.** CW confirmed from the dashboard that
version 15's scopes (`write_content,write_products`) equal the toml's, so **no scope change and no
re-consent prompt for the one live subscriber.** App URL, redirect URL, proxy, webhook `api_version`
`2026-04` and all seven subscriptions already match. If your diff shows anything beyond those 13
lines, stop and say what.

Then confirm the extension identity will survive: `extensions/geo-schema/shopify.extension.toml`
has `uid = "6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4"` and the comment says never change it.
The theme deep link targets that uid. Do not touch it.

## STEP 2 — CONFIRM WHICH APP YOU ARE ABOUT TO RELEASE TO (this is the one that bites)

The Versions list shows two naming lineages: `contentclaude-5` (23 June) and
`navaal-seo-geo-content-15` (9 Sep). That means two app configs have existed. **A deploy against the
wrong toml creates a version on the wrong app and fixes nothing.**

Before deploying: which config is selected (`shopify app config use` state / the active
`shopify.app*.toml`), and does its `client_id` match the production app whose listing is
`apps.shopify.com/navaal-ai-seo-geo-content`? Say which file and which client_id, **never** the
secret. Only proceed if it is the `navaal-seo-geo-content` lineage.

## STEP 3 — RELEASE

```
shopify app deploy --version "p0-xss-<sha>" --message "faq_visible.liquid escaped (7942c30); billing display 95.90/287.90/767.90, 14-day trial"
```

Non-interactive flags as the installed CLI version supports them (`--force` skips the confirmation
prompt on CLI 3.x). **Do not pass `--reset`** — it re-links the app and is how you end up on the
wrong lineage.

**If the CLI is not authenticated, stop.** Route it: the owner runs `shopify auth login` once, or
runs the deploy himself. It is the top item on `OWNER-CHECKLIST.md`. You do not type credentials.

## STEP 4 — PROVE IT, TWO SURFACES

1. Post the **version number and its created time** to the queue so CW can read the same thing from
   the Versions page. A sha is not proof here — a version number is.
2. The side-effect read, which needs no dashboard: `save 17%` and `7-day` should go to **0** on the
   public listing without anyone editing a field, because Shopify regenerates the pricing display
   from the released billing config. CW's sweep measures exactly this. If they do not go to 0 within
   the hour, the release did not carry the billing config and we want to know why.

---

## STEP 5 — THE EXPOSURE COUNT. THIS DECIDES HOW LOUD TO BE.

The fix protects content generated **after** it. CW's report is precise about what remains exposed:

> *"What is exposed is content written before it — and the commit message is explicit that the
> server lock was broken too: 'the pipeline sanitised, then decoded, so `&lt;script&gt;` came back
> as live markup'."*

So: for **every installed shop**, read every `contentclaude.faq_schema` metafield written before
the `7942c30` deploy and check whether any question or answer contains `<`, `>`, or an entity that
decodes to one. Read-only, via the stored offline tokens, through the diag workflow. **Shop domains
never go into a CI log** — count per shop, report the counts and the number of shops, name nothing.

Then:
- **Dev/test stores with a hit** → re-normalise the metafield through the fixed `toPlainText` path
  now. It is our data in our namespace.
- **Any real merchant shop with a hit** → that is a write to a merchant's store. **Route to the
  owner with the count.** EBS is included in this rule, no exception, even though it is our own.
- **Zero hits everywhere** → say so, with the number of metafields you read. That sentence closes
  the incident.

Also check the other block: `faq_schema.liquid` emits
`{{ product.metafields.contentclaude.faq_schema.value | json }}` inside `<script type="application/ld+json">`.
Write one test that tells you whether Shopify's `| json` escapes `</` — if it does not, a pre-fix
metafield containing `</script>` breaks out of the JSON-LD block too, and the remediation above
covers both blocks. If it does, say so and move on.

---

## DONE MEANS

- [ ] Diff is 13 lines in one file; uid unchanged
- [ ] Correct config lineage named (file + client_id, no secret)
- [ ] New version released — number and created time posted, **or** routed to the owner for login
- [ ] `save 17%` and `7-day` at 0 on the public listing, read by CW
- [ ] Exposure count: metafields read, hits per shop, shops affected; remediation done for dev
      stores, routed for merchants
- [ ] `| json` escaping answered by a test
- [ ] Written back: `06-QUEUE.md`, session log, and the incident in `docs/history/`

Only after all of that: back to `CC-PROMPT-P6.md` where you left off.
