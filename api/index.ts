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
  if (!bootstrapped) bootstrapped = bootstrap();
  await bootstrapped;
  server(req, res);
}
