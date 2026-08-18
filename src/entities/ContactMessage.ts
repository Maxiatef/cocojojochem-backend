import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ContactMessageStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  ARCHIVED = 'ARCHIVED',
}

@Entity('contact_messages')
export class ContactMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fullName: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: ContactMessageStatus, default: ContactMessageStatus.UNREAD })
  status: ContactMessageStatus;

  // Set when an admin marks this handled via a reply sent outside the app
  // (mailto: link) — there's no way for us to detect a real email was sent,
  // so this is a manual "I replied" flag, not a delivery confirmation.
  @Column({ type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
