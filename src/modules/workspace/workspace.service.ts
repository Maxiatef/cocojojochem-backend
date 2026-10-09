import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerWorkspace, WorkspaceItem, WorkspaceProject } from '../../entities';

const COMPARE_LIMIT = 7;
const PROJECT_LIMIT = 100;
const SAVED_REFERENCE_LIMIT = 200;

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(CustomerWorkspace)
    private readonly repo: Repository<CustomerWorkspace>,
  ) {}

  async get(userId: string) {
    const row = await this.repo.findOne({ where: { userId } });
    return {
      compare: row?.compare ?? [],
      projects: row?.projects ?? [],
      savedReferences: row?.savedReferences ?? [],
    };
  }

  async saveCompare(userId: string, items: WorkspaceItem[]) {
    await this.repo.upsert({ userId, compare: dedupe(items).slice(0, COMPARE_LIMIT) }, ['userId']);
    return this.get(userId);
  }

  async saveProjects(userId: string, projects: WorkspaceProject[]) {
    await this.repo.upsert({ userId, projects: projects.slice(0, PROJECT_LIMIT) }, ['userId']);
    return this.get(userId);
  }

  async saveSavedReferences(userId: string, items: WorkspaceItem[]) {
    await this.repo.upsert({ userId, savedReferences: dedupe(items).slice(0, SAVED_REFERENCE_LIMIT) }, ['userId']);
    return this.get(userId);
  }

  // Sign-in: fold a guest's browser copy into the account. Comparison items
  // and saved references are unioned up to their limits, account first; projects are matched by id,
  // and the more recently edited copy of the same project wins.
  async merge(
    userId: string,
    compare: WorkspaceItem[] = [],
    projects: WorkspaceProject[] = [],
    savedReferences: WorkspaceItem[] = [],
  ) {
    const current = await this.get(userId);
    const mergedCompare = dedupe([...current.compare, ...compare]).slice(0, COMPARE_LIMIT);

    const byId = new Map(current.projects.map((p) => [p.id, p]));
    for (const p of projects) {
      const existing = byId.get(p.id);
      if (!existing || p.updatedAt > existing.updatedAt) byId.set(p.id, p);
    }
    const mergedProjects = [...byId.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, PROJECT_LIMIT);

    // Saved references: a union, account first, like the wishlist merge.
    const mergedReferences = dedupe([...current.savedReferences, ...savedReferences]).slice(0, SAVED_REFERENCE_LIMIT);

    await this.repo.upsert(
      { userId, compare: mergedCompare, projects: mergedProjects, savedReferences: mergedReferences },
      ['userId'],
    );
    return this.get(userId);
  }
}

function dedupe(items: WorkspaceItem[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.slug)) return false;
    seen.add(i.slug);
    return true;
  });
}
