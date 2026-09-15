# Recordings — what is here and what each take proves

Playwright `recordVideo` writes `page@<hash>.webm`. Rename each take to the name in its JSON report
(`H4-…`, `H5-…`, `H6-…`) once you know which is which; the report's `startedAt` matches the file's
mtime. `-no-urlbar` is in every name because Playwright cannot record the browser URL bar — the JSON
`trail` is the substitute.

## H4, first take — video good, verdict NOT VALID

`H4-fresh-install-to-first-draft-no-urlbar.json`, from the owner's run. The video exists and the
flow is in it. **The 120-second verdict it carried is not a real H4 measurement and must not be
recorded as a fail.** The trail shows why:

```
  0.4s  admin.shopify.com/                      <- cold start, not signed in
  1.7s  accounts.shopify.com/select             <- sign-in
  6.4s  .../store/contentpilot-dev2             <- wrong store
122.5s  .../store/navaal-qa-fresh/              <- 116s spent getting to the right store
145.5s  .../apps/navaal-seo-geo-content         <- app opens
158.4s  .../settings/apps                       <- back OUT to the apps list
328.4s  .../apps/navaal-seo-geo-content/app     <- back in, 170s later
```

The old harness bracketed "first app URL → last navigation", which swallowed the store hunt and a
170-second excursion back through `settings/apps` — almost certainly the uninstall/reinstall. It
reported `elapsedInAppMs 182991` against a 120000 budget and `withinBudget false`. That number
measures the recording session, not the install-to-first-draft flow.

**Fixed in the harness.** It now starts the clock at the first app URL *after the last install
boundary*, counts app segments, and — when a take crosses an install boundary again after the app
was already open — refuses to give a verdict at all, setting `withinBudget: null` and
`takeLooksMixed: true` with the reason in `verdictNote`. A take that wanders gets no green and no
red; it gets re-recorded.

**So H4 is owed one more take:** open the app fresh on `navaal-qa-fresh`, run install → grant →
first screen → first draft, and close the window. Nothing else in the take.

Three `.webm` files are present and only one JSON — the report is written when the window closes
cleanly, so two takes ended another way. `ffprobe` reads a duration from one (108.7s) and `N/A` from
the other two, meaning their headers were never finalised. Those two are not evidence of anything.
