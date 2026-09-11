import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';
import { Certification } from './Certification';

export enum DocType {
  COA = 'COA',
  SDS = 'SDS',
  TDS = 'TDS',
  SPEC_SHEET = 'SPEC_SHEET',
  // The file IS one of the product's certifications; `certificationId` says
  // which. Kept as its own kind rather than overloading OTHER, so the
  // storefront can link a certification badge straight to its proof.
  CERTIFICATE = 'CERTIFICATE',
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

  // Set only when type is CERTIFICATE. ON DELETE SET NULL rather than CASCADE:
  // deleting a certification from the catalogue must not silently delete the
  // PDF proving a product held it — the file just stops being linked.
  @Column({ type: 'int', nullable: true })
  certificationId: number | null;

  @ManyToOne(() => Certification, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'certificationId' })
  certification: Certification | null;
}
