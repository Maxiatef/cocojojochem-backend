import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('site_settings')
export class SiteSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
