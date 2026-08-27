import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

// Stores only the SHA-256 hash of the raw refresh token, never the raw value
// itself. Lookups on refresh happen by tokenHash, so it carries a UNIQUE
// index for fast, exact-match retrieval (sub-millisecond) — deliberately not
// hashed with bcrypt, which is the wrong tool for a 256-bit random token and
// would add ~100ms to every refresh call for no security benefit.
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
