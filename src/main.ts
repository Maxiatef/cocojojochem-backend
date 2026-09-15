// Must be the very first import — loads .env into process.env before any
// other file in the app is evaluated. Several modules read process.env.*
// directly in static registration calls (e.g. AuthModule's
// JwtModule.register({ secret: process.env.JWT_SECRET })), which run at
// import time, BEFORE ConfigModule.forRoot() would otherwise load .env
// (that only runs later, during AppModule's own decorator evaluation).
// Without this, those static reads silently see `undefined` and fall back
// to their hardcoded defaults — while anything reading process.env lazily
// (e.g. inside a provider's constructor, like JwtStrategy) sees the real
// value once ConfigModule has run, causing sign/verify secret mismatches.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { networkInterfaces } from 'os';
import { AppModule } from './app.module';
import { configureApp } from './app-config';

async function bootstrap() {
  // bodyParser disabled here so we can register express.raw() for the Stripe
  // webhook path BEFORE Nest's default express.json() parser would otherwise
  // consume/parse that route's body first (Nest registers its body parser
  // globally during NestFactory.create, which runs ahead of anything we add
  // via app.use afterwards — so the only reliable fix is to opt out of the
  // default parser and register both explicitly, raw() for the Stripe path
  // first, json() for everything else).
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  await configureApp(app);

  const startPort = Number(process.env.PORT) || 4000;
  const bootStartedAt = Date.now();
  // Falling forward to the next free port is a local-development convenience.
  // On a host that hands you a port and routes traffic to exactly it, binding
  // a different one means the health check never succeeds and the deploy is
  // marked failed — so in production, bind what we were given or fail loudly.
  const port =
    process.env.NODE_ENV === 'production'
      ? (await app.listen(startPort), startPort)
      : await listenOnFirstFreePort(app, startPort);
  logStartupBanner(port, startPort, Date.now() - bootStartedAt);
}
bootstrap();

// Returns every non-internal IPv4 address on this machine, so the log shows
// the LAN addresses the API is actually reachable on — not just localhost,
// which is useless when testing from a phone or another machine on the
// network. `app.listen(port)` binds 0.0.0.0 by default, so all of these
// genuinely serve traffic.
function getLanAddresses(): string[] {
  const nets = networkInterfaces();
  const addresses: string[] = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      // Node <18 reports `family` as the string 'IPv4'; newer versions use 4.
      const isIpv4 = net.family === 'IPv4' || (net.family as unknown as number) === 4;
      if (isIpv4 && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

function logStartupBanner(port: number, requestedPort: number, bootMs: number) {
  const logger = new Logger('Bootstrap');
  const env = process.env.NODE_ENV || 'development';

  logger.log(`CocoJojoChem backend started in ${bootMs}ms — ${env} — pid ${process.pid} — node ${process.version}`);
  logger.log(`Listening on 0.0.0.0:${port}`);
  logger.log(`  local    http://localhost:${port}/api`);
  for (const ip of getLanAddresses()) {
    logger.log(`  network  http://${ip}:${port}/api`);
  }
  logger.log(`  health   http://localhost:${port}/api/health`);
  logger.log(`  docs     http://localhost:${port}/api/docs`);

  // Surfaced loudly because listenOnFirstFreePort() silently falls forward:
  // a stale process holding 4000 means the app boots on 4001 and every
  // frontend request (hardcoded to 4000) 404s with nothing obviously wrong.
  if (port !== requestedPort) {
    logger.warn(
      `Port ${requestedPort} was busy — bound ${port} instead. NEXT_PUBLIC_API_URL points at ${requestedPort}, so the frontend will NOT reach this process until you free that port or update it.`,
    );
  }

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME || 'cocojojochem';
  logger.log(`Database  postgres://${dbHost}:${dbPort}/${dbName}`);
  logger.log(`Frontend  ${process.env.FRONTEND_URL || 'http://localhost:3000'} (CORS: *)`);

  // Configured/missing only — never the values. Keys are the single most
  // common cause of "it works locally but not on the server", and several of
  // these fail silently at runtime rather than at boot.
  const integrations: [string, string | undefined][] = [
    ['Stripe', process.env.STRIPE_SECRET_KEY],
    ['Stripe webhook', process.env.STRIPE_WEBHOOK_SECRET],
    ['Resend email', process.env.RESEND_API_KEY],
    ['Shippo', process.env.SHIPPO_API_KEY],
    // ShipStation intentionally omitted — disabled in favour of Shippo.
  ];
  const configured = integrations.filter(([, v]) => !!v).map(([k]) => k);
  const missing = integrations.filter(([, v]) => !v).map(([k]) => k);
  logger.log(`Integrations configured: ${configured.length ? configured.join(', ') : 'none'}`);
  if (missing.length) {
    logger.warn(`Integrations NOT configured (these features silently no-op): ${missing.join(', ')}`);
  }

  // A boot with the fallback secret still signs and accepts real tokens, so
  // it never surfaces as an error — only as an app anyone can forge a login for.
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is not set — falling back to the hardcoded default. Do NOT run like this outside local dev.');
  }
}

// Tries `startPort`, then startPort+1, startPort+2, ... until one binds
// successfully — so a stray leftover process on 4000 doesn't block startup.
async function listenOnFirstFreePort(app: import('@nestjs/common').INestApplication, startPort: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    try {
      await app.listen(port);
      return port;
    } catch (err: any) {
      if (err?.code === 'EADDRINUSE') {
        new Logger('Bootstrap').warn(`Port ${port} is already in use — trying ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not find a free port after trying ${startPort}-${startPort + maxAttempts - 1}`);
}
