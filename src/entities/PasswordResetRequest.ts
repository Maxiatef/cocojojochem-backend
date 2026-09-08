import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

// A customer's "forgot password" attempt: a 5-digit code is emailed and its
// hash stored here (never the raw code). Once the customer enters the
// correct code, `verifiedTokenHash` is set to a separate, high-entropy,
// single-use token — the frontend carries THAT (not the code) into the final
// set-new-password step, so the 5-digit code is only ever usable once.
@Entity('password_reset_requests')
export class PasswordResetRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  verifiedTokenHash: string | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  // True for rows minted by an admin's "Send Reset Link" action rather than
  // by a customer's own forgot-password request. Those rows are created
  // ALREADY code-verified (`verifiedTokenHash` pre-set, `codeHash` set to an
  // unmatchable value) so the emailed link skips the 5-digit step entirely,
  // and they carry a much longer lifetime — see the expiry handling in
  // AuthService.resetPassword, which relies on this flag to know it must not
  // apply the short code-flow timing window.
  @Column({ type: 'boolean', default: false })
  adminInitiated: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
