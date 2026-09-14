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
 */

import { CREDIT_RESET_SENTENCE } from "./credits.js";

export const COMPANY = "Navaal";
export const APP_NAME = "Navaal: AI SEO, AEO & GEO";
export const CONTACT_EMAIL = "hello@navaal.ai";
export const LAST_UPDATED = "14 September 2026";

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
    holds:
      "Your shop domain and the access token Shopify issues us. If Shopify sends us the details of the staff member who installed the app, that can include their name and email address.",
    personal: true,
  },
  { model: "Shop", holds: "Your shop domain, when you installed, how you found us, your plan milestones (including when you first opened the app, first approved and published content, and first came back on a later day — timestamps only), your store's SEO score over time, and — if you choose to add them — your own AI provider key and your own Bing Webmaster API key, each encrypted.", personal: false },
  { model: "BrandVoice", holds: "The brand voice settings you type in: store name, tone, audience, what makes you different, phrases to avoid.", personal: false },
  { model: "GeneratedContent", holds: "The product descriptions, titles, meta descriptions, FAQ content and image alt text this app generated for your products, and their review status.", personal: false },
  { model: "ContentVersion", holds: "Previous versions of that content, so you can roll back.", personal: false },
  { model: "ContentTemplate", holds: "Generation presets you save.", personal: false },
  { model: "CollectionVoice", holds: "Per-collection tone overrides you set.", personal: false },
  { model: "BlogPost", holds: "Blog posts this app drafted for you.", personal: false },
  { model: "GenerationJob", holds: "Bulk jobs you started: which products, what was requested, whether it finished.", personal: false },
  { model: "Plan", holds: "Your plan name, status, and the Shopify subscription id. We never see or store card details.", personal: false },
  { model: "UsageRecord", holds: "One row per generation: what was generated, how many credits it cost, and the token counts it used.", personal: false },
  { model: "ProductScore", holds: "Each product's SEO score before and after we worked on it.", personal: false },
  { model: "GrowthState", holds: "Whether you have completed setup steps such as enabling the theme embed, and your answer to the one check we ask you to make yourself in Search Console — whether Google's AI features are switched off for your site — with its date; and the numbers you choose to type in from the two AI-visibility reports we teach you to read (Google's generative-AI report and Bing's AI Performance), with their dates.", personal: false },
  { model: "UpgradePrompt", holds: "Which upgrade prompts you were shown, so you are not shown the same one repeatedly.", personal: false },
  { model: "ReviewRequestAttempt", holds: "Whether we have asked you to review the app, so we do not ask twice.", personal: false },
  { model: "SupportRequest", holds: "Questions you send us through Get help: the email address you give for a reply, your subject and message.", personal: true },
  { model: "ProductWatch", holds: "A daily snapshot of each product's title, URL handle, status, description length, whether it has a product type and alt text, what we noticed changed, which fields an AI shopping surface asks for that the product lacks, what its public page says about indexing (sitemap membership, robots directives, canonical address, redirects), and whether you told us a product has no barcode by design — so we can tell you the day something in your catalogue needs you.", personal: false },
  { model: "CrawlExperiment", holds: "When you turn on Bing crawl-time measurement: one record per batch of changed product pages, the random seed used to split them into a submitted half and a withheld half, and the result.", personal: false },
  { model: "CrawlExperimentUrl", holds: "For each page in such a batch: its address, which half it was in, when it changed, when it was submitted to Bing, and when Bing reported first crawling it.", personal: false },
  { model: "CrawlerAccess", holds: "A daily record of whether search and AI crawlers can reach your storefront, and what your robots.txt allowed.", personal: false },
  { model: "GDPRRequest", holds: "A record that Shopify sent us a privacy request, with identifiers only — never the customer email or phone in the payload.", personal: false },
  { model: "LogEvent", holds: "Operational logs: warnings and errors, with your shop domain. Kept 30 days.", personal: false },
];

/** Companies that process data on our behalf. Naming them is the point. */
export const SUBPROCESSORS = [
  // A2 (Phase 9) — each carries the transfer basis we rely on and the link to
  // it, so the "International transfers" section below is GENERATED from this
  // list and cannot drift when a processor changes. Every URL answered 200 on
  // 2026-09-14. Not legal advice; counsel reads both pages before the tenth
  // merchant (OWNER-CHECKLIST.md).
  { name: "Anthropic", role: "Generates the content. Receives your product text, images for alt text, and your brand voice settings.", region: "United States", basis: "Anthropic's Data Processing Addendum, which incorporates standard contractual clauses", dpaUrl: "https://www.anthropic.com/legal/data-processing-addendum" },
  { name: "Fly.io", role: "Runs the application.", region: "Sydney, Australia", basis: "a United States company whose machines for this app run in Sydney; its Data Privacy Framework certification and privacy terms", dpaUrl: "https://fly.io/legal/data-privacy-framework/" },
  { name: "Neon", role: "Hosts the database.", region: "United States", basis: "Neon's Data Processing Agreement, which incorporates standard contractual clauses", dpaUrl: "https://neon.com/dpa" },
  { name: "Upstash", role: "Queues background jobs.", region: "United States", basis: "Upstash's Data Processing Addendum, which incorporates standard contractual clauses", dpaUrl: "https://upstash.com/static/trust/dpa.pdf" },
  { name: "Cloudflare R2", role: "Stores encrypted nightly database backups.", region: "Global", basis: "Cloudflare's Customer Data Processing Addendum, which incorporates standard contractual clauses", dpaUrl: "https://www.cloudflare.com/cloudflare-customer-dpa/" },
  { name: "Resend", role: "Delivers operational email, including your support questions.", region: "United States", basis: "Resend's Data Processing Addendum and its EU-US Data Privacy Framework certification", dpaUrl: "https://resend.com/legal/dpa" },
  { name: "Sentry", role: "Receives error reports, which can include a shop domain.", region: "United States", basis: "Sentry's Data Processing Addendum, which incorporates standard contractual clauses", dpaUrl: "https://sentry.io/legal/dpa/" },
];

/**
 * A2 (Phase 9) — the international-transfers section, generated from the
 * processor list above. Add a processor there and it appears here with its
 * basis and link; forget the basis and the legal test fails the build.
 */
export const TRANSFER_SECTION = {
  h: "International transfers",
  p: [
    `${COMPANY} operates from Australia. Some of the companies above are outside Australia, so data we send them leaves the country. For each one we rely on the transfer basis it publishes, linked here:`,
    ...SUBPROCESSORS.map((s) => `<b>${s.name}</b> (${s.region}) — ${s.basis}: <a href="${s.dpaUrl}" rel="noopener">${s.dpaUrl.replace(/^https?:\/\//, "")}</a>.`),
    "If a processor changes, this list and this section change with it and the date at the top changes too. This page describes what we do; it is not legal advice.",
  ],
};

export const PRIVACY_SECTIONS = [
  {
    h: "The short version",
    p: [
      `${APP_NAME} reads your Shopify product catalogue, writes SEO content for it, and stores what it wrote so you can review, publish and roll it back.`,
      "<b>We do not store your customers' personal data.</b> We never request Shopify's customer or order scopes — the app asks only for <code>write_products</code> and <code>write_content</code>, so we cannot read your customers or orders even if we wanted to.",
      "We do not sell data. We do not use your content to train AI models.",
    ],
  },
  {
    h: "What we store",
    p: [
      "Everything this app keeps, in plain words. Rows marked <b>personal</b> can contain information about a person rather than a shop.",
    ],
    table: true,
  },
  {
    h: "What we send to our AI provider",
    p: [
      "To generate content we send <b>Anthropic</b> your product titles, descriptions, product types, vendors, tags and prices; the URLs of product images when you ask for alt text; and the brand voice settings you have entered.",
      "We do not send customer data, order data, or anything Shopify has not given us access to under the two scopes above.",
      "Anthropic processes this to produce the content and, under their commercial terms, does not use it to train their models.",
      "If you add your own Anthropic key on the Professional plan, the same content goes to Anthropic under <b>your</b> account instead of ours. Your key is encrypted with AES-256-GCM before it is stored, is never written to a log, and is never sent back to your browser — not the key, not part of it, not its length.",
    ],
  },
  {
    h: "If you turn on Bing crawl-time measurement",
    p: [
      "You can add your own <b>Bing Webmaster Tools</b> API key. With it, and only after you switch measurement on, we send Bing the addresses of product pages whose content we published — a random half of each batch — and read back when Bing first crawled each page. Nothing else is sent to Bing, and nothing is sent for a store that has not switched it on.",
      "The key is stored exactly like the Anthropic key: encrypted, never logged, never returned to your browser. Remove it in Settings and measurement stops.",
      "While measurement is on, we send one email a week to your store's contact address, only in a week that has a result to report, with links to the screens that show it.",
    ],
  },
  {
    h: "Who else processes it",
    p: ["These companies process data on our behalf. Each does one job."],
    subprocessors: true,
  },
  TRANSFER_SECTION,
  {
    h: "How long we keep it",
    p: [
      "Your content and settings are kept while the app is installed.",
      "<b>When you uninstall</b>, Shopify sends us a shop redaction request (usually within 48 hours) and we delete your content, settings, plan, usage records and sessions. A small record of the shop survives so that a reinstall does not reset your free trial or your free-tier allowance — it holds your shop domain, timestamps and counters, and no content.",
      "Operational logs are kept 30 days. Privacy-request audit records are kept two years and then pruned.",
      "Encrypted database backups are retained on a rolling basis for disaster recovery.",
    ],
  },
  {
    h: "Your rights",
    p: [
      `Ask us for a copy of what we hold, or ask us to delete it, at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Uninstalling the app also triggers deletion via Shopify.`,
      "If Shopify asks us for a customer's data or asks us to erase it, we respond — and our answer is that we hold none, because we never had access to it.",
    ],
  },
  {
    h: "Changes",
    p: [
      "If we change what we collect or who processes it, this page changes and the date at the top changes with it.",
    ],
  },
];

export const TERMS_SECTIONS = [
  {
    h: "What the app does",
    p: [
      `${APP_NAME} generates SEO and AI-search content for your Shopify products and writes it to your store when you publish it.`,
      "<b>You review before anything goes live</b>, unless you turn that off yourself in Settings. Content this app has written is yours.",
    ],
  },
  {
    h: "What we do not promise",
    p: [
      "<b>We do not promise rankings.</b> No one can. Search engines and AI assistants decide what to show, and they change how they decide without telling anyone.",
      "We promise the app does what it says: it writes content to a defined standard, tells you what it changed, and lets you undo it.",
      "AI-generated text can be wrong. That is why review is on by default, and why you should read what you publish.",
    ],
  },
  {
    h: "Plans, credits and billing",
    p: [
      "Billing runs through Shopify. We never see your card.",
      "A <b>credit</b> is one generation. A product description, a meta title and description, or FAQ content each cost 1 credit. Image alt text costs nothing. A blog post costs 3. If you select several content types in one run, you are charged the most expensive one, not the sum.",
      `${CREDIT_RESET_SENTENCE} Unused credits do not roll over.`,
      "Paid plans include a 14-day free trial with 250 credits, once per store.",
      "On the Professional plan you may use your own AI key. Generations that use it do not consume credits, because you are paying your provider directly.",
      "Cancel any time from the Plans page. Shopify prorates.",
    ],
  },
  {
    h: "Fair use",
    p: [
      "Do not use the app to generate content that is illegal, deceptive, or that misrepresents a product.",
      "Do not attempt to exhaust the service deliberately. There are per-day and concurrency limits; if you hit one you will be told which.",
      "We may suspend an account that is doing either of those, and we will tell you why.",
    ],
  },
  {
    h: "Liability",
    p: [
      "We provide the app as it is. To the extent the law allows, our total liability is limited to what you paid us in the twelve months before a claim.",
      "We are not liable for lost sales or lost rankings.",
    ],
  },
  {
    h: "Contact",
    p: [
      `Questions about these terms: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>, or use <b>Get help</b> inside the app.`,
    ],
  },
];
