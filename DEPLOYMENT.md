# ContentPilot AI — Production Deployment Guide

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | >=20.19 <22 or >=22.12 |
| Shopify Partner account | app.shopify.com/partners |
| Anthropic API key | console.anthropic.com |
| Shopify app credentials | From Partner Dashboard |

---

## Environment Variables

Create a `.env` file (never commit this):

```env
# Shopify app credentials (from Partner Dashboard → App → API credentials)
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-production-domain.com
SCOPES=write_products,write_metaobjects,write_metaobject_definitions

# AI content generation
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Database (PostgreSQL required for production)
DATABASE_URL=postgresql://user:password@host:5432/contentpilot

# Logging (debug | info | warn | error)
LOG_LEVEL=info

# Error monitoring (optional — see app/utils/errorMonitoring.server.js)
# SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

---

## Deployment Options

### Option 1 — Railway (Recommended for getting started)

1. Create a new project at railway.app
2. Connect your GitHub repo
3. Add a PostgreSQL plugin (Railway → New → Database → PostgreSQL)
4. Set all env vars in Railway → Variables
5. Set `DATABASE_URL` from the PostgreSQL plugin's connection string
6. Railway builds and deploys automatically on push to `main`

**Start command:** `npm run setup && npm start`

### Option 2 — Fly.io

```bash
fly launch --name contentpilot-ai
fly postgres create --name contentpilot-db
fly postgres attach contentpilot-db
fly secrets set SHOPIFY_API_KEY=... SHOPIFY_API_SECRET=... ANTHROPIC_API_KEY=...
fly deploy
```

### Option 3 — Render

1. New Web Service → connect GitHub repo
2. Build command: `npm install && npm run build`
3. Start command: `npm run setup && npm start`
4. Add a Render PostgreSQL database and set `DATABASE_URL`

---

## Database Setup (PostgreSQL — Required)

PostgreSQL is the default and only supported production database. Set `DATABASE_URL` in your environment and run migrations:

```bash
npx prisma migrate deploy
```

Migrate existing data with `pgloader` or a manual export/import script if needed.

---

## Local Development with SQLite (optional)

If you don't have PostgreSQL locally, you can temporarily switch back to SQLite for development:
1. Change `provider = "postgresql"` to `provider = "sqlite"` in `prisma/schema.prisma`
2. Set `DATABASE_URL="file:dev.sqlite"` in `.env`
3. Run `npx prisma migrate dev`

**Do NOT deploy to production with SQLite.** Switch back to PostgreSQL before deploying.

---

## PostgreSQL Connection Pooling

When deploying to serverless or edge platforms (Vercel, Cloudflare Workers, Railway):

1. Use a connection pooler like PgBouncer (built into Neon, Supabase, Railway)
2. Append `?pgbouncer=true&connection_limit=1` to your `DATABASE_URL`
3. Example:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/contentpilot?pgbouncer=true&connection_limit=1
   ```

For traditional server deployments (VPS, Docker):
- Standard PostgreSQL connection without pooler suffix is fine
- Prisma manages its own connection pool (default: 5 connections)

**Managed PostgreSQL providers with built-in pooling:**
- [Neon](https://neon.tech) — serverless Postgres, auto-scaling, free tier
- [Supabase](https://supabase.com) — Postgres + PgBouncer included
- [Railway](https://railway.app) — one-click Postgres plugin
- [PlanetScale](https://planetscale.com) — MySQL-compatible (requires schema change)

---

## Shopify App Store Submission Checklist

### Before submitting:

- [ ] **Billing test mode off** — Set `BILLING_TEST = false` in `app/shopify.server.js` (currently reads from `NODE_ENV`)
- [ ] **GDPR webhooks registered** — Go to Partner Dashboard → App → App setup → GDPR data requests. Register three URLs:
  - `https://your-domain.com/webhooks/customers/data_request`
  - `https://your-domain.com/webhooks/customers/redact`
  - `https://your-domain.com/webhooks/shop/redact`
- [ ] **App URL updated** — `shopify.app.toml` `application_url` points to production
- [ ] **Redirect URLs updated** — `shopify.app.toml` `auth.redirect_urls` includes production URL
- [ ] **Privacy policy URL** — Add to Partner Dashboard
- [ ] **Support email** — Add to Partner Dashboard
- [ ] **App icon** — 1200×1200 PNG, no alpha channel
- [ ] **App listing screenshots** — At least 3, 1600×900

### Deploy app configuration:
```bash
npm run deploy
```

---

## Webhook Configuration

Webhooks registered via `shopify.app.toml` (auto-managed by Shopify CLI):

| Topic | Handler |
|---|---|
| `app/uninstalled` | `webhooks.app.uninstalled.jsx` |
| `app/scopes_update` | `webhooks.app.scopes_update.jsx` |
| `app_subscriptions/update` | `webhooks.app.subscriptions_update.jsx` |

GDPR webhooks (registered manually in Partner Dashboard):

| Topic | Handler |
|---|---|
| `customers/data_request` | `webhooks.customers.data_request.jsx` |
| `customers/redact` | `webhooks.customers.redact.jsx` |
| `shop/redact` | `webhooks.shop.redact.jsx` |

---

## Scaling Notes

ContentPilot is designed for growth. Here's what to address at each scale milestone:

### < 50 shops
Current architecture is fine. PostgreSQL + BullMQ background jobs (Redis optional, falls back to inline).

### 50–500 shops
- Ensure **PostgreSQL** is in use (it is by default)
- Ensure **Redis** is configured for BullMQ (set `REDIS_URL`)
- Replace `setTimeout` fire-and-forget in bulk processor with **BullMQ + Redis**
  - Install: `npm install bullmq ioredis`
  - Create `app/queues/generationQueue.server.js`
  - Railway/Fly.io both offer managed Redis

### 500+ shops
- Add a dedicated **worker process** for the generation queue (separate Fly Machine or Railway service)
- Add **connection pooling** (PgBouncer or Supabase's built-in pooler)
- Consider **rate limit management** at the queue level (Anthropic: 4000 RPM on Sonnet)
- Add **Sentry** for error monitoring (see `app/utils/errorMonitoring.server.js`)

---

## Monitoring & Logs

Logs are structured JSON (via pino) output to stdout. Configure your platform's log drain:

- **Railway:** Auto-collected, searchable in dashboard
- **Fly.io:** `fly logs` or configure Logtail drain
- **Render:** Auto-collected in dashboard

Key log events to watch:

| Event | Level | Fields |
|---|---|---|
| Bulk job started | `info` | `jobId`, `shop`, `productCount` |
| Product generated | `debug` | `jobId`, `shop`, `productId` |
| Product failed | `error` | `jobId`, `shop`, `productId`, `err` |
| Bulk job complete | `info` | `jobId`, `completedProducts`, `failedProducts` |
| Claude API retry | `warn` | `model`, `status`, `attempt` |
| Claude API error | `error` | `model`, `status`, `body` |
| Plan limit hit | `warn` | `shop`, `planName`, `monthlyLimit` |

---

## Health Check

The app has no dedicated `/health` endpoint (Shopify CLI doesn't require one). To verify the deployment is healthy:

1. Visit `https://your-domain.com/app` — should redirect to Shopify auth
2. Check logs for any startup errors
3. Run `npx prisma migrate status` to verify DB is in sync
