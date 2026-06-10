# ContentPilot AI

AI-powered product content generation for Shopify stores. Generate SEO-optimised product descriptions, meta titles, meta descriptions, FAQ content, and image alt text — all in your brand's voice.

Built with React Router v7, Shopify Polaris, Prisma, and Claude (Anthropic).

---

## Features

| Feature | Details |
|---|---|
| **AI Content Generation** | Product descriptions, meta titles, meta descriptions, FAQ, image alt text |
| **Brand Voice** | Configure tone, audience, differentiators, and sample content — Claude matches your exact voice |
| **Anti-hallucination** | Strict prompt rules prevent Claude from inventing certifications, origins, or claims not in the product data |
| **Vision context** | Product images sent to Claude as visual context for richer, more accurate descriptions |
| **Bulk Generation** | Select multiple products → background job → progress tracking on Jobs page |
| **Version History** | See original content before AI, revert with one click |
| **Image Alt Text** | Applied directly to Shopify product images via `productImageUpdate` |
| **Billing / Plans** | 4-tier Shopify Billing API integration (Free / Starter / Growth / Professional) with 7-day trials |
| **Usage Metering** | Monthly generation limit enforced at every entry point (single product, bulk job) |
| **GDPR Compliance** | Customer data request, customer redact, and shop redact webhook handlers |
| **Structured Logging** | Pino JSON logging throughout bulk processor and AI API calls |
| **Error Monitoring** | Pluggable error capture (`app/utils/errorMonitoring.server.js`) — Sentry-ready |

---

## Architecture

```
app/
├── routes/
│   ├── app._index.jsx          # Dashboard + onboarding checklist + usage card
│   ├── app.products.jsx         # Product list with bulk selection + job creation
│   ├── app.products_.$id.jsx    # Single product: generate, review, publish, revert
│   ├── app.jobs.jsx             # Bulk job progress (auto-refreshes every 5s)
│   ├── app.settings.jsx         # Brand voice configuration
│   ├── app.plans.jsx            # Billing plans + usage + upgrade/cancel
│   └── webhooks.*              # App lifecycle + billing + GDPR handlers
│
├── utils/
│   ├── ai.server.js             # Claude API: generation, alt text, retry, vision
│   ├── bulkProcessor.server.js  # Background job runner (fire-and-forget)
│   ├── plans.server.js          # canGenerate(), plan sync, usage metering
│   ├── logger.server.js         # Pino structured JSON logger
│   └── errorMonitoring.server.js # Sentry-ready error capture placeholder
│
├── db.server.js                 # Prisma singleton (production-safe)
└── shopify.server.js            # Shopify app + billing plan configuration

prisma/
└── schema.prisma                # Session, BrandVoice, GeneratedContent, Plan,
                                 # UsageRecord, GDPRRequest, GenerationJob
```

---

## Local Development

### Prerequisites

- Node.js ≥20.19 or ≥22.12
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- Anthropic API key

### Setup

```bash
npm install
cp .env.example .env        # fill in your credentials
npx prisma migrate dev
npm run dev
```

### Environment variables

```env
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=write_products,write_metaobjects,write_metaobject_definitions,write_content
ANTHROPIC_API_KEY=
LOG_LEVEL=debug
```

---

## Database

SQLite for development; Postgres for production scale (see [DEPLOYMENT.md](DEPLOYMENT.md)).

```bash
npx prisma migrate dev       # create + apply a migration
npx prisma studio            # browse data in a GUI
npx prisma migrate reset     # wipe and re-apply all migrations (dev only)
```

---

## Plans & Billing

Plans are defined in [app/shopify.server.js](app/shopify.server.js):

| Plan | Generations/month | Price |
|---|---|---|
| Free | 25 | $0 |
| Starter | 50 | $9.99/mo |
| Growth | 200 | $29.99/mo |
| Professional | 1,000 | $79.99/mo |

`BILLING_TEST=true` in development — all charges use Shopify test mode.

---

## Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions including:
- Environment variable reference
- Railway / Fly.io / Render setup
- SQLite → PostgreSQL migration
- Shopify App Store submission checklist
- Scaling milestones (BullMQ + Redis for 50+ shops)
- Log monitoring reference

---

## Key Implementation Notes

### Background jobs
`processBulkJob` runs fire-and-forget via `setTimeout(() => ..., 0)` after the HTTP response returns. This is sufficient for ~50 concurrent shops. For production scale, replace with BullMQ + Redis (see DEPLOYMENT.md).

### Auth in background jobs
Bulk jobs use the stored offline session token (`prisma.session.findFirst({ isOnline: false })`). Tokens rotate automatically via `expiringOfflineAccessTokens: true` — the token is always fresh when the job is created via the UI (the `authenticate.admin()` call in the action refreshes it).

### Race conditions
All content saves use `prisma.generatedContent.upsert()` on the compound unique key `@@unique([shop, productId, contentType])`. No find-then-create patterns.

### Atomic GDPR deletion
`shop/redact` handler deletes all 6 tables for the shop in a single `prisma.$transaction`. The `GDPRRequest` record is inserted first as an audit trail.

---

## Troubleshooting

**"Claude API timed out after 45 seconds"** — Anthropic is under load. The bulk processor has 3.5s throttle between products and 2-retry exponential backoff. Single-product generation has no retry for the 45s request (it re-throws to the UI).

**"No offline session for shop"** — The merchant's offline token expired before the bulk job ran. This can happen if the shop re-installs the app mid-job. The job will be marked `failed`. The merchant needs to initiate the job again from the UI, which will refresh the token.

**"Monthly limit reached"** — Enforce at both single-product (`app.products_.$id.jsx` action) and bulk (`bulkProcessor.server.js`). The merchant sees a "View Plans & Billing" CTA.

**Prisma DB drift** — In development, if the DB is out of sync with migration history: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force`
