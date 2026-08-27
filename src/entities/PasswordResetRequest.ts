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

  @CreateDateColumn()
  createdAt: Date;
}
