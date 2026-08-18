import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
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

  @ManyToMany(() => Product, (product) => product.functions)
  products: Product[];
}
