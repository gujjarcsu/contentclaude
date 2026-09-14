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
  { model: "Shop", holds: "Your shop domain, when you installed, how you found us, your plan milestones, your store's SEO score over time, and — if you choose to add one — your own AI provider key, encrypted.", personal: false },
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
  { model: "GrowthState", holds: "Whether you have completed setup steps such as enabling the theme embed, and your answer to the one check we ask you to make yourself in Search Console — whether Google's AI features are switched off for your site — with its date.", personal: false },
  { model: "UpgradePrompt", holds: "Which upgrade prompts you were shown, so you are not shown the same one repeatedly.", personal: false },
  { model: "ReviewRequestAttempt", holds: "Whether we have asked you to review the app, so we do not ask twice.", personal: false },
  { model: "SupportRequest", holds: "Questions you send us through Get help: the email address you give for a reply, your subject and message.", personal: true },
  { model: "ProductWatch", holds: "A daily snapshot of each product's title, URL handle, status, description length, whether it has a product type and alt text, what we noticed changed, which fields an AI shopping surface asks for that the product lacks, what its public page says about indexing (sitemap membership, robots directives, canonical address, redirects), and whether you told us a product has no barcode by design — so we can tell you the day something in your catalogue needs you.", personal: false },
  { model: "CrawlerAccess", holds: "A daily record of whether search and AI crawlers can reach your storefront, and what your robots.txt allowed.", personal: false },
  { model: "GDPRRequest", holds: "A record that Shopify sent us a privacy request, with identifiers only — never the customer email or phone in the payload.", personal: false },
  { model: "LogEvent", holds: "Operational logs: warnings and errors, with your shop domain. Kept 30 days.", personal: false },
];

/** Companies that process data on our behalf. Naming them is the point. */
export const SUBPROCESSORS = [
  { name: "Anthropic", role: "Generates the content. Receives your product text, images for alt text, and your brand voice settings.", region: "United States" },
  { name: "Fly.io", role: "Runs the application.", region: "Sydney, Australia" },
  { name: "Neon", role: "Hosts the database.", region: "United States" },
  { name: "Upstash", role: "Queues background jobs.", region: "United States" },
  { name: "Cloudflare R2", role: "Stores encrypted nightly database backups.", region: "Global" },
  { name: "Resend", role: "Delivers operational email, including your support questions.", region: "United States" },
  { name: "Sentry", role: "Receives error reports, which can include a shop domain.", region: "United States" },
];

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
    h: "Who else processes it",
    p: ["These companies process data on our behalf. Each does one job."],
    subprocessors: true,
  },
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
      "Credits reset on the first of each calendar month and do not roll over.",
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
