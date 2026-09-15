import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToMany } from 'typeorm';
import { Product } from './Product';

@Entity('functions')
export class Function {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // e.g. "Anti-Aging", "Antioxidant", "Humectant"

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Nullable because rows predating this column have no honest value to show
  // — see migration 1788500200000.
  @CreateDateColumn({ type: 'timestamptz', nullable: true })
  createdAt: Date | null;

  @ManyToMany(() => Product, (product) => product.functions)
  products: Product[];
}
