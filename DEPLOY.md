# Deploying the API

This branch carries deployment configuration for the NestJS backend. The
database is already live on Clever Cloud; this is about getting the API onto a
host and pointed at it.

---

## Read this first: Vercel is the wrong host for this API

The branch is named `vercel` to match the frontend's, but the API should not be
deployed there. Three specific reasons, none of them a matter of taste:

1. **Uploads are written to local disk.** `main.ts` creates `./uploads/...` and
   serves it with `express.static`. Vercel functions have an ephemeral
   filesystem — an uploaded product image would be gone before anyone could
   load it, and the admin's upload flow would appear to work while losing every
   file.
2. **Migrations run on boot** (`migrationsRun: true` in `app.module.ts`).
   Serverless functions cold-start constantly and concurrently. Several
   instances would race to apply the same migration against the same database.
3. **It is a long-lived application.** A TypeORM connection pool, a boot-time
   permission reconcile (`RolesService.onApplicationBootstrap`), and Swagger
   document generation all happen at startup. Serverless repeats that per cold
   start and will exhaust Clever Cloud's connection limit.

**Deploy the API to a host with a real process and a real disk** — Render,
Railway, Fly.io, or a VPS. The frontend stays on Vercel; only
`NEXT_PUBLIC_API_URL` needs to know where the API lives.

---

## Environment variables

Beyond the existing `.env.example`, a deployed instance needs:

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Also switches port binding to strict mode — see below. |
| `PORT` | whatever the host assigns | Most hosts inject this. |
| `DB_HOST` | `bzesax2fxpoue2au2hih-postgresql.services.clever-cloud.com` | |
| `DB_PORT` | `50013` | Not 5432. |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | from the Clever Cloud addon | |
| **`DB_SSL`** | **`true`** | **Clever Cloud refuses plaintext connections.** Without this the API cannot start. |
| `DB_SSL_REJECT_UNAUTHORIZED` | `false` | Managed providers use self-signed certificates. The connection is still encrypted. |
| `CORS_ORIGIN` | `https://your-frontend.vercel.app` | Comma-separated. Leaving it unset means `*`, which browsers refuse to send credentials to. |
| `JWT_SECRET` | a long random string | Must not be the `change-me` default. |
| `FRONTEND_URL` | the storefront's URL | Used in emails and Stripe redirect URLs. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SHIPPO_API_KEY` | real keys | |

## What this branch changes in code

Three changes, all required by any hosted deployment rather than by Vercel
specifically:

**`app.module.ts` — Postgres TLS.** The TypeORM config had no `ssl` option, so
it would have been refused by Clever Cloud on the first connection attempt.
Now driven by `DB_SSL`, defaulting to off so a local postgres container still
works.

**`main.ts` — CORS allowlist.** Was hardcoded to `origin: '*'`. That is
unusable in production: the browser will not send credentials to a wildcard
origin, and it invites any site to call this API from a visitor's browser.
`CORS_ORIGIN` now takes a comma-separated list, falling back to `*` when unset
so local development is unaffected.

**`main.ts` — strict port binding in production.** `listenOnFirstFreePort()`
walks forward to the next free port when one is busy, which is a good local
convenience and actively harmful on a host: the platform routes traffic to the
port it assigned, so binding a different one means the health check never
passes and the deploy is marked failed. Under `NODE_ENV=production` it now
binds the given port or throws.

## Uploads

**Still the open problem.** Files go to `./uploads` on local disk. On Render or
Railway, attach a **persistent disk mounted at `/app/uploads`** and they
survive. On anything with an ephemeral filesystem they do not.

The durable fix is object storage — Cloudflare R2 (10GB free, no egress fees)
or S3. That means changing the five endpoints in `src/modules/upload/` to
upload to a bucket and store the returned URL, and removing the two
`express.static` lines from `main.ts`. Roughly half a day, and it removes the
persistent-disk requirement entirely.

## Migrations

`migrationsRun: true` applies pending migrations on boot. That is fine for a
single instance and dangerous for several.

The database restored from the local dump already contains the `migrations`
table with everything through `AddFunctionCreatedAt1788500200000`, so the
first deploy will find nothing to apply.

**Do not scale past one instance** while this is on. When you need to, set
`migrationsRun: false` and run `npm run migration:run` as a release step
instead.

## Deploying to Render (the recommended path)

1. New → Web Service → connect the repo.
2. Build command `npm install && npm run build`, start command `npm run start:prod`.
3. Add a disk: mount path `/app/uploads`, 1GB.
4. Add the environment variables above.
5. After the first deploy, point the frontend's `NEXT_PUBLIC_API_URL` at
   `https://<service>.onrender.com/api` — **including `/api`**, which the app
   sets as a global prefix — and redeploy the frontend so the new value is
   inlined into its bundle.
6. Update the Stripe webhook endpoint to `https://<service>.onrender.com/api/webhooks/stripe`.

Health check path: `/api/health`.

## Before pointing a domain at this

`BEFORE-PRODUCTION.md` in the repo root is a readiness audit. Its critical
blocker — write endpoints with no authentication — was closed by the roles and
permissions work. Sections 2 and 3 are still live: Shippo returns no tracking
number, there is no structured shipping address, and MOQ is declared but never
enforced.
