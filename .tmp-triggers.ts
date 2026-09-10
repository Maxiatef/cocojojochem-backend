import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { EmailService } from './src/modules/email/email.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order, QuoteRequest, ContactMessage } from './src/entities';
import { Repository } from 'typeorm';

const TO = 'maxatef235@gmail.com';

let pass = 0;
let fail = 0;

// The send methods swallow their own errors and only log, so "did it send?"
// can't be read from a thrown exception. Watch the logger instead: a real
// send logs "... sent ...", any failure logs "Failed to send ...".
function watch(logger: any) {
  const lines: string[] = [];
  for (const level of ['log', 'warn', 'error']) {
    const orig = logger[level].bind(logger);
    logger[level] = (msg: any, ...rest: any[]) => {
      lines.push(`${level}: ${msg}`);
      return orig(msg, ...rest);
    };
  }
  return lines;
}

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const email = app.get(EmailService);
  const lines = watch((email as any).logger);

  const ordersRepo = app.get<Repository<Order>>(getRepositoryToken(Order));
  const quotesRepo = app.get<Repository<QuoteRequest>>(getRepositoryToken(QuoteRequest));
  const messagesRepo = app.get<Repository<ContactMessage>>(getRepositoryToken(ContactMessage));

  async function fire(label: string, fn: () => Promise<any>) {
    const before = lines.length;
    await fn();
    const produced = lines.slice(before);
    const failed = produced.find((l) => /Failed to send|not configured|skipping/i.test(l));
    if (failed) {
      fail++;
      console.log(`  FAIL  ${label}\n        ${failed}`);
    } else {
      pass++;
      console.log(`  PASS  ${label}`);
    }
  }

  const order = await ordersRepo.findOne({
    where: {},
    relations: ['items', 'user'],
    order: { id: 'DESC' },
  });
  if (!order) {
    console.log('no order in the database to test with');
    process.exit(1);
  }
  // Redirect in memory only — never saved, so the real order row is untouched.
  order.user = null as any;
  order.guestEmail = TO;
  console.log(`\nusing order #${order.id} (${order.items?.length ?? 0} items), redirected to ${TO}\n`);

  await fire('order confirmation  (customer)', () => email.sendOrderConfirmationEmail(order));
  await fire('new order           (internal)', () => email.sendNewOrderInternalNotification(order));
  await fire('shipping confirm    (customer)', () => email.sendShippingConfirmationEmail(order));
  await fire('order cancelled     (customer)', () => email.sendOrderCancelledEmail(order));
  await fire('refund required     (internal)', () => email.sendRefundRequiredInternalNotification(order));

  const quote = await quotesRepo.findOne({ where: {}, order: { id: 'DESC' } });
  if (quote) await fire('quote request       (internal)', () => email.sendQuoteRequestNotification(quote));
  else console.log('  SKIP  quote request — no rows');

  const message = await messagesRepo.findOne({ where: {}, order: { id: 'DESC' } });
  if (message) await fire('contact message     (internal)', () => email.sendContactMessageNotification(message));
  else console.log('  SKIP  contact message — no rows');

  await fire('password reset code (customer)', () => email.sendPasswordResetCode(TO, '123456'));
  await fire('admin reset link    (staff)', () =>
    email.sendAdminPasswordResetLink(TO, 'http://localhost:3000/reset?token=smoke', 'Max'),
  );

  console.log(`\n${pass} sent, ${fail} failed\n`);
  await app.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
