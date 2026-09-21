// Loaded before anything else, for the same reason main.ts does it: several
// modules read process.env.* in static registration calls that run at import
// time, ahead of ConfigModule.
import 'dotenv/config';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
// Default import, not a namespace import: express() has to be callable here,
// and a namespace import is not. esModuleInterop is on, so this resolves to
// the same module.
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-config';

/**
 * Serverless entry point.
 *
 * Vercel does not run a server — it imports this file and calls the default
 * export per request. So this cannot use `app.listen()` the way main.ts does;
 * it builds the Nest application on top of a plain Express instance and hands
 * that instance the request.
 *
 * `main.ts` is still the entry point for every normal host, and is the better
 * one: see DEPLOY.md for why this environment costs you file uploads, safe
 * migrations, and a shared connection pool.
 */
const server = express();

/**
 * Last-resort crash logging.
 *
 * Nest's exception filter turns a throw inside a handler into a 500 with a
 * body, and the bootstrap catch below does the same for a failed start. So
 * anything that reaches HERE escaped the request lifecycle entirely — a
 * rejected promise nobody awaited, or an 'error' event on a socket or a
 * database connection with no listener. Node kills the process for those, and
 * the platform reports it as a bare "Node.js process exited with exit status:
 * 1" with no indication of what happened, which is indistinguishable from the
 * function being killed for any other reason.
 *
 * These handlers do not make the process survive — swallowing an uncaught
 * exception leaves it in an unknown state, which is worse than a restart. They
 * exist purely so the cause is printed before it dies.
 */
let crashLoggerInstalled = false;
function installCrashLogging() {
  if (crashLoggerInstalled) return;
  crashLoggerInstalled = true;

  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error(
      `[fatal] uncaughtException${
        (err as NodeJS.ErrnoException)?.code ? ` [${(err as NodeJS.ErrnoException).code}]` : ''
      }: ${err?.message}`,
      err?.stack,
    );
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    // eslint-disable-next-line no-console
    console.error(
      `[fatal] unhandledRejection${
        (err as NodeJS.ErrnoException)?.code ? ` [${(err as NodeJS.ErrnoException).code}]` : ''
      }: ${err.message}`,
      err.stack,
    );
    process.exit(1);
  });
}
installCrashLogging();

// Built once per cold start and reused for every request that instance
// serves. Holding the promise rather than a boolean matters: two requests can
// arrive before the first bootstrap resolves, and awaiting the same promise
// means they share one app instead of racing to build two.
let bootstrapped: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  // bodyParser disabled for the same reason as main.ts — the Stripe webhook
  // route needs its raw body, which configureApp() registers before the JSON
  // parser.
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
  });
  await configureApp(app);
  // init(), not listen(): the platform owns the socket.
  await app.init();
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!bootstrapped) bootstrapped = bootstrap();
    await bootstrapped;
  } catch (err) {
    // Without this, a bootstrap failure rejects an un-awaited promise and the
    // runtime kills the process with a bare "exit status 1" and no message —
    // which is exactly as useful as no log at all. Print it, then reset so the
    // next request retries rather than awaiting a permanently rejected
    // promise.
    bootstrapped = null;
    // eslint-disable-next-line no-console
    console.error('[bootstrap] Nest failed to start:', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        statusCode: 500,
        message: 'The API failed to start. See the function logs for the cause.',
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
    return;
  }
  server(req, res);
}
