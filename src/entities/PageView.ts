import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

// One row per storefront page load. visitorId is a random id the frontend
// generates once and persists in localStorage — not tied to a real identity,
// just enough to de-duplicate "unique visitors" from raw page-view counts.
// Admin pages are never tracked (the tracker only mounts in the storefront
// layout), so this never counts staff/admin activity as site traffic.
@Entity('page_views')
export class PageView {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  path: string;

  @Index()
  @Column()
  visitorId: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
