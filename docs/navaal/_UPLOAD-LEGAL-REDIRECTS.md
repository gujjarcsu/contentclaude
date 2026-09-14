# Upload instructions — the legal pages get one home (Phase 8 Part B)

**Status: PREPARED, NOT UPLOADED.** Same Hostinger session as `_UPLOAD-W1-POST.md`; three files,
one paste. CW is re-pointing the listing's Privacy policy URL to `https://app.navaal.ai/privacy`
today, so after this the listing, the marketing site and the app all resolve to the same
generated page.

**Why.** `app.navaal.ai/privacy` and `/terms` are generated from `app/utils/legal.js` and were
current on 14 Sep. The listing pointed at `https://navaal.ai/privacy` — the static Hostinger copy
from 4 Sep — and `navaal.ai/terms` was the **8 July** page: 7-day trial, "25 generations", "two
months free", no BYO-key disclosure, `support@`. CW read those; CC verified the app's; both
reports were true. False green #14 — the third-homes lesson in a new costume.

## 1. Upload (safe — each file replaces a page that is now a redirect shell)

From `docs/navaal/_upload-legal-redirects/`:

- `privacy.html` → `public_html/privacy.html` (overwrites the 4 Sep copy)
- `terms.html` → `public_html/terms.html` (overwrites the 8 July copy)

Each is a 0-second `meta refresh` to the app page with `rel="canonical"` and `noindex`, so it
works even if the host ignores `.htaccess`, and nothing indexes the shell.

## 2. Paste (do NOT overwrite `.htaccess` — the local copy may be older than the server's)

Open `public_html/.htaccess` in the Hostinger file manager and paste the contents of
`htaccess-snippet.txt` **inside** the `<IfModule mod_rewrite.c>` block, after the HTTPS and
non-www rules and **before** the *"Redirect any \*.html request to its clean URL"* rule. Two
lines of rules; the rest is comment.

## 3. Check live, cache-busted (all four must pass)

```
curl -sI "https://navaal.ai/privacy?cb=$(date +%s)"      | grep -iE "^(HTTP|location)"
curl -sI "https://navaal.ai/terms?cb=$(date +%s)"        | grep -iE "^(HTTP|location)"
curl -sI "https://navaal.ai/privacy.html?cb=$(date +%s)" | grep -iE "^(HTTP|location)"
curl -sL "https://app.navaal.ai/terms?cb=$(date +%s)"    | grep -c 'rel="canonical" href="https://app.navaal.ai/terms"'
```

Expect `HTTP/2 301` + `location: https://app.navaal.ai/privacy` (and `/terms`), one hop each, and
`1` for the canonical. If the first three answer `200`, the `.htaccess` paste did not take — the
meta-refresh shell still forwards visitors, but fix the paste so search engines get the 301.

## 4. Two things seen while there, NOT changed — owner's call

- **43 pages** on the marketing site link to `/privacy` and `/terms`. They keep working (one 301
  hop). Rewriting 43 hrefs in a local copy that may be older than the server is the revert risk
  `_UPLOAD-W1-POST.md` warns about, so the links are left as they are.
- **`support@navaal.ai`** appears on `about`, `apps`, `apps/navaal-seo`, `au/index` and one blog
  post. The app, the listing and the generated legal pages say `hello@navaal.ai`. If `support@`
  is not a real inbox, those five pages are giving out a dead address; if it is, the app's
  `CONTACT_EMAIL` could say so. One decision, then either five edits on the site or one in
  `app/utils/legal.js`.

## 5. What was changed in the app for this

`app/utils/legalPage.server.js` now emits `<link rel="canonical" href="https://app.navaal.ai/…">`
on both pages (asserted by `tests/utils/legalCanonical.test.js`). Live at the sha recorded for Part B in
`06-QUEUE.md`. The local static-site copy in `Downloads/navaal.ai` carries the same two shells and the
two rules, so a future full re-upload of the site does not revert this.
