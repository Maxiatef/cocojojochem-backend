import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Product } from './Product';

@Entity('certifications')
export class Certification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string; // USDA Organic, GMP, cGMP Compliant, Non-GMO, Cruelty-Free

  @Column({ type: 'varchar', nullable: true })
  iconUrl: string | null;

  @ManyToMany(() => Product, (product) => product.certifications)
  products: Product[];
}
