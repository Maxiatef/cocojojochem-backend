import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('testimonials')
export class Testimonial {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  authorName: string;

  @Column({ type: 'varchar', nullable: true })
  company: string | null;

  @Column({ type: 'text' })
  quote: string;

  @Column({ type: 'varchar', nullable: true })
  result: string | null; // "300% operational scaling"

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column({ default: true })
  isPublished: boolean;

  @Column({ default: 0 })
  sortOrder: number;
}
