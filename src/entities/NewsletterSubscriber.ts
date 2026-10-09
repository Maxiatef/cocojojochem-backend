import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type NewsletterStatus = 'pending' | 'subscribed' | 'unsubscribed';

/**
 * An email signup from the storefront's "Good chemistry. In your inbox." form.
 *
 * - interests: the topics the subscriber chose (see NEWSLETTER_INTERESTS).
 * - status: pending (signed up, not yet confirmed), subscribed, unsubscribed.
 *   Unsubscribed rows are kept so the address stays suppressed.
 * - consentVersion / consentedAt: which consent wording they agreed to, and when.
 * - tokenHash: sha256 of the private preferences token. The token itself is
 *   only ever returned once (signup response + confirmation email).
 */
@Entity('newsletter_subscribers')
export class NewsletterSubscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  interests: string[];

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: NewsletterStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  consentVersion: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  consentedAt: Date | null;

  @Index('UQ_newsletter_subscribers_tokenHash', { unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  tokenHash: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updatedAt: Date;
}
