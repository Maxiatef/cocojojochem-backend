import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { Team, User, UserStatus } from '../../entities';
import { AuditLogService } from '../audit-log/audit-log.service';
import { QueryAuditLogsDto } from '../audit-log/dto/query-audit-logs.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamReportDto } from './dto/team-report.dto';
import { MyTeamActivityDto } from './dto/my-team-query.dto';

/** Default report window when the caller gives no dates. */
const DEFAULT_REPORT_DAYS = 30;

export interface TeamMemberSummary {
  id: string;
  fullName: string;
  email: string;
  roleName: string | null;
  status: UserStatus;
  actionCount: number;
  lastActiveAt: Date | null;
}

@Injectable()
export class TeamsService {
  private readonly logger = new Logger('Teams');

  constructor(
    @InjectRepository(Team)
    private readonly teamsRepo: Repository<Team>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly auditLog: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------ admin CRUD

  /** Every team, with its manager and a member count. */
  async findAll() {
    const teams = await this.teamsRepo.find({
      relations: ['manager'],
      order: { name: 'ASC' },
    });

    // One grouped count rather than N queries, or a GROUP BY that would have
    // to fight the relation join above.
    const counts = await this.usersRepo
      .createQueryBuilder('user')
      .select('user.teamId', 'teamId')
      .addSelect('COUNT(*)', 'count')
      .where('user.teamId IS NOT NULL')
      .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
      .groupBy('user.teamId')
      .getRawMany<{ teamId: string; count: string }>();

    const byTeam = new Map(counts.map((c) => [String(c.teamId), Number(c.count)]));

    return teams.map((team) => ({
      ...this.stripManager(team),
      memberCount: byTeam.get(team.id) ?? 0,
    }));
  }

  /** Picker data only — see TeamsController.getOptions for why it is this thin. */
  findOptions(): Promise<Pick<Team, 'id' | 'name'>[]> {
    return this.teamsRepo.find({ select: ['id', 'name'], order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const team = await this.teamsRepo.findOne({ where: { id }, relations: ['manager'] });
    if (!team) throw new NotFoundException(`Team #${id} not found`);

    const members = await this.usersRepo.find({
      where: { teamId: id, status: UserStatus.ACTIVE },
      relations: ['role'],
      order: { fullName: 'ASC' },
    });

    return {
      ...this.stripManager(team),
      members: members.map((m) => this.stripMember(m)),
      memberCount: members.length,
    };
  }

  async create(dto: CreateTeamDto) {
    await this.assertNameFree(dto.name);
    if (dto.managerId != null) await this.assertIsStaff(dto.managerId, 'manager');

    const team = await this.teamsRepo.save(
      this.teamsRepo.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        managerId: dto.managerId ?? null,
      }),
    );

    if (dto.memberIds?.length) await this.setMembers(team.id, dto.memberIds);

    this.logger.log(`Team "${team.name}" (#${team.id}) created`);
    return this.findOne(team.id);
  }

  async update(id: string, dto: UpdateTeamDto) {
    const team = await this.teamsRepo.findOne({ where: { id } });
    if (!team) throw new NotFoundException(`Team #${id} not found`);

    if (dto.name !== undefined && dto.name.trim() !== team.name) {
      await this.assertNameFree(dto.name, id);
      team.name = dto.name.trim();
    }
    if (dto.description !== undefined) team.description = dto.description?.trim() || null;
    if (dto.managerId !== undefined) {
      if (dto.managerId != null) await this.assertIsStaff(dto.managerId, 'manager');
      team.managerId = dto.managerId;
    }

    // save(), never update(): the audit subscriber only sees a loaded entity,
    // so an .update() here would silently record nothing.
    await this.teamsRepo.save(team);

    if (dto.memberIds !== undefined) await this.setMembers(id, dto.memberIds);

    return this.findOne(id);
  }

  async delete(id: string) {
    const team = await this.teamsRepo.findOne({ where: { id } });
    if (!team) throw new NotFoundException(`Team #${id} not found`);

    // The FK is ON DELETE SET NULL, so Postgres would empty the team for us.
    // Doing it explicitly first means the write goes through save() and lands
    // in the audit log, instead of being an invisible side effect of the
    // delete — "who took these five people out of their team" is exactly the
    // kind of question this whole feature exists to answer.
    const members = await this.usersRepo.find({ where: { teamId: id } });
    if (members.length) {
      await this.usersRepo.save(members.map((m) => Object.assign(m, { teamId: null })));
    }

    await this.teamsRepo.remove(team);
    this.logger.log(`Team "${team.name}" (#${id}) deleted; ${members.length} member(s) unassigned`);
    return { success: true, unassignedMembers: members.length };
  }

  /**
   * Replaces a team's roster with exactly `memberIds`.
   *
   * Replace rather than add/remove because the admin UI edits a checklist: it
   * knows the intended final state, and sending that is atomic. A delta API
   * would let two concurrent editors produce a roster neither of them chose.
   */
  async setMembers(teamId: string, memberIds: string[]) {
    const team = await this.teamsRepo.findOne({ where: { id: teamId } });
    if (!team) throw new NotFoundException(`Team #${teamId} not found`);

    const wanted = [...new Set(memberIds)];

    if (wanted.length) {
      const found = await this.usersRepo.find({
        where: { id: In(wanted) },
        select: ['id', 'roleId'],
      });
      if (found.length !== wanted.length) {
        throw new BadRequestException('One or more selected users no longer exist.');
      }
      // A customer in a staff team would quietly appear in the manager's
      // activity view and never have any activity to show. Refuse it here
      // rather than letting it look like a bug later.
      const customers = found.filter((u) => u.roleId == null);
      if (customers.length) {
        throw new BadRequestException(
          'Only staff accounts can join a team. Give the user a role first.',
        );
      }
    }

    const current = await this.usersRepo.find({ where: { teamId }, select: ['id'] });
    const currentIds = current.map((u) => u.id);

    const toAdd = wanted.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !wanted.includes(id));

    // Each side is loaded and saved, so both directions produce audit rows.
    if (toRemove.length) {
      const rows = await this.usersRepo.find({ where: { id: In(toRemove) } });
      await this.usersRepo.save(rows.map((u) => Object.assign(u, { teamId: null })));
    }
    if (toAdd.length) {
      const rows = await this.usersRepo.find({ where: { id: In(toAdd) } });
      await this.usersRepo.save(rows.map((u) => Object.assign(u, { teamId })));
    }

    return { added: toAdd.length, removed: toRemove.length };
  }

  /** Staff who can be put in a team — i.e. everyone holding any role. */
  async assignableStaff() {
    const staff = await this.usersRepo.find({
      where: { roleId: Not(IsNull()), status: UserStatus.ACTIVE },
      relations: ['role', 'team'],
      order: { fullName: 'ASC' },
    });

    // Which teams each person already manages. A list rather than a boolean
    // because the manager picker shows it back: naming someone to a second
    // team is allowed, but it should be a decision, not a silent side effect.
    const managed = await this.teamsRepo.find({
      where: { managerId: Not(IsNull()) },
      select: ['id', 'name', 'managerId'],
      order: { name: 'ASC' },
    });
    const managedBy = new Map<string, { id: string; name: string }[]>();
    for (const t of managed) {
      const list = managedBy.get(t.managerId!) ?? [];
      list.push({ id: t.id, name: t.name });
      managedBy.set(t.managerId!, list);
    }

    return staff.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      roleName: u.role?.name ?? null,
      teamId: u.teamId,
      teamName: u.team?.name ?? null,
      // Being named a manager grants nothing on its own — the role's
      // permissions do. Someone with neither of these would be handed a team
      // they cannot open, so the manager picker offers only the accounts for
      // which the assignment actually means something.
      canManageTeam:
        u.role?.permissions?.canViewOwnTeam === true ||
        u.role?.permissions?.canManageOwnTeam === true,
      managesTeams: managedBy.get(u.id) ?? [],
    }));
  }

  // -------------------------------------------------------- manager-facing

  /**
   * The team this user manages.
   *
   * Resolved from `teams.managerId`, never from anything the caller sends —
   * this is the single point that makes it impossible for a manager to read
   * another team by changing an id in a URL. Every manager-facing route goes
   * through it.
   */
  async resolveManagedTeam(userId: string, teamId?: string): Promise<Team> {
    // `managerId: userId` is in the where clause whether or not a teamId was
    // supplied, and that is the entire security model. A manager passing
    // someone else's team id matches no row and gets a 403 — the id narrows
    // the search, it never widens it.
    //
    // Omitted, it falls back to their first team by name, which is what a
    // manager of exactly one team always gets. Ordering matters only for
    // someone over several teams opening the page with no selection yet: they
    // land on the same one every time rather than on whatever the planner
    // returned first.
    const team = await this.teamsRepo.findOne({
      where: teamId ? { id: teamId, managerId: userId } : { managerId: userId },
      relations: ['manager'],
      order: { name: 'ASC' },
    });
    if (!team) {
      throw new ForbiddenException(
        teamId
          ? 'You are not the manager of that team.'
          : 'You are not the manager of a team.',
      );
    }
    return team;
  }

  /**
   * The team this user may LOOK AT: the one they manage, or failing that, the
   * one they are in.
   *
   * Deliberately separate from resolveManagedTeam, which stays manager-only
   * and still guards activity, the report and every roster write. A member
   * gets the roster and nothing else, so the two resolvers must not be merged
   * — the difference between them is the whole of the member/manager split.
   *
   * Both branches pin the lookup to this user: a managed team by
   * `managerId`, their own team by the `teamId` on their row. A `teamId`
   * argument can only ever select between those, never reach outside them.
   */
  async resolveViewableTeam(
    userId: string,
    teamId?: string,
  ): Promise<{ team: Team; viewerRole: 'MANAGER' | 'MEMBER' }> {
    const managed = await this.teamsRepo.findOne({
      where: teamId ? { id: teamId, managerId: userId } : { managerId: userId },
      relations: ['manager'],
      order: { name: 'ASC' },
    });
    if (managed) return { team: managed, viewerRole: 'MANAGER' };

    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'teamId'],
    });
    if (user?.teamId && (!teamId || teamId === user.teamId)) {
      const own = await this.teamsRepo.findOne({
        where: { id: user.teamId },
        relations: ['manager'],
      });
      if (own) return { team: own, viewerRole: 'MEMBER' };
    }

    throw new ForbiddenException(
      teamId
        ? 'You are not the manager or a member of that team.'
        : 'You are not in a team yet.',
    );
  }

  /**
   * Every team this person manages — the data behind the team switcher.
   *
   * Returns `[]` rather than throwing, unlike resolveManagedTeam: "you manage
   * nothing" is a fine answer to "what do you manage", and the page renders
   * its own explanation for it.
   */
  async myTeams(userId: string) {
    let teams = await this.teamsRepo.find({
      where: { managerId: userId },
      select: ['id', 'name', 'description'],
      order: { name: 'ASC' },
    });

    // A member manages nothing but is still in one team, and the page needs a
    // name for it. Managers who are also a member of some other team keep
    // their managed list only — mixing the two would put a team they cannot
    // act on into the same switcher as the ones they can.
    if (teams.length === 0) {
      const user = await this.usersRepo.findOne({
        where: { id: userId },
        select: ['id', 'teamId'],
      });
      teams = user?.teamId
        ? await this.teamsRepo.find({
            where: { id: user.teamId },
            select: ['id', 'name', 'description'],
          })
        : [];
    }

    if (teams.length === 0) return [];

    const counts = await this.usersRepo
      .createQueryBuilder('user')
      .select('user.teamId', 'teamId')
      .addSelect('COUNT(*)', 'count')
      .where('user.teamId IN (:...ids)', { ids: teams.map((t) => t.id) })
      .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
      .groupBy('user.teamId')
      .getRawMany<{ teamId: string; count: string }>();
    const byTeam = new Map(counts.map((c) => [String(c.teamId), Number(c.count)]));

    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      memberCount: byTeam.get(t.id) ?? 0,
    }));
  }

  /** Active member ids of a team. `[]` for an empty team — never "everyone". */
  async memberIdsOf(teamId: string): Promise<string[]> {
    const rows = await this.usersRepo.find({
      where: { teamId, status: UserStatus.ACTIVE },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  /**
   * A manager's landing view: the team, its members, and how active each
   * member has been.
   */
  async myTeam(userId: string, teamId?: string) {
    const { team, viewerRole } = await this.resolveViewableTeam(userId, teamId);
    // A member sees who is on the team and who runs it. They do not see how
    // many actions each colleague has recorded or when each was last active —
    // that is the manager's report, and handing it to everyone on the team
    // turns a reporting tool into peer surveillance.
    return {
      ...(await this.teamOverview(team, viewerRole === 'MANAGER')),
      viewerRole,
    };
  }

  /**
   * The team's activity feed.
   *
   * Every kind of record, not only ones "belonging" to the team: a manager
   * needs to see that a member edited a product or a coupon just as much as an
   * order. Scope comes from *who acted*, never from what they acted on.
   */
  async myTeamActivity(userId: string, query: MyTeamActivityDto) {
    const team = await this.resolveManagedTeam(userId, query.teamId);
    const memberIds = await this.memberIdsOf(team.id);
    return this.auditLog.findAll(query, memberIds);
  }

  async myTeamReport(userId: string, dto: TeamReportDto) {
    const team = await this.resolveManagedTeam(userId, dto.teamId);
    return this.buildReport(team, dto);
  }

  /** Lets a manager edit their own roster without granting canManageTeams. */
  async setOwnTeamMembers(userId: string, memberIds: string[], teamId?: string) {
    const team = await this.resolveManagedTeam(userId, teamId);
    return this.setMembers(team.id, memberIds);
  }

  // --------------------------------------------- admin views of any team

  async teamOverviewById(teamId: string) {
    const team = await this.teamsRepo.findOne({ where: { id: teamId }, relations: ['manager'] });
    if (!team) throw new NotFoundException(`Team #${teamId} not found`);
    return this.teamOverview(team);
  }

  async teamReport(teamId: string, dto: TeamReportDto) {
    const team = await this.teamsRepo.findOne({ where: { id: teamId }, relations: ['manager'] });
    if (!team) throw new NotFoundException(`Team #${teamId} not found`);
    return this.buildReport(team, dto);
  }

  async teamActivity(teamId: string, query: QueryAuditLogsDto) {
    const team = await this.teamsRepo.findOne({ where: { id: teamId }, select: ['id'] });
    if (!team) throw new NotFoundException(`Team #${teamId} not found`);
    const memberIds = await this.memberIdsOf(teamId);
    return this.auditLog.findAll(query, memberIds);
  }

  // ------------------------------------------------------------ internals

  private async teamOverview(team: Team, includeActivity = true) {
    const members = await this.usersRepo.find({
      where: { teamId: team.id, status: UserStatus.ACTIVE },
      relations: ['role'],
      order: { fullName: 'ASC' },
    });

    // Not merely hidden in the response — the query is not run at all, so the
    // numbers never leave the database on a member's request.
    const activity = includeActivity
      ? await this.activityTotals(members.map((m) => m.id))
      : new Map<string, { count: number; lastActiveAt: Date | null }>();

    const summaries: TeamMemberSummary[] = members.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      roleName: m.role?.name ?? null,
      status: m.status,
      actionCount: activity.get(m.id)?.count ?? 0,
      lastActiveAt: activity.get(m.id)?.lastActiveAt ?? null,
    }));

    return {
      team: this.stripManager(team),
      members: summaries,
      memberCount: summaries.length,
      totalActions: summaries.reduce((sum, m) => sum + m.actionCount, 0),
    };
  }

  private async buildReport(team: Team, dto: TeamReportDto) {
    const { from, to } = this.resolveWindow(dto);

    const members = await this.usersRepo.find({
      where: { teamId: team.id, status: UserStatus.ACTIVE },
      relations: ['role'],
      order: { fullName: 'ASC' },
    });
    const memberIds = members.map((m) => m.id);

    // An empty team is a valid state with a valid answer: zeroes. Returning
    // early also keeps `= ANY($1::uuid[])` from being handed an empty array.
    if (memberIds.length === 0) {
      return {
        team: this.stripManager(team),
        range: { from, to },
        members: [],
        totals: { actions: 0, orders: 0, revenue: 0, byAction: {}, byEntity: {} },
        daily: [],
      };
    }

    const [byAction, byEntity, orders, daily] = await Promise.all([
      this.dataSource.query(
        `SELECT a."actorId" AS "actorId", a.action::text AS action, COUNT(*)::int AS count
           FROM audit_logs a
          WHERE a."actorId" = ANY($1::uuid[]) AND a."occurredAt" >= $2 AND a."occurredAt" <= $3
          GROUP BY 1, 2`,
        [memberIds, from, to],
      ) as Promise<{ actorId: string; action: string; count: number }[]>,

      this.dataSource.query(
        `SELECT a."actorId" AS "actorId", a."entityName" AS "entityName", COUNT(*)::int AS count
           FROM audit_logs a
          WHERE a."actorId" = ANY($1::uuid[]) AND a."occurredAt" >= $2 AND a."occurredAt" <= $3
          GROUP BY 1, 2`,
        [memberIds, from, to],
      ) as Promise<{ actorId: string; entityName: string; count: number }[]>,

      // Orders a member touched, and what those orders are worth.
      //
      // Derived from the audit log rather than from a "handled by" column on
      // `orders`, because the log already records every staff action and works
      // retroactively — a new column would read zero until someone touched
      // each order again. DISTINCT in a subquery, not SUM(DISTINCT), so an
      // order touched three times counts its value once.
      //
      // The regex guard matters: entityId is varchar (it has to hold the
      // composite keys other tables use), so it cannot be cast blindly.
      this.dataSource.query(
        `SELECT t."actorId" AS "actorId",
                COUNT(*)::int AS "orderCount",
                COALESCE(SUM(o.total), 0)::float AS revenue
           FROM (
                 SELECT DISTINCT a."actorId", a."entityId"
                   FROM audit_logs a
                  WHERE a."entityName" = 'Order'
                    AND a."actorId" = ANY($1::uuid[])
                    AND a."occurredAt" >= $2 AND a."occurredAt" <= $3
                    AND a."entityId" ~ '^[0-9a-fA-F-]{36}$'
                ) t
           JOIN orders o ON o.id = t."entityId"::uuid
          GROUP BY 1`,
        [memberIds, from, to],
      ) as Promise<{ actorId: string; orderCount: number; revenue: number }[]>,

      // Day buckets follow the database's timezone, matching how the existing
      // analytics module groups. The site timezone setting is applied when
      // these are rendered, not here.
      this.dataSource.query(
        `SELECT DATE_TRUNC('day', a."occurredAt") AS day, COUNT(*)::int AS count
           FROM audit_logs a
          WHERE a."actorId" = ANY($1::uuid[]) AND a."occurredAt" >= $2 AND a."occurredAt" <= $3
          GROUP BY 1 ORDER BY 1 ASC`,
        [memberIds, from, to],
      ) as Promise<{ day: Date; count: number }[]>,
    ]);

    const actionsByMember = new Map<string, Record<string, number>>();
    const entitiesByMember = new Map<string, Record<string, number>>();
    const totalsByAction: Record<string, number> = {};
    const totalsByEntity: Record<string, number> = {};

    for (const row of byAction) {
      const id = String(row.actorId);
      const bucket = actionsByMember.get(id) ?? {};
      bucket[row.action] = (bucket[row.action] ?? 0) + Number(row.count);
      actionsByMember.set(id, bucket);
      totalsByAction[row.action] = (totalsByAction[row.action] ?? 0) + Number(row.count);
    }
    for (const row of byEntity) {
      const id = String(row.actorId);
      const bucket = entitiesByMember.get(id) ?? {};
      bucket[row.entityName] = (bucket[row.entityName] ?? 0) + Number(row.count);
      entitiesByMember.set(id, bucket);
      totalsByEntity[row.entityName] = (totalsByEntity[row.entityName] ?? 0) + Number(row.count);
    }

    const ordersByMember = new Map(orders.map((o) => [String(o.actorId), o]));

    const memberRows = members.map((m) => {
      const actions = actionsByMember.get(m.id) ?? {};
      const order = ordersByMember.get(m.id);
      return {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        roleName: m.role?.name ?? null,
        actions: Object.values(actions).reduce((a, b) => a + b, 0),
        byAction: actions,
        byEntity: entitiesByMember.get(m.id) ?? {},
        orders: Number(order?.orderCount ?? 0),
        revenue: Number(order?.revenue ?? 0),
      };
    });

    return {
      team: this.stripManager(team),
      range: { from, to },
      members: memberRows,
      totals: {
        actions: memberRows.reduce((s, m) => s + m.actions, 0),
        orders: memberRows.reduce((s, m) => s + m.orders, 0),
        revenue: memberRows.reduce((s, m) => s + m.revenue, 0),
        byAction: totalsByAction,
        byEntity: totalsByEntity,
      },
      daily: daily.map((d) => ({ day: d.day, count: Number(d.count) })),
    };
  }

  /** Total actions and last-seen per member, for the team overview. */
  private async activityTotals(memberIds: string[]) {
    const map = new Map<string, { count: number; lastActiveAt: Date }>();
    if (memberIds.length === 0) return map;

    const rows: { actorId: string; count: number; lastActiveAt: Date }[] =
      await this.dataSource.query(
        `SELECT a."actorId" AS "actorId",
                COUNT(*)::int AS count,
                MAX(a."occurredAt") AS "lastActiveAt"
           FROM audit_logs a
          WHERE a."actorId" = ANY($1::uuid[])
          GROUP BY 1`,
        [memberIds],
      );

    for (const row of rows) {
      map.set(String(row.actorId), { count: Number(row.count), lastActiveAt: row.lastActiveAt });
    }
    return map;
  }

  private resolveWindow(dto: TeamReportDto) {
    const parse = (value: string | undefined, fallback: Date) => {
      if (!value) return fallback;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? fallback : parsed;
    };
    const to = parse(dto.to, new Date());
    const from = parse(dto.from, new Date(to.getTime() - DEFAULT_REPORT_DAYS * 86_400_000));
    // A reversed range returns nothing at all, which reads as "no activity"
    // rather than as the bad input it is. Swap instead.
    return from > to ? { from: to, to: from } : { from, to };
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const existing = await this.teamsRepo.findOne({ where: { name: name.trim() } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`A team named "${name.trim()}" already exists.`);
    }
  }

  private async assertIsStaff(userId: string, what: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId }, select: ['id', 'roleId'] });
    if (!user) throw new BadRequestException(`The selected ${what} no longer exists.`);
    if (user.roleId == null) {
      throw new BadRequestException(`A team ${what} must be a staff account with a role.`);
    }
  }

  /** The manager is a full User row; only the display fields should travel. */
  private stripManager(team: Team) {
    const { manager, members, ...rest } = team;
    return {
      ...rest,
      manager: manager
        ? { id: manager.id, fullName: manager.fullName, email: manager.email }
        : null,
    };
  }

  private stripMember(user: User) {
    const { passwordHash, ...rest } = user;
    return { ...rest, roleName: user.role?.name ?? null };
  }
}
