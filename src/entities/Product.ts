import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  OneToOne,
  JoinColumn,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Category } from './Category';
import { Function } from './Function';
import { Certification } from './Certification';
import { ProductVariant } from './ProductVariant';
import { ProductImage } from './ProductImage';
import { ProductDocument } from './ProductDocument';
import { ProductSpec } from './ProductSpec';
import { ProductSeo } from './ProductSeo';

export enum ProductVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  PASSWORD_PROTECTED = 'PASSWORD_PROTECTED',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Index({ unique: true })
  @Column({ unique: true })
  slug: string;

  @Column({ unique: true })
  sku: string;

  @Column({ type: 'varchar', nullable: true })
  inciName: string | null;

  @Column({ type: 'varchar', nullable: true })
  botanicalName: string | null;

  @Column({ type: 'varchar', nullable: true })
  casNumber: string | null;

  @Column({ type: 'text', nullable: true })
  shortDescription: string | null;

  @Column({ type: 'text', nullable: true })
  chemicalDescriptions: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column()
  categoryId: number;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @ManyToMany(() => Function, (fn) => fn.products)
  @JoinTable({
    name: 'product_functions',
    joinColumn: { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'functionId', referencedColumnName: 'id' },
  })
  functions: Function[];

  @ManyToMany(() => Certification, (cert) => cert.products)
  @JoinTable({
    name: 'product_certifications',
    joinColumn: { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'certificationId', referencedColumnName: 'id' },
  })
  certifications: Certification[];

  @OneToMany(() => ProductVariant, (variant) => variant.product, { cascade: true })
  variants: ProductVariant[];

  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true })
  gallery: ProductImage[];

  @OneToMany(() => ProductDocument, (doc) => doc.product, { cascade: true })
  documents: ProductDocument[]; // COA, SDS, TDS, spec sheets

  @OneToMany(() => ProductSpec, (spec) => spec.product, { cascade: true })
  specs: ProductSpec[];

  @OneToOne(() => ProductSeo, (seo) => seo.product)
  seo: ProductSeo;

  @Column({ default: true })
  isPublished: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ type: 'enum', enum: ProductVisibility, default: ProductVisibility.PUBLIC })
  visibility: ProductVisibility;

  @Column({ type: 'varchar', nullable: true })
  visibilityPassword: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledPublishAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  brand: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  metaTitle: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
