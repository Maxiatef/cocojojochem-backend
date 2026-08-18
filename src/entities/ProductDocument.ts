import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';

export enum DocType {
  COA = 'COA',
  SDS = 'SDS',
  TDS = 'TDS',
  SPEC_SHEET = 'SPEC_SHEET',
  OTHER = 'OTHER',
}

@Entity('product_documents')
export class ProductDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productId: number;

  @ManyToOne(() => Product, (product) => product.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'enum', enum: DocType })
  type: DocType;

  @Column()
  url: string;

  @Column({ type: 'varchar', nullable: true })
  label: string | null;
}
