import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum SeoIssueType {
  MISSING_TITLE = 'MISSING_TITLE',
  MISSING_META_DESCRIPTION = 'MISSING_META_DESCRIPTION',
  MISSING_H1 = 'MISSING_H1',
  MULTIPLE_H1 = 'MULTIPLE_H1',
  THIN_CONTENT = 'THIN_CONTENT',
  MISSING_ALT_TEXT = 'MISSING_ALT_TEXT',
}

export enum SeoIssueSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

@Entity('seo_issues')
export class SeoIssue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  path: string;

  @Column({ type: 'enum', enum: SeoIssueType })
  issueType: SeoIssueType;

  @Column({ type: 'enum', enum: SeoIssueSeverity })
  severity: SeoIssueSeverity;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'boolean', default: false })
  isFixed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
