# THE ONE IMAGE SITTING — 24 uploads, six locales, four each

**Why you and not CW:** no script route fires the App Store editor's screenshot DropZone. Synthetic
`change`, synthetic `drop`, the Chrome extension's `file_upload` (the file genuinely lands on the
input and the component still ignores it), Playwright `setInputFiles` — all proven silent. Your
click is the only thing that works. Everything else on these listings is CW's.

**The files are exactly 1600×900.** The editor rejects 3200×1800. Use `listing-assets/1600x900/`.

**Four per locale, not three.** Three desktop screenshots plus the **feature-media thumbnail** — a
locale cannot publish without both. Verified on German: with text complete it still reads
*"This listing has 2 issues to fix — App store listing content: Feature media, Screenshots."*

---

## The feature-media thumbnail — settled

The owner supplied the original branded card. It is at
`listing-assets/1600x900/feature-thumbnail-1600x900.png` — CW read its bytes: valid PNG,
**1600×900 exactly**, 41,313 bytes, no resize needed, and looked at it: the "Navaal." wordmark over
*"AI content that gets you found"* / *"Google search & AI answer engines · inside Shopify"* and three
chips (SEO Audit · AI Content Generation · Bulk Optimise). No statistic, no superlative, no
testimonial; Google and Shopify named descriptively only. It matches English's feature media, so
every locale's header will match English.

**Use this one file for all four "Feature media" rows below.**

---

## Per locale: Save once at the end, then tell CW `images up`

Editor URL pattern — `https://apps.shopify.com/services/partner-app-submissions/1279a14cca41d4a6f8e6e3c485870b77/<locale>`

Buttons, exactly as the editor labels them: **Upload image** on each empty screenshot slot under
*Desktop screenshots*; **Upload image** under *Feature media* once *Video* is switched to *Image*, or
the thumbnail slot beside the Video URL if you keep the video.

| # | locale | slot | file | alt text to paste |
|---|---|---|---|---|
| 1 | de | Screenshot 1 | `02-review-desktop-1600x900.png` | *(already saved)* |
| 2 | de | Screenshot 2 | `03-products-desktop-1600x900.png` | *(already saved)* |
| 3 | de | Screenshot 3 | `05-settings-desktop-1600x900.png` | *(already saved)* |
| 4 | de | Feature media | `feature-thumbnail-1600x900.png` | — |
| 5 | fr | Screenshot 1 | `02-review-desktop-1600x900.png` | *(already saved)* |
| 6 | fr | Screenshot 2 | `03-products-desktop-1600x900.png` | *(already saved)* |
| 7 | fr | Screenshot 3 | `05-settings-desktop-1600x900.png` | *(already saved)* |
| 8 | fr | Feature media | `feature-thumbnail-1600x900.png` | — |
| 9 | es | Screenshot 1 | `02-review-desktop-1600x900.png` | *(already saved)* |
| 10 | es | Screenshot 2 | `03-products-desktop-1600x900.png` | *(already saved)* |
| 11 | es | Screenshot 3 | `05-settings-desktop-1600x900.png` | *(already saved)* |
| 12 | es | Feature media | `feature-thumbnail-1600x900.png` | — |
| 13 | it | Screenshot 1 | `02-review-desktop-1600x900.png` | `Navaal Revisione: sei bozze, approvate prima di pubblicare` |
| 14 | it | Screenshot 2 | `03-products-desktop-1600x900.png` | `Navaal Prodotti: catalogo con stato dei contenuti` |
| 15 | it | Screenshot 3 | `05-settings-desktop-1600x900.png` | `Navaal Impostazioni: voce di marca, lingua, approvazione` |
| 16 | it | Feature media | `feature-thumbnail-1600x900.png` | — |
| 17 | pt-BR | Screenshot 1 | `02-review-desktop-1600x900.png` | *(CW types it with the rest of the pt-BR text)* |
| 18 | pt-BR | Screenshot 2 | `03-products-desktop-1600x900.png` | *(CW)* |
| 19 | pt-BR | Screenshot 3 | `05-settings-desktop-1600x900.png` | *(CW)* |
| 20 | pt-BR | Feature media | `feature-thumbnail-1600x900.png` | — |
| 21 | ja | Screenshot 1 | `02-review-desktop-1600x900.png` | *(CW)* |
| 22 | ja | Screenshot 2 | `03-products-desktop-1600x900.png` | *(CW)* |
| 23 | ja | Screenshot 3 | `05-settings-desktop-1600x900.png` | *(CW)* |
| 24 | ja | Feature media | `feature-thumbnail-1600x900.png` | — |

**de, fr and es are ready for their four now** — their text is complete and saved, and their three alt
texts are already in, so you only place images.

**it, pt-BR and ja do not exist yet.** Creating a locale needs *Add a language* on the Partner
Dashboard, and that session has expired (see the queue INBOX). Once you are signed in there, CW
creates and fills all three, then these twelve rows become live too.

**Do not publish anything yourself.** CW verifies each locale — three new ids, 1600×900, thumbnail
present, alt texts ours, issues **0** — and publishes on that evidence, then proves each on the
public page with the auto-translation line absent and our own bullet 3 present.
