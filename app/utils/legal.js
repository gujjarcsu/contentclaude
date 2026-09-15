/**
 * P6.2 — the privacy policy and terms, as data rather than as markup.
 *
 * They live here, pure and client-safe, for one reason: **a legal document that
 * claims something the code does not do is worse than no document.** Keeping
 * the text in a module lets a test assert that every model in the schema is
 * either disclosed or explicitly exempted, so adding a column that holds new
 * data fails the build rather than quietly making this page false.
 *
 * That guard is in `tests/docs/legal.test.js`. It is the whole reason for this
 * file's shape.
 *
 * Served from `/privacy` and `/terms` as standalone HTML — no App Bridge, no
 * authentication, no admin chrome — because they must be reachable from the App
 * Store listing by a person who has not installed the app, and from inside the
 * app by one who has. App Store submission requires both.
 *
 * ── Phase 12 Part D (D1) — the same constants, in every live language ──────
 *
 * Every merchant-facing string here is a catalogue key (T), so /privacy and
 * /terms render in German from THIS file and no second copy of the policy
 * exists to drift. A paragraph entry is one of three shapes, and
 * `legalText()` renders each: a key; an array of keys joined by a space (a
 * paragraph built from two constants); or `{ key, vars }` for a generated
 * line whose vars are keys themselves. The app name, the company, the site,
 * the scan and the contact address are placeholders (`LEGAL_VARS`), never
 * baked into a key, so a change to one of them changes no translation.
 *
 * The English is binding; a translation says so at the top of the page.
 */

import { CREDIT_RESET_SENTENCE, CREDIT_ROLLOVER_SENTENCE } from "./credits.js";
import { T, enT } from "../i18n/index.js";

export const COMPANY = "Navaal";
export const APP_NAME = "Navaal: AI SEO, AEO & GEO";
export const CONTACT_EMAIL = "hello@navaal.ai";
export const LAST_UPDATED = "15 September 2026";
/** The same day, for Intl (a translated page formats the date in its own language). A test holds the two together. */
export const LAST_UPDATED_ISO = "2026-09-15";
export const SITE_NAME = "navaal.ai";
export const SCAN_NAME = "Bilby";

/** The placeholders every legal key may use. Constants, never translated. */
export const LEGAL_VARS = Object.freeze({ COMPANY, APP_NAME, CONTACT_EMAIL, SITE_NAME, SCAN_NAME });

/**
 * One paragraph entry → its text in a language. Pure.
 * @param {string|string[]|{key: string, vars?: object}} entry
 * @param {Function} [t] a createT() result; English by default
 */
export function legalText(entry, t = enT) {
  if (Array.isArray(entry)) return entry.map((e) => legalText(e, t)).join(" ");
  if (entry && typeof entry === "object") {
    const vars = Object.fromEntries(Object.entries(entry.vars ?? {}).map(([k, v]) => [k, typeof v === "string" ? t(v) : v]));
    return t(entry.key, { ...LEGAL_VARS, ...vars });
  }
  return t(entry, LEGAL_VARS);
}

/**
 * Every Prisma model, and what it holds in plain words.
 *
 * `shopScoped: true` means the row is about a SHOP, not a person. The test
 * checks this list against `prisma/schema.prisma` and fails when a model exists
 * that is not described here — so the policy cannot silently fall behind the
 * database.
 */
export const DATA_INVENTORY = [
  {
    model: "Session",
    holds: T(
      "Your shop domain and the access token Shopify issues us. If Shopify sends us the details of the staff member who installed the app, that can include their name and email address.",
    ),
    personal: true,
  },
  { model: "Shop", holds: T("Your shop domain, when you installed, how you found us, your plan milestones (including when you first opened the app, first approved and published content, and first came back on a later day — timestamps only), your store's SEO score over time, and — if you choose to add them — your own AI provider key and your own Bing Webmaster API key, each encrypted."), personal: false },
  { model: "BrandVoice", holds: T("The brand voice settings you type in: store name, tone, audience, what makes you different, phrases to avoid."), personal: false },
  { model: "GeneratedContent", holds: T("The product descriptions, titles, meta descriptions, FAQ content and image alt text this app generated for your products, and their review status."), personal: false },
  { model: "ContentVersion", holds: T("Previous versions of that content, so you can roll back."), personal: false },
  { model: "ContentTemplate", holds: T("Generation presets you save."), personal: false },
  { model: "CollectionVoice", holds: T("Per-collection tone overrides you set."), personal: false },
  { model: "BlogPost", holds: T("Blog posts this app drafted for you."), personal: false },
  { model: "GenerationJob", holds: T("Bulk jobs you started: which products, what was requested, whether it finished."), personal: false },
  { model: "Plan", holds: T("Your plan name, status, and the Shopify subscription id. We never see or store card details."), personal: false },
  { model: "UsageRecord", holds: T("One row per generation: what was generated, how many credits it cost, and the token counts it used."), personal: false },
  { model: "ProductScore", holds: T("Each product's SEO score before and after we worked on it."), personal: false },
  { model: "GrowthState", holds: T("Whether you have completed setup steps such as enabling the theme embed, and your answer to the one check we ask you to make yourself in Search Console — whether Google's AI features are switched off for your site — with its date; and the numbers you choose to type in from the two AI-visibility reports we teach you to read (Google's generative-AI report and Bing's AI Performance), with their dates."), personal: false },
  { model: "UpgradePrompt", holds: T("Which upgrade prompts you were shown, so you are not shown the same one repeatedly."), personal: false },
  { model: "ReviewRequestAttempt", holds: T("Whether we have asked you to review the app, so we do not ask twice."), personal: false },
  { model: "SupportRequest", holds: T("Questions you send us through Get help: the email address you give for a reply, your subject and message."), personal: true },
  { model: "ProductWatch", holds: T("A daily snapshot of each product's title, URL handle, status, description length, whether it has a product type and alt text, what we noticed changed, which fields an AI shopping surface asks for that the product lacks, what its public page says about indexing (sitemap membership, robots directives, canonical address, redirects), and whether you told us a product has no barcode by design — so we can tell you the day something in your catalogue needs you."), personal: false },
  { model: "CrawlExperiment", holds: T("When you turn on Bing crawl-time measurement: one record per batch of changed product pages, the random seed used to split them into a submitted half and a withheld half, and the result."), personal: false },
  { model: "CrawlExperimentUrl", holds: T("For each page in such a batch: its address, which half it was in, when it changed, when it was submitted to Bing, and when Bing reported first crawling it."), personal: false },
  { model: "CrawlerAccess", holds: T("A daily record of whether search and AI crawlers can reach your storefront, and what your robots.txt allowed."), personal: false },
  { model: "GDPRRequest", holds: T("A record that Shopify sent us a privacy request, with identifiers only — never the customer email or phone in the payload."), personal: false },
  { model: "LogEvent", holds: T("Operational logs: warnings and errors, with your shop domain. Kept 30 days."), personal: false },
];

/** Companies that process data on our behalf. Naming them is the point. */
export const SUBPROCESSORS = [
  // A2 (Phase 9) — each carries the transfer basis we rely on and the link to
  // it, so the "International transfers" section below is GENERATED from this
  // list and cannot drift when a processor changes. Every URL answered 200 on
  // 2026-09-14. Not legal advice; counsel reads both pages before the tenth
  // merchant (OWNER-CHECKLIST.md).
  { name: "Anthropic", role: T("Generates the content. Receives your product text, images for alt text, and your brand voice settings."), region: T("United States"), basis: T("Anthropic's Data Processing Addendum, which incorporates standard contractual clauses"), dpaUrl: "https://www.anthropic.com/legal/data-processing-addendum" },
  { name: "Fly.io", role: T("Runs the application."), region: T("Sydney, Australia"), basis: T("a United States company whose machines for this app run in Sydney; its Data Privacy Framework certification and privacy terms"), dpaUrl: "https://fly.io/legal/data-privacy-framework/" },
  { name: "Neon", role: T("Hosts the database."), region: T("United States"), basis: T("Neon's Data Processing Agreement, which incorporates standard contractual clauses"), dpaUrl: "https://neon.com/dpa" },
  { name: "Upstash", role: T("Queues background jobs."), region: T("United States"), basis: T("Upstash's Data Processing Addendum, which incorporates standard contractual clauses"), dpaUrl: "https://upstash.com/static/trust/dpa.pdf" },
  { name: "Cloudflare R2", role: T("Stores encrypted nightly database backups."), region: T("Global"), basis: T("Cloudflare's Customer Data Processing Addendum, which incorporates standard contractual clauses"), dpaUrl: "https://www.cloudflare.com/cloudflare-customer-dpa/" },
  { name: "Resend", role: T("Delivers operational email, including your support questions."), region: T("United States"), basis: T("Resend's Data Processing Addendum and its EU-US Data Privacy Framework certification"), dpaUrl: "https://resend.com/legal/dpa" },
  { name: "Sentry", role: T("Receives error reports, which can include a shop domain."), region: T("United States"), basis: T("Sentry's Data Processing Addendum, which incorporates standard contractual clauses"), dpaUrl: "https://sentry.io/legal/dpa/" },
];

/**
 * Phase 12 Part B — the companies that process data for the WEBSITE and the
 * free Bilby scan (Part 1). Separate from the app's list because the two
 * halves of the policy describe different systems; same rule as the app's:
 * a processor here without a transfer basis fails the build.
 */
export const SITE_SUBPROCESSORS = [
  { name: "Cloudflare", role: T("The CDN in front of the site, which is where the country header comes from."), region: T("Global"), basis: T("Cloudflare's Customer Data Processing Addendum, which incorporates standard contractual clauses"), dpaUrl: "https://www.cloudflare.com/cloudflare-customer-dpa/" },
  { name: "Fly.io", role: T("Hosts the website and the scan's database."), region: T("Sydney, Australia"), basis: T("a United States company whose machines for this site run in Sydney; its Data Privacy Framework certification and privacy terms"), dpaUrl: "https://fly.io/legal/data-privacy-framework/" },
  { name: "Stripe", role: T("Billing for Bilby plans — we never see card numbers."), region: T("United States"), basis: T("Stripe's Data Processing Agreement, which incorporates standard contractual clauses"), dpaUrl: "https://stripe.com/legal/dpa" },
  { name: "Resend", role: T("Sends the report and outreach emails described in Part 1."), region: T("United States"), basis: T("Resend's Data Processing Addendum and its EU-US Data Privacy Framework certification"), dpaUrl: "https://resend.com/legal/dpa" },
];

/** One generated line per processor, in both transfer sections. */
const TRANSFER_LINE = T('<b>{name}</b> ({region}) — {basis}: <a href="{url}" rel="noopener">{host}</a>.');
const transferLine = (s) => ({ key: TRANSFER_LINE, vars: { name: s.name, region: s.region, basis: s.basis, url: s.dpaUrl, host: s.dpaUrl.replace(/^https?:\/\//, "") } });
const TRANSFER_CLOSE = T("If a processor changes, this list and this section change with it and the date at the top changes too. This page describes what we do; it is not legal advice.");

/** Generated from SITE_SUBPROCESSORS the way the app's transfer section is. */
export const SITE_TRANSFER_SECTION = {
  h: T("Who processes it for the website, and where"),
  siteSubprocessors: true,
  p: [
    T("{COMPANY} operates from Australia. Some of the companies that run the website and the scan are outside Australia, so data we send them leaves the country. For each one we rely on the transfer basis it publishes, linked here:"),
    ...SITE_SUBPROCESSORS.map(transferLine),
    TRANSFER_CLOSE,
  ],
};

/**
 * Phase 12 Part B — PART 1 of the policy: the navaal.ai website and the free
 * Bilby store scan. The text is the owner's, taken from the live
 * navaal.ai/privacy of 4 September 2026 and not paraphrased; the one
 * substitution is the contact address, which is the app's CONTACT_EMAIL so
 * every request lands in the inbox that answers. CW found that page was a
 * two-part policy, not a stale copy: a redirect would have deleted the
 * website's only policy. Both parts now live here, generated, one home.
 */
export const PRIVACY_INTRO = [
  T('This policy has two parts. <b>Part 1</b> covers the {SITE_NAME} website and the free {SCAN_NAME} store scan — what our own, first-party beacon records when you visit, and what a scan keeps. <b>Part 2</b> explains what data {APP_NAME} (the "App"), built by {COMPANY}, accesses from your Shopify store, why we access it, where it is stored, and the rights you have over it.'),
  T("In short: we access the store content you ask us to optimise, we send the specific content you choose to generate to Anthropic's Claude API to produce drafts, we never use your data to train AI models, and we delete your store's data when you uninstall."),
];

export const SITE_PRIVACY_SECTIONS = [
  {
    h: T("No third-party trackers"),
    p: [
      T("{SITE_NAME} loads no third-party analytics, advertising pixels, tag managers or chat widgets. The only measurement on this site is a small script we wrote ourselves, which sends a few facts about each page view to our own server. There is no cookie: the script keeps a random session id and any utm_ tags in your browser's session storage, which your browser discards when the tab closes. Nothing is shared with, or read by, any other company."),
    ],
  },
  {
    h: T("What the beacon records"),
    p: [
      T("The page you viewed and the time."),
      T("Where you came from — the referring site's hostname (for example google.com or chatgpt.com) and any utm_ tags in the link, so we can tell search, an AI assistant, a listing, our own emails and direct visits apart. We never see what you searched for."),
      T("A coarse location — the country, and at the moment you start a scan the region and city, read from headers our CDN adds to the request. We do not look your address up with any geolocation service, and we do not store your IP address with your page views."),
      T("A device class (phone, tablet or desktop) worked out from your browser's user-agent string; the string itself is not kept."),
      T("What you did on the site — ran a scan, opened a report, clicked a pricing button — recorded as event names, never as form contents or free text. Email addresses are stripped from event data before it is written."),
      T("These records are kept for thirteen months so we can compare a month with the same month a year earlier, then deleted automatically."),
    ],
  },
  {
    h: T("What a free scan keeps"),
    p: [
      T("When you run a free {SCAN_NAME} scan, we keep the scan itself: the store address you entered, the pages {SCAN_NAME} walked, their screenshots and load times, the findings and the evidence for each, and the store's name as its own home page title states it. Your IP address is recorded on the scan for abuse control (rate limits on the free scan) and is not shown in the report. If you choose to give an email address to receive the report, we keep it with that scan. Reports are the product — they are not deleted on a schedule — but you can ask us to delete any scan of a store you own at any time."),
    ],
  },
  {
    h: T("How we join this up"),
    p: [
      T("For each store domain that is scanned we keep one store record that brings the above together: the domain, the store name, the platform (Shopify or other), when it was first and last scanned, how many findings the last scan found, the country and city the scan was started from, how that visit reached us, and an email address if one was given. Its purpose is to let us see which stores are trying {SCAN_NAME} and how far they get (visited → scanned → email known → signed up → trial → paying). It describes a store, not a person, and it is not sold, shared or enriched from any outside data broker."),
    ],
  },
  {
    h: T("Whether we will email a store"),
    p: [
      T('Leaving an email for a report does not put you on a marketing list: that address receives that report and, if you ticked the box, the monthly check-up you asked for — nothing else. Separately, {COMPANY} may write once to a store whose scan found a real problem, but only through our outreach system, which applies the law of the store\'s own market (Australian Spam Act, US CAN-SPAM, UK PECR, Canadian CASL; EU stores are never cold-emailed), uses only a business contact the store publishes itself, sends at most one note and one follow-up, and honours a permanent one-click unsubscribe. There is no other path from a scan or a visit to an email from us. Every such note carries a one-click unsubscribe that is honoured permanently; to stop {SCAN_NAME} walking your store at all, see <a href="https://navaal.ai/bilby/bot" rel="noopener">BilbyBot &amp; opt-out</a>.'),
    ],
  },
  {
    h: T("Your choices"),
    p: [
      T('You can browse with the beacon blocked (any content blocker that stops requests to <code>/api/tools/event</code> does it; the site works without it). You can ask us to show, correct or delete anything above — the store record, a scan of your store, an email address — by writing to <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>, and to stop {SCAN_NAME} walking your store at all by following <a href="https://navaal.ai/bilby/bot" rel="noopener">navaal.ai/bilby/bot</a>.'),
    ],
  },
  SITE_TRANSFER_SECTION,
];

/**
 * A2 (Phase 9) — the international-transfers section, generated from the
 * processor list above. Add a processor there and it appears here with its
 * basis and link; forget the basis and the legal test fails the build.
 */
export const TRANSFER_SECTION = {
  h: T("International transfers"),
  p: [
    T("{COMPANY} operates from Australia. Some of the companies above are outside Australia, so data we send them leaves the country. For each one we rely on the transfer basis it publishes, linked here:"),
    ...SUBPROCESSORS.map(transferLine),
    TRANSFER_CLOSE,
  ],
};

export const PRIVACY_SECTIONS = [
  {
    h: T("The short version"),
    p: [
      T("{APP_NAME} reads your Shopify product catalogue, writes SEO content for it, and stores what it wrote so you can review, publish and roll it back."),
      T("<b>We do not store your customers' personal data.</b> We never request Shopify's customer or order scopes — the app asks only for <code>write_products</code> and <code>write_content</code>, so we cannot read your customers or orders even if we wanted to."),
      T("We do not sell data. We do not use your content to train AI models."),
    ],
  },
  {
    h: T("What we store"),
    p: [
      T("Everything this app keeps, in plain words. Rows marked <b>personal</b> can contain information about a person rather than a shop."),
    ],
    table: true,
  },
  {
    h: T("What we send to our AI provider"),
    p: [
      T("To generate content we send <b>Anthropic</b> your product titles, descriptions, product types, vendors, tags and prices; the URLs of product images when you ask for alt text; and the brand voice settings you have entered."),
      T("We do not send customer data, order data, or anything Shopify has not given us access to under the two scopes above."),
      T("Anthropic processes this to produce the content and, under their commercial terms, does not use it to train their models."),
      T("If you add your own Anthropic key on the Professional plan, the same content goes to Anthropic under <b>your</b> account instead of ours. Your key is encrypted with AES-256-GCM before it is stored, is never written to a log, and is never sent back to your browser — not the key, not part of it, not its length."),
    ],
  },
  {
    h: T("If you turn on Bing crawl-time measurement"),
    p: [
      T("You can add your own <b>Bing Webmaster Tools</b> API key. With it, and only after you switch measurement on, we send Bing the addresses of product pages whose content we published — a random half of each batch — and read back when Bing first crawled each page. Nothing else is sent to Bing, and nothing is sent for a store that has not switched it on."),
      T("The key is stored exactly like the Anthropic key: encrypted, never logged, never returned to your browser. Remove it in Settings and measurement stops."),
      T("While measurement is on, we send one email a week to your store's contact address, only in a week that has a result to report, with links to the screens that show it."),
    ],
  },
  {
    h: T("Who else processes it"),
    p: [T("These companies process data on our behalf. Each does one job.")],
    subprocessors: true,
  },
  TRANSFER_SECTION,
  {
    h: T("How long we keep it"),
    p: [
      T("Your content and settings are kept while the app is installed."),
      T("<b>When you uninstall</b>, Shopify sends us a shop redaction request (usually within 48 hours) and we delete your content, settings, plan, usage records and sessions. A small record of the shop survives so that a reinstall does not reset your free trial or your free-tier allowance — it holds your shop domain, timestamps and counters, and no content."),
      T("Operational logs are kept 30 days. Privacy-request audit records are kept two years and then pruned."),
      T("Encrypted database backups are retained on a rolling basis for disaster recovery."),
    ],
  },
  {
    h: T("Your rights"),
    p: [
      T('Ask us for a copy of what we hold, or ask us to delete it, at <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>. Uninstalling the app also triggers deletion via Shopify.'),
      T("If Shopify asks us for a customer's data or asks us to erase it, we respond — and our answer is that we hold none, because we never had access to it."),
    ],
  },
  {
    h: T("Changes"),
    p: [
      T("15 September 2026: the website's Part 1 (the first-party beacon, the free Bilby scan, the per-store record and the outreach rules — previously a separate page on navaal.ai) joined this page, so one policy covers everything Navaal does."),
      T("If we change what we collect or who processes it, this page changes and the date at the top changes with it."),
    ],
  },
];

export const TERMS_SECTIONS = [
  {
    h: T("What the app does"),
    p: [
      T("{APP_NAME} generates SEO and AI-search content for your Shopify products and writes it to your store when you publish it."),
      T("<b>You review before anything goes live</b>, unless you turn that off yourself in Settings. Content this app has written is yours."),
    ],
  },
  {
    h: T("What we do not promise"),
    p: [
      T("<b>We do not promise rankings.</b> No one can. Search engines and AI assistants decide what to show, and they change how they decide without telling anyone."),
      T("We promise the app does what it says: it writes content to a defined standard, tells you what it changed, and lets you undo it."),
      T("AI-generated text can be wrong. That is why review is on by default, and why you should read what you publish."),
    ],
  },
  {
    h: T("Plans, credits and billing"),
    p: [
      T("Billing runs through Shopify. We never see your card."),
      T("A <b>credit</b> is one generation. A product description, a meta title and description, or FAQ content each cost 1 credit. Image alt text costs nothing. A blog post costs 3. If you select several content types in one run, you are charged the most expensive one, not the sum."),
      // one paragraph from two constants — the same sentences the plans page shows
      [CREDIT_RESET_SENTENCE, CREDIT_ROLLOVER_SENTENCE],
      T("Paid plans include a 14-day free trial with 250 credits, once per store."),
      T("On the Professional plan you may use your own AI key. Generations that use it do not consume credits, because you are paying your provider directly."),
      T("Cancel any time from the Plans page. Shopify prorates."),
    ],
  },
  {
    h: T("Fair use"),
    p: [
      T("Do not use the app to generate content that is illegal, deceptive, or that misrepresents a product."),
      T("Do not attempt to exhaust the service deliberately. There are per-day and concurrency limits; if you hit one you will be told which."),
      T("We may suspend an account that is doing either of those, and we will tell you why."),
    ],
  },
  {
    h: T("Liability"),
    p: [
      T("We provide the app as it is. To the extent the law allows, our total liability is limited to what you paid us in the twelve months before a claim."),
      T("We are not liable for lost sales or lost rankings."),
    ],
  },
  {
    h: T("Contact"),
    p: [
      T('Questions about these terms: <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>, or use <b>Get help</b> inside the app.'),
    ],
  },
];
