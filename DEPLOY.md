# Deploying the API

This branch carries deployment configuration for the NestJS backend. The
database is already live on Clever Cloud; this is about getting the API onto a
host and pointed at it.

---

## Deploying to Vercel

The API runs on Vercel via `api/index.ts`, which builds the Nest app on a plain
Express instance and exports a request handler — Vercel imports that file and
calls it per request rather than running a server.

**Import the repo on Vercel and set the environment variables below.** No build
command override is needed; `vercel.json` rewrites every path to the function
and `api/index.ts` is picked up automatically.

### What you give up in this environment

Understand these before pointing anything real at it:

1. **File uploads do not work.** The upload endpoints write to `./uploads` and
   the filesystem is read-only outside `/tmp`. Directory creation is caught and
   logged rather than thrown, so the rest of the API is unaffected — but
   uploading an image will fail, and any image already stored as a
   `/uploads/...` URL will 404. Cloudflare R2 or S3 is the fix; see
   [Uploads](#uploads).
2. **Migrations must not run on boot.** Every cold start is a boot and several
   can race. Set `RUN_MIGRATIONS=false` and apply migrations yourself.
3. **Each cold-started instance opens its own connection pool.** Keep
   `DB_POOL_MAX` small — 2 or 3 — or a traffic spike exhausts the database's
   connection limit.
4. **Cold starts are slow.** Nest builds the module graph, connects TypeORM,
   runs the role permission reconcile and generates the Swagger document on
   every one. Expect a few seconds on the first request after a quiet period.

For anything beyond "see it online", deploy to a host with a real process and a
real disk — Render, Railway, Fly, or a VPS. `main.ts` and the `Dockerfile` are
still the path for those, and none of the four caveats above apply. See
[Deploying to Render](#deploying-to-render-the-long-term-path).

---

## Environment variables

Beyond the existing `.env.example`, a deployed instance needs:

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Also switches port binding to strict mode — see below. |
| `PORT` | whatever the host assigns | Most hosts inject this. Vercel does not use it. |
| `RUN_MIGRATIONS` | `false` **on Vercel** | Stops cold starts racing to apply migrations. Leave unset elsewhere. |
| `DB_POOL_MAX` | `2` **on Vercel** | Each instance opens its own pool. Leave unset elsewhere for the default of 10. |
| `DB_HOST` | `bzesax2fxpoue2au2hih-postgresql.services.clever-cloud.com` | |
| `DB_PORT` | `50013` | Not 5432. |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | from the Clever Cloud addon | |
| `JWT_SECRET` | a long random string | Must not be the `change-me` default. |
| `FRONTEND_URL` | the storefront's URL | Used in emails and Stripe redirect URLs. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SHIPPO_API_KEY` | real keys | |

## What this branch changes in code

**`src/app-config.ts` (new).** Everything that turns a bare Nest app into this
one — CORS, the uploads mount, the Stripe raw-body carve-out, body parsers, the
`/api` prefix, validation, Swagger — extracted from `main.ts` so the server and
the serverless handler configure the app identically. Duplicating it would have
meant two body-parser orderings, which is how Stripe webhook signatures break
silently months later.

**`api/index.ts` (new).** The Vercel handler. `app.init()`, not `app.listen()`
— the platform owns the socket. The bootstrap promise is cached rather than a
boolean flag, so two requests arriving during a cold start share one app
instead of racing to build two.

**`tsconfig.build.json`.** Excludes `api/` from the Nest build. Left in, it
widens the inferred rootDir to the repo root and `nest build` emits
`dist/src/main.js` instead of `dist/main.js`, breaking `start:prod` and the
Dockerfile for every other host.

**`app.module.ts`.** `migrationsRun` and the connection pool size are now
env-driven (`RUN_MIGRATIONS`, `DB_POOL_MAX`), defaulting to the previous
behaviour.

**CORS stays open (`origin: '*'`)**, deliberately. Auth here is a Bearer token
in the Authorization header rather than a cookie, so a wildcard origin costs
nothing — it only blocks *credentialed* requests, and this API makes none. The
`JwtAuthGuard` + `PermissionGuard` on each route is what protects the data;
CORS never did. This would need narrowing to an allowlist if auth ever moved to
cookies, since browsers refuse to send them to `*`.

**`main.ts` — strict port binding in production.** `listenOnFirstFreePort()`
walks forward to the next free port when one is busy, which is a good local
convenience and actively harmful on a host: the platform routes traffic to the
port it assigned, so binding a different one means the health check never
passes and the deploy is marked failed. Under `NODE_ENV=production` it now
binds the given port or throws.

**The database connection is plaintext.** There is no `ssl` option in the
TypeORM config, by choice. Clever Cloud accepts unencrypted connections, so
this works — but credentials and query data cross the public internet in the
clear. Adding `ssl: { rejectUnauthorized: false }` to `TypeOrmModule.forRoot`
is the whole fix if that is ever wanted.

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

## Deploying to Render (the long-term path)

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
