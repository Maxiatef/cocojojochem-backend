import { Injectable, Logger } from '@nestjs/common';
// Brevo is retained (commented out) rather than removed so the previous
// provider wiring stays visible for reference. Resend is the live sender.
// import * as brevo from '@getbrevo/brevo';
import { Resend } from 'resend';
import { ContactMessage, Order, QuoteRequest } from '../../entities';
import { SiteSettingsService } from '../site-settings/site-settings.service';

/**
 * Transactional email via Resend. Previously Brevo — sendEmailWithBrevo is
 * kept below, commented out, and every caller now goes through sendEmail.
 *
 * Originally ported from the real cocojojo.com site's
 * EmailService (same `@getbrevo/brevo` SDK, same sendEmailWithBrevo shape —
 * sender {name,email} + to + subject + htmlContent, one TransactionalEmailsApi
 * call). Order confirmation / shipping confirmation templates are ported
 * from the real site's generateOrderConfirmationEmailTemplate /
 * generateShippingConfirmationEmailTemplate, adapted to our schema (our
 * Order has a single free-text shippingAddress blob rather than the real
 * site's separate street/city/state/zip columns, and a real shippingCost
 * column the real site doesn't have).
 *
 * No-ops (never throws past its own boundary — callers should still wrap
 * this in try/catch since a notification failure must never block the
 * actual order/payment flow) when BREVO_API_KEY isn't configured, and never
 * fabricates a "sent" log — if Brevo isn't configured/reachable, that's
 * logged honestly.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');

  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  // Same admin-toggle + admin-set-recipient pattern as
  // sendNewOrderInternalNotification below — no hardcoded fallback email,
  // and an explicit "false" on the enabled setting skips sending entirely.
  async sendQuoteRequestNotification(quoteRequest: QuoteRequest): Promise<void> {
    const enabledSetting = await this.siteSettingsService.getValue('quoteNotificationEnabled');
    if (enabledSetting === 'false') {
      this.logger.log(`Quote-request notifications are disabled — skipping for quote request #${quoteRequest.id}.`);
      return;
    }

    const notifyEmail = await this.siteSettingsService.getValue('quoteNotificationEmail');
    if (!notifyEmail) {
      this.logger.warn(
        `No quote-request notification email configured (Admin Settings → Emails) — skipping for quote request #${quoteRequest.id}.`,
      );
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY not configured — skipping new-quote-request notification for quote request #${quoteRequest.id}.`,
      );
      return;
    }

    const subject = `New Quote Request #${quoteRequest.id} — ${quoteRequest.fullName}`;
    const html = this.buildQuoteRequestEmail(quoteRequest);

    try {
      await this.sendEmail(apiKey, notifyEmail, subject, html);
      this.logger.log(`New-quote-request notification sent for #${quoteRequest.id} to ${notifyEmail}.`);
    } catch (err) {
      this.logger.warn(
        `Failed to send new-quote-request notification for #${quoteRequest.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Same admin-toggle + admin-set-recipient pattern as the other
  // notifications. Previously nothing was sent at all when a customer
  // submitted the Contact Us form — this closes that gap.
  async sendContactMessageNotification(message: ContactMessage): Promise<void> {
    const enabledSetting = await this.siteSettingsService.getValue('contactMessageNotificationEnabled');
    if (enabledSetting === 'false') {
      this.logger.log(`Contact-message notifications are disabled — skipping for contact message #${message.id}.`);
      return;
    }

    const notifyEmail = await this.siteSettingsService.getValue('contactMessageNotificationEmail');
    if (!notifyEmail) {
      this.logger.warn(
        `No contact-message notification email configured (Admin Settings → Emails) — skipping for contact message #${message.id}.`,
      );
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY not configured — skipping contact-message notification for contact message #${message.id}.`,
      );
      return;
    }

    const subject = `New Contact Message #${message.id} — ${message.subject}`;
    const html = this.buildContactMessageEmail(message);

    try {
      await this.sendEmail(apiKey, notifyEmail, subject, html);
      this.logger.log(`Contact-message notification sent for #${message.id} to ${notifyEmail}.`);
    } catch (err) {
      this.logger.warn(
        `Failed to send contact-message notification for #${message.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async sendOrderConfirmationEmail(order: Order): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const email = order.user?.email || order.guestEmail;
    if (!email) {
      this.logger.warn(`Order #${order.id} has no email on file — skipping order confirmation.`);
      return;
    }
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not configured — skipping order confirmation email for order #${order.id}.`);
      return;
    }

    const subject = `Order Confirmation #${order.id} — CocoJojoChem`;
    const html = this.buildOrderConfirmationEmail(order, email);

    try {
      await this.sendEmail(apiKey, email, subject, html, 'CocoJojoChem Orders');
      this.logger.log(`Order confirmation email sent for #${order.id} to ${email}.`);
    } catch (err) {
      this.logger.warn(
        `Failed to send order confirmation email for #${order.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async sendOrderCancelledEmail(order: Order): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const email = order.user?.email || order.guestEmail;
    if (!email) {
      this.logger.warn(`Order #${order.id} has no email on file — skipping cancellation email.`);
      return;
    }
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not configured — skipping cancellation email for order #${order.id}.`);
      return;
    }

    const subject = `Order #${order.id} Cancelled — CocoJojoChem`;
    const html = this.buildOrderCancelledEmail(order, email);

    try {
      await this.sendEmail(apiKey, email, subject, html, 'CocoJojoChem Orders');
      this.logger.log(`Order cancellation email sent for #${order.id} to ${email}.`);
    } catch (err) {
      this.logger.warn(
        `Failed to send order cancellation email for #${order.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Internal notification to the sales team, separate from the
  // customer-facing sendOrderConfirmationEmail above — same trigger point
  // (Stripe payment success), just a different audience/subject/template,
  // mirroring the sendQuoteRequestNotification pattern. Both the on/off
  // toggle and the recipient address are admin-settable (Admin Settings →
  // Emails) — no hardcoded fallback email; if the admin hasn't set one yet,
  // this honestly skips rather than guessing a destination.
  async sendNewOrderInternalNotification(order: Order): Promise<void> {
    const enabledSetting = await this.siteSettingsService.getValue('newOrderNotificationEnabled');
    if (enabledSetting === 'false') {
      this.logger.log(`New-order internal notifications are disabled — skipping for order #${order.id}.`);
      return;
    }

    const notifyEmail = await this.siteSettingsService.getValue('newOrderNotificationEmail');
    if (!notifyEmail) {
      this.logger.warn(
        `No new-order notification email configured (Admin Settings → Emails) — skipping for order #${order.id}.`,
      );
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY not configured — skipping new-order internal notification for order #${order.id}.`,
      );
      return;
    }

    const subject = `COCOJOJOCHEM - New Order #${order.id}`;
    const html = this.buildNewOrderNotificationEmail(order);

    try {
      await this.sendEmail(apiKey, notifyEmail, subject, html, 'CocoJojoChem Orders');
      this.logger.log(`New-order internal notification sent for #${order.id} to ${notifyEmail}.`);
    } catch (err) {
      this.logger.warn(
        `Failed to send new-order internal notification for #${order.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Internal "a refund is owed" alert, sent when a PAID order is cancelled.
   *
   * Exists because the cancellation flow issues no Stripe refund — the
   * customer has just been told their money is coming back, so a human has
   * to actually send it. Carries the Stripe payment intent id so whoever
   * picks it up can refund straight from the Stripe dashboard without
   * hunting for the payment.
   *
   * Recipient is the new-order notification address (the orders inbox), but
   * deliberately NOT gated on `newOrderNotificationEnabled`: that toggle is
   * about routine order noise, and silently suppressing a refund obligation
   * because someone muted new-order emails would cost real money and invite
   * a chargeback.
   */
  async sendRefundRequiredInternalNotification(order: Order): Promise<void> {
    const notifyEmail = await this.siteSettingsService.getValue('newOrderNotificationEmail');
    if (!notifyEmail) {
      this.logger.error(
        `Order #${order.id} was cancelled with a captured payment, but no newOrderNotificationEmail is ` +
          `configured — NOBODY has been told a refund is owed. Set it in Admin > Settings.`,
      );
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.error(
        `RESEND_API_KEY not configured — refund-required alert for order #${order.id} was NOT sent. ` +
          `A refund of ${order.total} is owed to ${order.user?.email || order.guestEmail || 'the customer'}.`,
      );
      return;
    }

    const subject = `ACTION REQUIRED - Refund Order #${order.id} ($${Number(order.total).toFixed(2)})`;
    const html = this.buildRefundRequiredEmail(order);

    try {
      await this.sendEmail(apiKey, notifyEmail, subject, html, 'CocoJojoChem Orders');
      this.logger.log(`Refund-required alert sent for order #${order.id} to ${notifyEmail}.`);
    } catch (err) {
      this.logger.error(
        `Failed to send refund-required alert for order #${order.id} — a refund is owed and unannounced: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async sendShippingConfirmationEmail(order: Order): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const email = order.user?.email || order.guestEmail;
    if (!email) {
      this.logger.warn(`Order #${order.id} has no email on file — skipping shipping confirmation.`);
      return;
    }
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not configured — skipping shipping confirmation email for order #${order.id}.`);
      return;
    }

    const subject = `Your Order #${order.id} Has Shipped! — CocoJojoChem`;
    const html = this.buildShippingConfirmationEmail(order);

    try {
      await this.sendEmail(apiKey, email, subject, html, 'CocoJojoChem Shipping');
      this.logger.log(`Shipping confirmation email sent for #${order.id} to ${email}.`);
    } catch (err) {
      this.logger.warn(
        `Failed to send shipping confirmation email for #${order.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private buildOrderConfirmationEmail(order: Order, email: string): string {
    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const name = order.user?.fullName || order.guestName || 'there';
    const formatDate = (date: Date) =>
      new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    const itemRows = (order.items || [])
      .map((item) => {
        const unitPrice = Number(item.price);
        const lineTotal = unitPrice * item.quantity;
        return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <strong>${escapeHtml(item.productName)}</strong>${item.variantLabel ? ` — ${escapeHtml(item.variantLabel)}` : ''}
          ${item.sku ? `<br><small>SKU: ${escapeHtml(item.sku)}</small>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(unitPrice)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(lineTotal)}</td>
      </tr>`;
      })
      .join('');

    const subtotal = Number(order.subtotal);
    const shippingCost = Number(order.shippingCost);
    const taxAmount = Number(order.taxAmount);
    const couponAmount = Number(order.couponAmount);
    const total = Number(order.total);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Confirmation #${order.id}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #16241c; margin: 0; padding: 0; background: #ffffff; }
        .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; }
        .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #6b7a70; margin-bottom: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 24px; color: #16241c; font-weight: 600; }
        .subhead { margin: 0 0 24px 0; color: #6b7a70; font-size: 14px; }
        .rule { border: none; border-top: 1px solid #e5e1d8; margin: 24px 0; }
        .meta-table { width: 100%; font-size: 14px; }
        .meta-table td { padding: 3px 0; }
        .meta-label { color: #6b7a70; }
        .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .order-table th { border-bottom: 2px solid #16241c; padding: 8px 0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7a70; font-weight: 600; }
        .order-table td { padding: 12px 0; border-bottom: 1px solid #e5e1d8; font-size: 14px; }
        .totals-table { width: 100%; margin-top: 8px; font-size: 14px; }
        .totals-table td { padding: 5px 0; }
        .grand-total { font-weight: 700; font-size: 16px; border-top: 1px solid #16241c; padding-top: 10px !important; }
        .box { border: 1px solid #e5e1d8; padding: 16px; margin: 16px 0; font-size: 14px; }
        .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #16241c; margin: 24px 0 8px 0; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e1d8; font-size: 12px; color: #6b7a70; text-align: center; }
        a { color: #3a5a40; }
    </style>
</head>
<body>
    <div class="container">
        <p class="brand">CocoJojoChem</p>
        <h1>Order Confirmation</h1>
        <p class="subhead">Thank you for your order, ${escapeHtml(name)} — payment received and your order is being processed.</p>

        <table class="meta-table">
            <tr><td class="meta-label">Order Number</td><td style="text-align: right;">#${order.id}</td></tr>
            <tr><td class="meta-label">Order Date</td><td style="text-align: right;">${formatDate(order.createdAt)}</td></tr>
            <tr><td class="meta-label">Email</td><td style="text-align: right;">${escapeHtml(email)}</td></tr>
        </table>

        <p class="section-title">Order Items</p>
        <table class="order-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Unit Price</th>
                    <th style="text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>${itemRows}</tbody>
        </table>

        <table class="totals-table">
            <tr><td>Subtotal</td><td style="text-align: right;">${formatCurrency(subtotal)}</td></tr>
            ${couponAmount > 0 ? `<tr><td>Discount</td><td style="text-align: right;">-${formatCurrency(couponAmount)}</td></tr>` : ''}
            <tr><td>Shipping</td><td style="text-align: right;">${shippingCost > 0 ? formatCurrency(shippingCost) : 'Free'}</td></tr>
            ${taxAmount > 0 ? `<tr><td>Tax</td><td style="text-align: right;">${formatCurrency(taxAmount)}</td></tr>` : ''}
            <tr class="grand-total"><td>Order Total</td><td style="text-align: right;">${formatCurrency(total)}</td></tr>
        </table>

        ${
          order.shippingAddress
            ? `<p class="section-title">Shipping Address</p>
        <div class="box" style="white-space: pre-line;">${escapeHtml(order.shippingAddress)}</div>`
            : ''
        }

        <p class="section-title">What's Next?</p>
        <p style="font-size: 14px; margin: 0 0 4px 0;">You'll receive a shipping confirmation email with tracking once your order ships.</p>
        <p style="font-size: 14px; margin: 0;">Questions about your order? Just reply to this email.</p>

        <div class="footer">
            <p>This is an automated confirmation email for order #${order.id}</p>
            <p>CocoJojoChem</p>
        </div>
    </div>
</body>
</html>`;
  }

  private buildOrderCancelledEmail(order: Order, email: string): string {
    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const name = order.user?.fullName || order.guestName || 'there';
    // A captured Stripe payment is the only thing that makes a refund owed.
    // Promising one unconditionally (as this template used to) told people
    // with unpaid PENDING orders to expect money that was never taken.
    const wasPaid = !!order.stripePaymentIntentId;

    const itemRows = (order.items || [])
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <strong>${escapeHtml(item.productName)}</strong>${item.variantLabel ? ` — ${escapeHtml(item.variantLabel)}` : ''}
          ${item.sku ? `<br><small>SKU: ${escapeHtml(item.sku)}</small>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(Number(item.price) * item.quantity)}</td>
      </tr>`,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order #${order.id} Cancelled</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #16241c; margin: 0; padding: 0; background: #ffffff; }
        .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; }
        .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #6b7a70; margin-bottom: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 24px; color: #16241c; font-weight: 600; }
        .subhead { margin: 0 0 24px 0; color: #6b7a70; font-size: 14px; }
        .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .order-table th { border-bottom: 2px solid #16241c; padding: 8px 0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7a70; font-weight: 600; }
        .order-table td { padding: 12px 0; border-bottom: 1px solid #e5e1d8; font-size: 14px; }
        .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #16241c; margin: 24px 0 8px 0; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e1d8; font-size: 12px; color: #6b7a70; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <p class="brand">CocoJojoChem</p>
        <h1>Your order has been cancelled</h1>
        <p class="subhead">Hi ${escapeHtml(name)}, order #${order.id} has been cancelled.</p>

        <p class="section-title">Cancelled Items</p>
        <table class="order-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>${itemRows}</tbody>
        </table>

        <table class="totals-table">
            <tr>
                <td class="grand-total">Order Total</td>
                <td class="grand-total" style="text-align: right;">${formatCurrency(Number(order.total))}</td>
            </tr>
        </table>

        ${
          wasPaid
            ? `<div class="box">
          <p style="font-size: 14px; margin: 0;">
            <strong>Your refund of ${formatCurrency(Number(order.total))} is on its way.</strong><br>
            It goes back to the original payment method you used at checkout. Refunds usually appear within
            5&ndash;10 business days, depending on your bank.
          </p>
        </div>`
            : `<p style="font-size: 14px; margin: 16px 0 0 0;">
          No payment was captured for this order, so there is nothing to refund.
        </p>`
        }
        <p style="font-size: 14px; margin: 12px 0 0 0;">
          If you weren't expecting this or have any questions, just reply to this email and we'll help sort
          it out.
        </p>

        <div class="footer">
            <p>This is an automated notice for order #${order.id}, sent to ${escapeHtml(email)}</p>
            <p>CocoJojoChem</p>
        </div>
    </div>
</body>
</html>`;
  }

  private buildRefundRequiredEmail(order: Order): string {
    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const customerName = order.user?.fullName || order.guestName || 'Guest';
    const customerEmail = order.user?.email || order.guestEmail || '&mdash;';
    const customerPhone = order.user?.phone || order.guestPhone || '&mdash;';
    const accountType = order.user ? `Registered (user #${order.user.id})` : 'Guest checkout';
    const formatDate = (date: Date | null | undefined) =>
      date
        ? new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '-';

    const itemRows = (order.items || [])
      .map((item) => {
        const unitPrice = Number(item.price);
        const lineTotal = unitPrice * item.quantity;
        return `
      <tr>
        <td>
          <strong>${escapeHtml(item.productName)}</strong>${item.variantLabel ? ` &mdash; ${escapeHtml(item.variantLabel)}` : ''}
          ${item.sku ? `<br><small>SKU: ${escapeHtml(item.sku)}</small>` : ''}
        </td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: right;">${formatCurrency(unitPrice)}</td>
        <td style="text-align: right;">${formatCurrency(lineTotal)}</td>
      </tr>`;
      })
      .join('');

    const subtotal = Number(order.subtotal);
    const shippingCost = Number(order.shippingCost);
    const taxAmount = Number(order.taxAmount);
    const couponAmount = Number(order.couponAmount);
    const total = Number(order.total);

    // Deep link straight to the payment in Stripe. The intent id alone is
    // enough, and the dashboard resolves test vs live itself, so there is no
    // environment guessing here.
    const stripeUrl = order.stripePaymentIntentId
      ? `https://dashboard.stripe.com/payments/${encodeURIComponent(order.stripePaymentIntentId)}`
      : null;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>ACTION REQUIRED - Refund Order #${order.id}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #16241c; margin: 0; padding: 0; background: #ffffff; }
        .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; }
        .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #6b7a70; margin-bottom: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 24px; color: #16241c; font-weight: 600; }
        .subhead { margin: 0 0 24px 0; color: #6b7a70; font-size: 14px; }
        .alert { border: 2px solid #b42318; background: #fef3f2; padding: 16px; margin: 0 0 24px 0; }
        .alert-amount { font-size: 22px; font-weight: 700; color: #b42318; margin: 0 0 4px 0; }
        .meta-table { width: 100%; font-size: 14px; }
        .meta-table td { padding: 3px 0; }
        .meta-label { color: #6b7a70; }
        .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .order-table th { border-bottom: 2px solid #16241c; padding: 8px 0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7a70; font-weight: 600; }
        .order-table td { padding: 12px 0; border-bottom: 1px solid #e5e1d8; font-size: 14px; }
        .totals-table { width: 100%; margin-top: 8px; font-size: 14px; }
        .totals-table td { padding: 5px 0; }
        .grand-total { font-weight: 700; font-size: 16px; border-top: 1px solid #16241c; padding-top: 10px !important; }
        .box { border: 1px solid #e5e1d8; padding: 16px; margin: 16px 0; font-size: 14px; }
        .mono { font-family: "Courier New", monospace; font-size: 13px; word-break: break-all; }
        .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #16241c; margin: 24px 0 8px 0; }
        .btn { display: inline-block; background-color: #b42318; color: #ffffff !important; padding: 11px 22px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.03em; margin-top: 8px; }
        .btn-secondary { display: inline-block; background-color: #3a5a40; color: #ffffff !important; padding: 11px 22px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.03em; margin-top: 8px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e1d8; font-size: 12px; color: #6b7a70; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <p class="brand">CocoJojoChem &middot; Internal</p>
        <h1>Refund required</h1>
        <p class="subhead">Order #${order.id} was cancelled after payment. This refund is NOT automatic.</p>

        <div class="alert">
            <p class="alert-amount">${formatCurrency(total)}</p>
            <p style="font-size: 14px; margin: 0;">
              owed to <strong>${escapeHtml(customerEmail)}</strong><br>
              The customer has already been emailed that this refund is on its way, so please process it
              promptly to avoid a chargeback.
            </p>
        </div>

        <p class="section-title">Refund In Stripe</p>
        <div class="box">
            <table class="meta-table">
                <tr><td class="meta-label">Payment Intent</td><td style="text-align: right;" class="mono">${escapeHtml(order.stripePaymentIntentId || '-')}</td></tr>
                <tr><td class="meta-label">Amount To Refund</td><td style="text-align: right;"><strong>${formatCurrency(total)}</strong></td></tr>
            </table>
            ${stripeUrl ? `<a href="${stripeUrl}" class="btn">Open Payment in Stripe</a>` : ''}
        </div>

        <p class="section-title">Order Details</p>
        <table class="meta-table">
            <tr><td class="meta-label">Order</td><td style="text-align: right;">#${order.id}</td></tr>
            <tr><td class="meta-label">Placed</td><td style="text-align: right;">${formatDate(order.createdAt)}</td></tr>
            <tr><td class="meta-label">Cancelled</td><td style="text-align: right;">${formatDate(new Date())}</td></tr>
            <tr><td class="meta-label">Status</td><td style="text-align: right;">${escapeHtml(order.status)}</td></tr>
        </table>

        <p class="section-title">Customer</p>
        <table class="meta-table">
            <tr><td class="meta-label">Name</td><td style="text-align: right;">${escapeHtml(customerName)}</td></tr>
            <tr><td class="meta-label">Email</td><td style="text-align: right;">${escapeHtml(customerEmail)}</td></tr>
            <tr><td class="meta-label">Phone</td><td style="text-align: right;">${escapeHtml(customerPhone)}</td></tr>
            <tr><td class="meta-label">Account</td><td style="text-align: right;">${escapeHtml(accountType)}</td></tr>
        </table>
        ${
          order.shippingAddress
            ? `<p class="section-title">Shipping Address</p>
        <div class="box" style="white-space: pre-line;">${escapeHtml(order.shippingAddress)}</div>`
            : ''
        }

        <p class="section-title">Cancelled Items</p>
        <table class="order-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Unit</th>
                    <th style="text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>${itemRows}</tbody>
        </table>

        <table class="totals-table">
            <tr><td>Subtotal</td><td style="text-align: right;">${formatCurrency(subtotal)}</td></tr>
            ${couponAmount > 0 ? `<tr><td>Discount${order.couponId ? ` (coupon #${order.couponId})` : ''}</td><td style="text-align: right;">-${formatCurrency(couponAmount)}</td></tr>` : ''}
            <tr><td>Shipping</td><td style="text-align: right;">${formatCurrency(shippingCost)}</td></tr>
            ${taxAmount > 0 ? `<tr><td>Tax</td><td style="text-align: right;">${formatCurrency(taxAmount)}</td></tr>` : ''}
            <tr><td class="grand-total">Refund Total</td><td class="grand-total" style="text-align: right;">${formatCurrency(total)}</td></tr>
        </table>

        <p class="section-title">Already Handled Automatically</p>
        <div class="box">
            <p style="font-size: 14px; margin: 0 0 4px 0;">&bull; Stock for every item above has been returned to inventory.</p>
            <p style="font-size: 14px; margin: 0 0 4px 0;">&bull; ${order.couponId ? 'The coupon usage has been released back to the customer.' : 'No coupon was used on this order.'}</p>
            <p style="font-size: 14px; margin: 0;">&bull; The customer has been emailed a cancellation notice.</p>
        </div>

        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/orders" class="btn-secondary">View in Admin Dashboard</a>

        <div class="footer">
            <p>Automated internal alert for order #${order.id}</p>
            <p>CocoJojoChem</p>
        </div>
    </div>
</body>
</html>`;
  }

  private buildNewOrderNotificationEmail(order: Order): string {
    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const customerName = order.user?.fullName || order.guestName || 'Guest';
    const customerEmail = order.user?.email || order.guestEmail || '—';
    const formatDate = (date: Date) =>
      new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    const itemRows = (order.items || [])
      .map((item) => {
        const unitPrice = Number(item.price);
        const lineTotal = unitPrice * item.quantity;
        return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <strong>${escapeHtml(item.productName)}</strong>${item.variantLabel ? ` — ${escapeHtml(item.variantLabel)}` : ''}
          ${item.sku ? `<br><small>SKU: ${escapeHtml(item.sku)}</small>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(unitPrice)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(lineTotal)}</td>
      </tr>`;
      })
      .join('');

    const subtotal = Number(order.subtotal);
    const shippingCost = Number(order.shippingCost);
    const taxAmount = Number(order.taxAmount);
    const couponAmount = Number(order.couponAmount);
    const total = Number(order.total);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>COCOJOJOCHEM - New Order #${order.id}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #16241c; margin: 0; padding: 0; background: #ffffff; }
        .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; }
        .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #6b7a70; margin-bottom: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 24px; color: #16241c; font-weight: 600; }
        .subhead { margin: 0 0 24px 0; color: #6b7a70; font-size: 14px; }
        .meta-table { width: 100%; font-size: 14px; }
        .meta-table td { padding: 3px 0; }
        .meta-label { color: #6b7a70; }
        .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .order-table th { border-bottom: 2px solid #16241c; padding: 8px 0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7a70; font-weight: 600; }
        .order-table td { padding: 12px 0; border-bottom: 1px solid #e5e1d8; font-size: 14px; }
        .totals-table { width: 100%; margin-top: 8px; font-size: 14px; }
        .totals-table td { padding: 5px 0; }
        .grand-total { font-weight: 700; font-size: 16px; border-top: 1px solid #16241c; padding-top: 10px !important; }
        .box { border: 1px solid #e5e1d8; padding: 16px; margin: 16px 0; font-size: 14px; }
        .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #16241c; margin: 24px 0 8px 0; }
        .btn { display: inline-block; background-color: #3a5a40; color: #ffffff !important; padding: 11px 22px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.03em; margin-top: 16px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e1d8; font-size: 12px; color: #6b7a70; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <p class="brand">CocoJojoChem</p>
        <h1>New Order Received</h1>
        <p class="subhead">Order #${order.id} was just placed and paid.</p>

        <table class="meta-table">
            <tr><td class="meta-label">Order Number</td><td style="text-align: right;">#${order.id}</td></tr>
            <tr><td class="meta-label">Order Date</td><td style="text-align: right;">${formatDate(order.createdAt)}</td></tr>
            <tr><td class="meta-label">Customer</td><td style="text-align: right;">${escapeHtml(customerName)}</td></tr>
            <tr><td class="meta-label">Email</td><td style="text-align: right;">${escapeHtml(customerEmail)}</td></tr>
        </table>

        <p class="section-title">Order Items</p>
        <table class="order-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Unit Price</th>
                    <th style="text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>${itemRows}</tbody>
        </table>

        <table class="totals-table">
            <tr><td>Subtotal</td><td style="text-align: right;">${formatCurrency(subtotal)}</td></tr>
            ${couponAmount > 0 ? `<tr><td>Discount</td><td style="text-align: right;">-${formatCurrency(couponAmount)}</td></tr>` : ''}
            <tr><td>Shipping</td><td style="text-align: right;">${shippingCost > 0 ? formatCurrency(shippingCost) : 'Free'}</td></tr>
            ${taxAmount > 0 ? `<tr><td>Tax</td><td style="text-align: right;">${formatCurrency(taxAmount)}</td></tr>` : ''}
            <tr class="grand-total"><td>Order Total</td><td style="text-align: right;">${formatCurrency(total)}</td></tr>
        </table>

        ${
          order.shippingAddress
            ? `<p class="section-title">Shipping Address</p>
        <div class="box" style="white-space: pre-line;">${escapeHtml(order.shippingAddress)}</div>`
            : ''
        }

        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/orders" class="btn">View in Admin Dashboard</a>

        <div class="footer">
            <p>This is an automated internal notification for order #${order.id}</p>
            <p>CocoJojoChem</p>
        </div>
    </div>
</body>
</html>`;
  }

  private buildShippingConfirmationEmail(order: Order): string {
    const trackingUrl = this.getTrackingUrl(order.carrierCode, order.trackingNumber);

    const itemRows = (order.items || [])
      .map(
        (item) => `
        <div class="item-row">
          <p style="margin: 0; font-weight: bold;">${escapeHtml(item.productName)}${item.variantLabel ? ` — ${escapeHtml(item.variantLabel)}` : ''}</p>
          <p style="margin: 4px 0; color: #6b7a70; font-size: 13px;">
            ${item.sku ? `SKU: ${escapeHtml(item.sku)} | ` : ''}Quantity: ${item.quantity}
          </p>
        </div>`,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Order Has Shipped — CocoJojoChem</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #16241c; margin: 0; padding: 0; background: #ffffff; }
        .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; }
        .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #6b7a70; margin-bottom: 24px; }
        h1 { margin: 0 0 4px 0; font-size: 24px; color: #16241c; font-weight: 600; }
        .subhead { margin: 0 0 24px 0; color: #6b7a70; font-size: 14px; }
        .box { border: 1px solid #e5e1d8; padding: 16px; margin: 16px 0; font-size: 14px; }
        .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #16241c; margin: 24px 0 8px 0; }
        .item-row { border-bottom: 1px solid #e5e1d8; padding: 10px 0; font-size: 14px; }
        .item-row:last-child { border-bottom: none; }
        .btn { display: inline-block; background-color: #3a5a40; color: #ffffff !important; padding: 11px 22px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.03em; margin-top: 12px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e1d8; font-size: 12px; color: #6b7a70; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <p class="brand">CocoJojoChem</p>
        <h1>Your Order Has Shipped</h1>
        <p class="subhead">Order #${order.id} is on its way to you.</p>

        ${
          order.trackingNumber
            ? `<div class="box">
              <p style="margin: 4px 0;"><strong>Tracking Number:</strong> ${escapeHtml(order.trackingNumber)}</p>
              <p style="margin: 4px 0;"><strong>Carrier:</strong> ${escapeHtml(order.carrierCode || 'Standard Shipping')}</p>
              ${
                trackingUrl
                  ? `<a href="${trackingUrl}" class="btn">Track Your Package</a>`
                  : `<a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/account/orders" class="btn">View Your Orders</a>`
              }
            </div>`
            : `<div class="box">Your package is on its way. Tracking details will be added shortly.</div>`
        }

        ${
          order.shippingAddress
            ? `<p class="section-title">Shipping Address</p>
        <div class="box" style="white-space: pre-line;">${escapeHtml(order.shippingAddress)}</div>`
            : ''
        }

        ${
          itemRows
            ? `<p class="section-title">Items Shipped</p>
        <div>${itemRows}</div>`
            : ''
        }

        <div class="footer">
            <p>Thank you for shopping with CocoJojoChem!</p>
        </div>
    </div>
</body>
</html>`;
  }

  private getTrackingUrl(carrierCode: string | null, trackingNumber: string | null): string | null {
    if (!carrierCode || !trackingNumber) return null;
    const urls: Record<string, string> = {
      ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
      usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
      dhl_express: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
      ontrac: `https://www.ontrac.com/trackres.asp?tracking_number=${trackingNumber}`,
    };
    return urls[carrierCode.toLowerCase()] || null;
  }

  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not configured — skipping password reset code email to ${email}.`);
      return;
    }

    const subject = 'Your CocoJojoChem password reset code';
    // Most desktop/mobile mail clients (Gmail, Outlook, Apple Mail) strip
    // <script> tags entirely, so this "Copy code" button silently does
    // nothing there — the code itself is still shown large and selectable,
    // so it's always manually copyable either way. It only actually
    // functions when the email is opened somewhere that keeps scripts (e.g.
    // this template's own local preview, or a "view in browser" page).
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Password Reset</title></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#16241c;margin:0;padding:0;background:#ffffff;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    <p style="font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#6b7a70;margin-bottom:24px;">CocoJojoChem</p>
    <h1 style="margin:0 0 4px 0;font-size:22px;color:#16241c;font-weight:600;">Reset your password</h1>
    <p style="color:#6b7a70;font-size:14px;margin:0 0 20px 0;">Enter this code to continue resetting your password. It expires in 10 minutes.</p>
    <p id="reset-code" style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;border:1px solid #e5e1d8;border-bottom:none;padding:16px;margin-bottom:0;">${escapeHtml(code)}</p>
    <button
      id="copy-code-btn"
      onclick="navigator.clipboard.writeText('${escapeHtml(code)}').then(function(){var b=document.getElementById('copy-code-btn');b.textContent='Copied!';setTimeout(function(){b.textContent='Copy code';},2000);});"
      style="display:block;width:100%;box-sizing:border-box;border:1px solid #e5e1d8;border-top:none;background:#f8f7f3;color:#16241c;padding:10px 16px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;"
    >Copy code</button>
    <p style="color:#6b7a70;font-size:12px;margin-top:20px;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

    await this.sendEmail(apiKey, email, subject, html);
  }

  // Sent when an admin clicks "Send Reset Link" on the admin user editor.
  // Unlike sendPasswordResetCode above there's no 5-digit code here — the URL
  // itself carries a pre-verified single-use token, so the recipient lands
  // directly on the set-password form. That makes the link a bearer
  // credential, hence the shorter copy about not forwarding it.
  // Returns whether the mail was actually handed to Brevo. Unlike the other
  // senders here this reports back rather than silently no-opping, because
  // the admin UI shows the result: telling an admin "reset link sent" when
  // the mailer is unconfigured would leave them waiting on an email that is
  // never going to arrive.
  async sendAdminPasswordResetLink(email: string, resetUrl: string, fullName?: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not configured — skipping admin password reset link email to ${email}.`);
      return false;
    }

    const subject = 'Set your CocoJojoChem password';
    const greeting = fullName ? `Hi ${escapeHtml(fullName.split(' ')[0])},` : 'Hi,';
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Set Your Password</title></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#16241c;margin:0;padding:0;background:#ffffff;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    <p style="font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#6b7a70;margin-bottom:24px;">CocoJojoChem</p>
    <h1 style="margin:0 0 4px 0;font-size:22px;color:#16241c;font-weight:600;">Set your password</h1>
    <p style="color:#6b7a70;font-size:14px;margin:0 0 8px 0;">${greeting}</p>
    <p style="color:#6b7a70;font-size:14px;margin:0 0 24px 0;">A member of our team has started a password reset for your wholesale account. Click below to choose a new password. This link expires in 24 hours and can only be used once.</p>
    <p style="margin:0 0 24px 0;">
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#16241c;color:#ffffff;text-decoration:none;padding:13px 26px;font-size:14px;font-weight:600;border-radius:4px;">Choose a new password</a>
    </p>
    <p style="color:#6b7a70;font-size:12px;margin:0 0 4px 0;">If the button doesn't work, paste this into your browser:</p>
    <p style="font-size:12px;word-break:break-all;margin:0 0 20px 0;"><a href="${escapeHtml(resetUrl)}" style="color:#16241c;">${escapeHtml(resetUrl)}</a></p>
    <p style="color:#6b7a70;font-size:12px;margin:0;">Don't forward this email — anyone with this link can set your password. If you weren't expecting this, you can safely ignore it and your password will stay unchanged.</p>
  </div>
</body>
</html>`;

    await this.sendEmail(apiKey, email, subject, html);
    return true;
  }

  private buildQuoteRequestEmail(qr: QuoteRequest): string {
    const itemRows = (qr.items || [])
      .map(
        (item) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(item.productName)}</td>` +
          `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${item.quantity ?? '—'}${item.unit ? ` ${escapeHtml(item.unit)}` : ''}</td>` +
          `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${item.notes ? escapeHtml(item.notes) : '—'}</td></tr>`,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Quote Request</title></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <h2 style="margin-bottom:4px;">New quote request — #${qr.id}</h2>
    <p style="color:#666;margin-top:0;">Type: ${escapeHtml(qr.type)}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 10px 4px 0;color:#666;">Name</td><td style="padding:4px 0;">${escapeHtml(qr.fullName)}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#666;">Email</td><td style="padding:4px 0;">${escapeHtml(qr.email)}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#666;">Phone</td><td style="padding:4px 0;">${qr.phone ? escapeHtml(qr.phone) : '—'}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#666;">Company</td><td style="padding:4px 0;">${qr.companyName ? escapeHtml(qr.companyName) : '—'}</td></tr>
    </table>
    ${
      qr.items && qr.items.length > 0
        ? `<h3 style="margin-bottom:6px;">Products requested</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead><tr style="text-align:left;color:#666;font-size:12px;text-transform:uppercase;">
        <th style="padding:6px 10px;border-bottom:2px solid #ddd;">Product</th>
        <th style="padding:6px 10px;border-bottom:2px solid #ddd;">Quantity</th>
        <th style="padding:6px 10px;border-bottom:2px solid #ddd;">Notes</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>`
        : ''
    }
    ${
      qr.message
        ? `<h3 style="margin-bottom:6px;">Message</h3><p style="white-space:pre-line;background:#f8f9fa;padding:12px;border-radius:4px;">${escapeHtml(qr.message)}</p>`
        : ''
    }
    <p style="margin-top:24px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/quote-requests"
         style="display:inline-block;padding:10px 20px;background:#3a9640;color:#fff;text-decoration:none;border-radius:4px;">
        View in admin dashboard
      </a>
    </p>
  </div>
</body>
</html>`;
  }

  private buildContactMessageEmail(message: ContactMessage): string {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Contact Message</title></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <h2 style="margin-bottom:4px;">New contact message — #${message.id}</h2>
    <p style="color:#666;margin-top:0;">Subject: ${escapeHtml(message.subject)}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 10px 4px 0;color:#666;">Name</td><td style="padding:4px 0;">${escapeHtml(message.fullName)}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#666;">Email</td><td style="padding:4px 0;">${escapeHtml(message.email)}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#666;">Phone</td><td style="padding:4px 0;">${message.phone ? escapeHtml(message.phone) : '—'}</td></tr>
    </table>
    <h3 style="margin-bottom:6px;">Message</h3>
    <p style="white-space:pre-line;background:#f8f9fa;padding:12px;border-radius:4px;">${escapeHtml(message.message)}</p>
    <p style="margin-top:24px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/messages"
         style="display:inline-block;padding:10px 20px;background:#3a9640;color:#fff;text-decoration:none;border-radius:4px;">
        View in admin dashboard
      </a>
    </p>
  </div>
</body>
</html>`;
  }

  /**
   * The single outgoing-mail path. Every send method above funnels through
   * here, so swapping providers is a change to this one function.
   *
   * Resend takes the sender as one formatted string rather than Brevo's
   * `{ name, email }` pair, so the name is quoted whenever it contains a
   * character that would break RFC 5322 display-name parsing (the name is
   * admin-editable free text in Admin Settings → Emails).
   */
  private async sendEmail(
    apiKey: string,
    to: string,
    subject: string,
    html: string,
    senderNameOverride?: string,
  ): Promise<void> {
    // DB-backed settings (editable in Admin Settings → Emails) take priority
    // over the env vars, which stay as deploy-time fallback defaults.
    const settingSenderEmail = await this.siteSettingsService.getValue('senderEmail');
    const settingSenderName = await this.siteSettingsService.getValue('senderName');
    const senderEmail = settingSenderEmail || process.env.FROM_EMAIL || 'noreply@cocojojochem.com';
    const senderName = senderNameOverride || settingSenderName || process.env.FROM_NAME || 'CocoJojoChem';

    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: `${formatSenderName(senderName)} <${senderEmail}>`,
      to: [to],
      subject,
      html,
      text: stripHtmlTags(html),
    });

    // Resend RESOLVES on an API error instead of rejecting, returning it in
    // `error`. Every caller relies on this method throwing in order to log a
    // failure, so without this re-throw a rejected send would be logged as a
    // success — the fabricated "sent" line this service promises never to write.
    if (error) {
      throw new Error(`${error.name || 'ResendError'}: ${error.message || 'unknown error'}`);
    }
  }

  /*
   * ---------------------------------------------------------------------
   * PREVIOUS PROVIDER — Brevo. Kept for reference; not called anywhere.
   * Re-enable by restoring the @getbrevo/brevo import at the top of this
   * file and pointing the callers back at this method.
   * ---------------------------------------------------------------------
   *
   * private async sendEmailWithBrevo(
   *   apiKey: string,
   *   to: string,
   *   subject: string,
   *   html: string,
   *   senderNameOverride?: string,
   * ): Promise<void> {
   *   const settingSenderEmail = await this.siteSettingsService.getValue('senderEmail');
   *   const settingSenderName = await this.siteSettingsService.getValue('senderName');
   *   const senderEmail = settingSenderEmail || process.env.FROM_EMAIL || 'noreply@cocojojochem.com';
   *   const senderName = senderNameOverride || settingSenderName || process.env.FROM_NAME || 'CocoJojoChem';
   *
   *   const apiInstance = new brevo.TransactionalEmailsApi();
   *   apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
   *
   *   const sendSmtpEmail = new brevo.SendSmtpEmail();
   *   sendSmtpEmail.sender = { name: senderName, email: senderEmail };
   *   sendSmtpEmail.to = [{ email: to }];
   *   sendSmtpEmail.subject = subject;
   *   sendSmtpEmail.htmlContent = html;
   *   sendSmtpEmail.textContent = stripHtmlTags(html);
   *
   *   await apiInstance.sendTransacEmail(sendSmtpEmail);
   * }
   */
}

// RFC 5322 display name. A plain alphanumeric name goes through bare;
// anything else is quoted so an admin-set sender name like "Acme, Inc."
// or one containing < cannot corrupt the From header.
function formatSenderName(name: string): string {
  if (/^[A-Za-z0-9 ]+$/.test(name)) {
    return name;
  }
  const escaped = name.replace(/[\\"]/g, '\\$&');
  return `"${escaped}"`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
