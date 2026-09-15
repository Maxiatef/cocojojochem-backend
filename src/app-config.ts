import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as express from 'express';
import { Request, Response, NextFunction } from 'express';

/**
 * Everything that turns a bare Nest app into THIS app: CORS, the uploads
 * static mount, the Stripe raw-body carve-out, body parsers, the /api prefix,
 * validation, and Swagger.
 *
 * Extracted from main.ts so the long-running server and the serverless handler
 * in api/index.ts configure the app identically. When this lived inline in
 * bootstrap(), a second entry point could only duplicate it — and a
 * duplicated body-parser order is exactly the kind of drift that breaks
 * Stripe webhook signatures silently, months later.
 */
export async function configureApp(app: INestApplication): Promise<void> {
  // Open CORS by request. This is safe here specifically because auth is a
  // Bearer token in the Authorization header, not a cookie: a wildcard origin
  // only blocks credentialed requests, and this API makes none. Every write
  // route is still gated by JwtAuthGuard + PermissionGuard, which is what
  // actually protects the data — CORS never did.
  //
  // It would have to be narrowed to an allowlist if auth ever moves to
  // cookies, since browsers refuse to send them to '*'.
  app.enableCors({
    origin: '*',
  });

  // Ensure upload directories exist — ported from the real cocojojo.com main.ts
  //
  // Wrapped because a serverless filesystem is read-only outside /tmp: mkdir
  // throws EROFS there, and an unhandled throw here would take down every
  // route, not just uploads. Uploading is broken in that environment either
  // way — this makes the rest of the API survive it.
  const uploadDirs = ['./uploads', './uploads/products', './uploads/variants', './uploads/categories', './uploads/gallery', './uploads/temp'];
  try {
    uploadDirs.forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  } catch (err) {
    new Logger('Bootstrap').warn(
      `Could not create upload directories (${
        err instanceof Error ? err.message : err
      }). File uploads will fail; everything else is unaffected.`,
    );
  }

  // Serve uploaded images with CORS headers — same dual-path pattern as the
  // real site (both /api/uploads and /uploads resolve to the same folder).
  const uploadsCors = (_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Max-Age', '86400');
    next();
  };
  // Files are served straight off disk from our own origin, so the response
  // headers are the only thing standing between an uploaded file and the
  // browser executing it as page content.
  //
  //  - `nosniff` stops content-type sniffing: without it a browser may
  //    disregard the declared type and render, say, a .csv containing markup
  //    as HTML on this origin.
  //  - Anything that is not a PDF or a plain raster image is forced to
  //    download rather than render. Office files are inert either way, but
  //    the allowlist means a type added later is safe by default.
  //  - PDFs and images keep `inline` so a certificate opens in a new browser
  //    tab, which is how the product page links them.
  const INLINE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const staticOptions: Parameters<typeof express.static>[1] = {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      res.setHeader(
        'Content-Disposition',
        INLINE_EXTENSIONS.includes(ext) ? 'inline' : 'attachment',
      );
    },
  };

  app.use('/api/uploads', uploadsCors, express.static(join(process.cwd(), 'uploads'), staticOptions));
  app.use('/uploads', uploadsCors, express.static(join(process.cwd(), 'uploads'), staticOptions));

  // Stripe requires the raw request body to verify webhook signatures.
  // Registered first (and bodyParser is disabled above) so this route's body
  // arrives as an untouched Buffer instead of being parsed as JSON.
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  // Every other route gets the normal JSON body parser that Nest would
  // otherwise have registered automatically.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CocoJojoChem Wholesale API')
    .setDescription('Backend API for the CocoJojoChem wholesale catalog, accounts, orders, and admin dashboard')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  // Swagger's CSS and JS bundles normally come off disk from
  // node_modules/swagger-ui-dist, served by an Express static handler. A
  // serverless deploy does not trace those files into the function bundle, so
  // every asset 404s and the docs render as a white page with
  // "SwaggerUIBundle is not defined" in the console.
  //
  // Loading them from a CDN sidesteps the filesystem entirely. Pinned to the
  // exact version installed here (swagger-ui-dist 5.17.14) rather than a
  // floating major, so the deployed docs and a local run are the same UI.
  const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    customCssUrl: `${SWAGGER_UI}/swagger-ui.css`,
    customJs: [
      `${SWAGGER_UI}/swagger-ui-bundle.js`,
      `${SWAGGER_UI}/swagger-ui-standalone-preset.js`,
    ],
  });
}
