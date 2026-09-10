import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SiteSettingsService } from './src/modules/site-settings/site-settings.service';

const KEYS = [
  'senderEmail',
  'senderName',
  'quoteNotificationEnabled',
  'quoteNotificationEmail',
  'contactMessageNotificationEnabled',
  'contactMessageNotificationEmail',
  'newOrderNotificationEnabled',
  'newOrderNotificationEmail',
];

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const settings = app.get(SiteSettingsService);

  // `set` mode rewires every recipient to one inbox and swaps the sender to
  // resend.dev, which is the only combination the sandbox will deliver.
  const target = process.argv[2] === 'set' ? process.argv[3] : null;
  if (target) {
    await (settings as any).update({
      senderEmail: 'onboarding@resend.dev',
      quoteNotificationEmail: target,
      contactMessageNotificationEmail: target,
      newOrderNotificationEmail: target,
      quoteNotificationEnabled: 'true',
      contactMessageNotificationEnabled: 'true',
      newOrderNotificationEnabled: 'true',
    });
    console.log(`\nrewired sender + all notification recipients -> ${target}\n`);
  }

  for (const k of KEYS) {
    console.log(`  ${k.padEnd(36)} = ${(await settings.getValue(k)) ?? '(unset)'}`);
  }

  await app.close();
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
