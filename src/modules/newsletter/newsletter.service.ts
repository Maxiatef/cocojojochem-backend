import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { NewsletterSubscriber } from '../../entities';

/** The topics a subscriber can choose. Ids match the storefront form. */
export const NEWSLETTER_INTERESTS = ['ingredients', 'formulation', 'wholesale', 'packaging'] as const;
/** Bump when the consent wording on the signup form changes. */
export const NEWSLETTER_CONSENT_VERSION = 'newsletter-2026-10-09';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const cleanInterests = (value: string[]) => NEWSLETTER_INTERESTS.filter((id) => value.includes(id));

/**
 * The storefront's "Good chemistry. In your inbox." signup.
 *
 * A signup returns a private preferences token once; only its sha256 is
 * stored. The token is the only way to read or change a signup, so nobody can
 * look up whether an address is subscribed. Signups are `subscribed` straight
 * away — the form records explicit consent, and there is no confirmation
 * email yet. Unsubscribed rows are kept so the address stays suppressed.
 */
@Injectable()
export class NewsletterService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscribersRepo: Repository<NewsletterSubscriber>,
  ) {}

  async subscribe(email: string, interests: string[], consent: boolean, website?: string) {
    const message = 'Thank you. New signups are saved; existing subscriptions keep their current preferences.';
    if (website) return { message };
    const topics = cleanInterests(interests);
    if (!topics.length) throw new BadRequestException('Choose at least one interest.');
    if (consent !== true) throw new BadRequestException('Please agree to receive the updates you selected.');

    const normalized = email.trim().toLowerCase();
    // An existing address keeps its preferences, and the response is the same
    // either way, so the form can't be used to find out who is subscribed.
    const existing = await this.subscribersRepo.findOne({ where: { email: normalized } });
    if (existing) return { message };

    const token = randomBytes(32).toString('hex');
    await this.subscribersRepo.save(
      this.subscribersRepo.create({
        email: normalized,
        interests: topics,
        status: 'subscribed',
        consentVersion: NEWSLETTER_CONSENT_VERSION,
        consentedAt: new Date(),
        tokenHash: hashToken(token),
      }),
    );
    return { message, token };
  }

  async read(token: string) {
    const row = await this.byToken(token);
    return { email: row.email, interests: row.interests, status: row.status };
  }

  async updatePreferences(token: string, interests: string[], consent?: boolean) {
    const row = await this.byToken(token);
    const topics = cleanInterests(interests);
    if (!topics.length) throw new BadRequestException('Choose at least one interest, or unsubscribe from all updates.');
    const restoring = row.status === 'unsubscribed';
    if (restoring && consent !== true)
      throw new BadRequestException('Please agree to receive updates again before resubscribing.');
    row.interests = topics;
    if (restoring) {
      row.status = 'subscribed';
      row.consentVersion = NEWSLETTER_CONSENT_VERSION;
      row.consentedAt = new Date();
    }
    await this.subscribersRepo.save(row);
    return {
      status: row.status,
      message: restoring ? 'Your signup has been restored.' : 'Your interests have been saved.',
    };
  }

  async unsubscribe(token: string) {
    const row = await this.byToken(token);
    row.status = 'unsubscribed';
    await this.subscribersRepo.save(row);
    return { status: row.status, message: 'You are unsubscribed from all COCOJOJO email updates.' };
  }

  private async byToken(token: string) {
    const row = await this.subscribersRepo.findOne({ where: { tokenHash: hashToken(token) } });
    if (!row) throw new NotFoundException('This preferences link is not valid. Contact us if you need help.');
    return row;
  }
}
