# ARCHITECTURE — Navaal (`contentclaude`)

One page. What the pieces are, how a request moves through them, and which decisions are load-bearing.

For how to deploy it, see `DEPLOYMENT.md`. For what to do when it breaks, see `docs/RUNBOOK.md`.

---

## What the app is

A Shopify embedded app that writes SEO, AEO and GEO content for a merchant's products — titles, meta
descriptions, alt text, FAQ blocks, and `llms.txt` files served at the storefront — using the Anthropic
API. It runs inside the Shopify admin as an iframe, and it publishes back through the Shopify Admin
GraphQL API.

Two things make it more than a form around a model call: **quota**, because generations cost real money
per merchant per month, and **bulk**, because a merchant with two thousand products starts a job that
takes hours and must survive a deploy.

---

## The shape

```
                Shopify Admin (iframe)
                          │  App Bridge, session token
                          ▼
        ┌─────────────────────────────────────────┐
        │  Fly.io app "contentclaude" — syd       │
        │                                         │
        │  ┌──────────────┐   ┌────────────────┐  │
        │  │ web          │   │ worker         │  │
        │  │ shared-1x    │   │ shared-2x 1GB  │  │
        │  │ 512 MB       │   │ auto_stop=off  │  │
        │  │              │   │                │  │
        │  │ React Router │   │ BullMQ worker  │  │
        │  │ SSR + routes │   │ scheduler      │  │
        │  │ webhooks     │   │ nightly backup │  │
        │  └──────┬───────┘   └───────┬────────┘  │
        └─────────┼───────────────────┼───────────┘
                  │                   │
       ┌──────────┴─────────┬─────────┴───────────┐
       ▼                    ▼                     ▼
  Neon Postgres      Upstash Redis          Anthropic API
  (pooled, syd)      (BullMQ + cache,       (content generation)
                      syd)
                           │
                           ├── worker:heartbeat  ─┐
                           └── digest/backup      │ read by /api/health?deep=1
                               day-claims         │ from a web machine
                                                  ┘
       Cloudflare R2 ◀── nightly pg_dump ── worker
       Sentry        ◀── errors ── both
       Resend        ◀── alerts + daily digest ── worker
```

**Everything except R2 and the APIs is in `syd`.** The database, the queue and the app are one region
apart from each other by design: a query is a local round trip, not a Pacific crossing.

---

## The two processes

`fly.toml` declares two process groups running the same image. `app/utils/processRole.server.js` reads
`FLY_PROCESS_GROUP` and exports `RUNS_JOBS`, and every job-shaped thing in the app is behind that flag.

**`web`** serves the embedded admin (React Router 7 in framework mode, server-rendered), the API routes,
the webhook endpoints and the app proxy. It **enqueues** work and never performs it. It can be stopped
and started freely; `min_machines_running = 1`.

**`worker`** runs the BullMQ worker, the five-minute stuck-job sweep, the five-minute deep-health probe,
the 07:00 daily digest and the 03:00 nightly backup. It has no HTTP server: `[http_service]` is bound to
`processes = ["web"]`, so nothing can route to it. It is never auto-stopped, because a stopped worker is
a queue nobody drains.

Locally, with no process group set, one process is both. Nobody has to run two things to develop.

### Why this split is load-bearing

Before it, one 512 MB machine did everything. A web deploy killed whatever bulk job was mid-flight. A
long generation competed with page loads for the same CPU and the same database connections. Now
deploying the UI does not touch a running job — proven, with machine versions before and after, under
Phase 1 item 2 in `PROGRESS.md`.

### The consequence that had to be designed for

Once the worker is a different machine, a web machine answering "is the worker alive?" cannot look
inward — it would be reporting on itself and always saying yes. So the worker writes
`worker:heartbeat` to Redis every 30 seconds, and `/api/health?deep=1` reads it and calls the worker dead
after 90 seconds of silence. Liveness became a fact in shared storage rather than a local variable.

---

## Data

**Neon Postgres**, pooled endpoint, `connection_limit=5` for web and (optionally) 3 for the worker. Prisma
is the only access path. The schema is versioned in `prisma/migrations/`, baselined at `0_init`.

The shapes that matter: `Shop` (install, plan, settings), `Plan` and usage records (quota), and
`GenerationJob` with its per-product rows (bulk state, resumable).

**Upstash Redis** carries three unrelated things and it is worth knowing which: the BullMQ queue, a
short-lived cache, and small coordination keys — the worker heartbeat, and the `SET NX` day-claims that
stop a worker restart sending two digests or taking two backups in one day.

Redis is **optional**. Without `REDIS_URL` the queue falls back to inline processing and health reports
`degraded`, honestly, rather than pretending.

---

## How a bulk generation actually flows

1. The merchant clicks Generate All. The action authenticates the Shopify session, checks quota, and
   writes a `GenerationJob` plus one row per product.
2. It enqueues one BullMQ job and returns. **The web request does no model work** — that is why the page
   comes back immediately and why a deploy cannot interrupt it.
3. The worker picks it up, processes products with `BULLMQ_CONCURRENCY` in flight, calls Anthropic per
   product, and writes each result as it lands.
4. Quota is consumed inside a SERIALIZABLE transaction, so two concurrent runs cannot both spend the last
   generation.
5. The admin polls `/api/jobs-status` **only while the layout loader reports an active job**, and stops
   after two idle responses.
6. On SIGTERM the worker drains for up to 30 seconds inside a 60-second `kill_timeout`. Anything still
   unfinished is picked up by boot recovery, and the five-minute sweep re-queues anything stuck in
   `processing`.

The design property throughout: **a job's state is in Postgres, not in a process.** Any worker can resume
any job, and a machine dying costs at most one product.

---

## Failure handling, and where each failure surfaces

| What fails | What the app does | Where you see it |
|---|---|---|
| Anthropic 429 | Reads the RFC3339 reset header and waits exactly that long; retries | log, then the job continues |
| Anthropic failing repeatedly | Circuit breaker opens; generations fail fast instead of burning the quota | `degraded`, Sentry, and the merchant is told |
| Redis away | Queue falls back to inline; heartbeat goes stale | `degraded` — deliberately **not** an alert |
| Postgres away | Everything 503s | `error` → email within five minutes → external monitor |
| A job stalls | BullMQ lock expires; the sweep re-queues it | `stuckProcessing` in deep health |
| A bad deploy | Smoke job fails on SHA mismatch or unhealthy deep health | CI red, and the previous release stays up |

`degraded` and `error` are different on purpose. `degraded` states the app is built to ride out, so
paging on them teaches the owner to ignore alerts. `error` means merchants are affected, and it emails.

---

## Security

- Every webhook verifies its HMAC with `SHOPIFY_API_SECRET`, enforces a replay window, and de-duplicates
  on the delivery id.
- Product data goes to the model fenced inside `<untrusted_product_data>` with a system prompt that says
  it is data, never instruction. A merchant's product description cannot redirect the model.
- The container runs as `node`, not root, on `node:22-alpine`.
- The app requests two scopes: `write_products` and `write_content`. Nothing else.

---

## What this architecture does not do yet

- **One region.** Web is `syd` only. `iad` would cut network latency for US merchants and then pay a
  Pacific crossing on every query, which is a net loss until the database is regional.
- **One worker.** Fine at current volume; a second one needs no code change, because job state is in
  Postgres and the queue is in Redis.
- **The alerting lives inside the thing it watches.** The five-minute probe cannot report that Fly is
  gone. That is what the external uptime monitor is for, and it is HUMAN-NEEDED item 3.
