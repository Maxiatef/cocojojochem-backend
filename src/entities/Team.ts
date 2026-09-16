import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './User';

/**
 * A group of staff accounts with one manager over them.
 *
 * Deliberately one level deep: a team has members and a manager, and a manager
 * is simply a user whose id sits in `managerId`. There is no second role
 * hierarchy and no parent team. Nesting would double the cost of every scoped
 * query (each one becomes a recursive CTE) to serve a shape the business does
 * not have yet.
 *
 * What a manager may actually do is decided by their role's permissions
 * (`canViewOwnTeam` / `canManageOwnTeam`), not by this table. Membership only
 * answers *which* people they see.
 */
@Entity('teams')
export class Team {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ON DELETE SET NULL, not CASCADE: removing a manager's account must leave
  // the team and its members intact, waiting for a new manager, rather than
  // silently deleting the team and orphaning everyone in it.
  @Column({ type: 'int', nullable: true })
  managerId: number | null;

  @ManyToOne(() => User, (user) => user.managedTeams, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerId' })
  manager: User | null;

  @OneToMany(() => User, (user) => user.team)
  members: User[];

  @CreateDateColumn()
  createdAt: Date;
}
