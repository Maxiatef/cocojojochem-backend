import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export interface WorkspaceItem {
  slug: string;
  name: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  notes: string;
  items: WorkspaceItem[];
  createdAt: string;
  updatedAt: string;
}

// A signed-in customer's comparison list, formulation projects and saved
// supplier references, so they
// follow the account across devices. Guests keep both in localStorage
// (src/lib/gloss/stores.ts in the frontend) and merge them in on sign-in.
//
// One row per customer with jsonb columns rather than child tables: the
// client always reads and writes the whole list, nothing queries inside it,
// and items point at products by slug exactly as the guest copy does.
@Entity('customer_workspaces')
export class CustomerWorkspace {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  compare: WorkspaceItem[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  projects: WorkspaceProject[];

  // Wishlist entries for supplier-reference materials (slug + name). The
  // account wishlist is keyed by catalog product id, which references lack.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  savedReferences: WorkspaceItem[];

  @UpdateDateColumn()
  updatedAt: Date;
}
