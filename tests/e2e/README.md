# End-to-end suite — a manual pre-release gate

**This suite is not run by CI, and must not be.** It drives a real Chrome against a real Shopify admin
with a real saved session, and it **writes**: it generates content, publishes it to a live storefront,
and changes plans. It is a gate a human runs before a release, reads, and signs off.

Everything CI runs is in `tests/routes/` and `tests/utils/` — those are fast, hermetic, and blocking.

## What it is for

It asserts **ground truth in the Shopify admin**, not what the app's own UI claims. That distinction is
the whole point. The worst bug in this app's history was a UI reporting success while writing nothing:
alt text that said "published" and never reached Shopify, and FAQ metafields recorded as live that were
never set. A test that reads the app's own page would have passed throughout.

So these tests generate content through the app, then go and look at the product in the Shopify admin.

## The store

**`navaal-qa-fresh.myshopify.com`. Never a merchant's store.**

`playwright.config.js` enforces this: the target must be one of the known test stores, or the run refuses
to start. That is deliberate — this suite edits whatever store it is pointed at, and a mistyped
`SHOP_HANDLE` would be editing somebody's live catalogue.

```
Error: Refusing to run the e2e suite against "some-merchant". It is not one of the known
test stores (navaal-qa-fresh, contentpilot-dev2), and this suite writes to whatever store
it is pointed at. If you really mean it, set E2E_ALLOW_UNLISTED_STORE=1.
```

The override exists so the refusal cannot become a blocker, not so it can be used routinely.

## Running it

```bash
# 1. Log in. A browser opens; a HUMAN types the credentials. No agent ever does.
node tools/proof/login-cdp.mjs

# 2. Run against the QA store.
npx playwright test

# 3. Read the report. Do not skim it.
npx playwright show-report
```

The session is saved to `tests/e2e/.auth/shopify.json`, which is gitignored. When a run fails at the
first navigation with a login screen, the session expired — re-run step 1 rather than debugging the test.

Settings worth knowing before you interpret a failure:

- **Sequential, one worker.** These mutate a shared store; parallel runs produce false failures.
- **No retries.** A retry that passes hides a flake, and here a flake usually means a real race.
- **Three minutes per test.** A generation genuinely takes 20 to 40 seconds.
- Screenshots always, video and trace on failure. That evidence is the point of a manual gate.

## When to run it

Before an App Store submission, and before any release that touches publishing, billing or the embedded
shell. Not on every commit — it takes minutes, it needs a human login, and it changes a real store.

## What it covers, and what it does not

Covered: alt text reaching Shopify media; the publish path writing real product fields; the FAQ metafield
actually being set; the embedded shell loading inside the admin iframe; responsive layout at 768px.

Not covered, deliberately: billing state transitions (those need a real charge and live in the manual
billing proof harnesses under `tools/proof/`), and anything that would require a second merchant account.
