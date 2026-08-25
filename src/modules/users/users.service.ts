import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Order, User, UserRole } from '../../entities';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
  ) {}

  findByEmail(email: string) {
    return this.usersRepo.findOne({ where: { email }, relations: ['company'] });
  }

  async findById(id: number) {
    const user = await this.usersRepo.findOne({ where: { id }, relations: ['company'] });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  create(data: Partial<User>) {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async updateProfile(id: number, data: Partial<Pick<User, 'fullName' | 'phone'>>) {
    const user = await this.findById(id);
    Object.assign(user, data);
    return this.usersRepo.save(user);
  }

  save(user: User) {
    return this.usersRepo.save(user);
  }

  // Admin list — all users regardless of role, with company name, order count, and total spent.
  async findAllAdmin(query: QueryUsersDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoin('user.orders', 'orders')
      .addSelect('COUNT(DISTINCT orders.id)', 'orderCount')
      .addSelect('COALESCE(SUM(orders.total), 0)', 'totalSpent')
      .groupBy('user.id')
      .addGroupBy('company.id')
      .orderBy('user.createdAt', 'DESC');

    if (query.search) {
      qb.andWhere('(user.fullName ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.role) {
      const roles = query.role.split(',').map((r) => r.trim().toUpperCase());
      qb.andWhere('user.role IN (:...roles)', { roles });
    }

    qb.offset((page - 1) * limit).limit(limit);

    const { entities, raw } = await qb.getRawAndEntities();
    const data = entities.map((user, i) => ({
      ...user,
      orderCount: Number(raw[i]?.orderCount || 0),
      totalSpent: Number(raw[i]?.totalSpent || 0),
    }));

    const totalQb = this.usersRepo.createQueryBuilder('user');
    if (query.search) {
      totalQb.andWhere('(user.fullName ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.role) {
      const roles = query.role.split(',').map((r) => r.trim().toUpperCase());
      totalQb.andWhere('user.role IN (:...roles)', { roles });
    }
    const total = await totalQb.getCount();

    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findDetail(id: number) {
    const user = await this.findById(id);
    const recentOrders = await this.ordersRepo.find({
      where: { userId: id },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 10,
    });
    const [orderCountRaw, totalSpentRaw] = await Promise.all([
      this.ordersRepo.count({ where: { userId: id } }),
      this.ordersRepo
        .createQueryBuilder('order')
        .where('order.userId = :id', { id })
        .select('COALESCE(SUM(order.total), 0)', 'total')
        .getRawOne<{ total: string }>(),
    ]);
    return {
      ...user,
      recentOrders,
      orderCount: orderCountRaw,
      totalSpent: Number(totalSpentRaw?.total || 0),
      lastOrderDate: recentOrders[0]?.createdAt ?? null,
    };
  }

  // Admin: full profile update — fullName/email/phone/role/companyId.
  // Self-demotion is blocked one level up in the controller (needs the
  // requesting admin's own id, which the service doesn't have).
  async updateUser(id: number, dto: UpdateUserDto) {
    const user = await this.findById(id);

    if (dto.email && dto.email !== user.email) {
      const existing = await this.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email already registered to another account');
      }
      user.email = dto.email;
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.companyId !== undefined) user.companyId = dto.companyId;

    return this.usersRepo.save(user);
  }

  async setPassword(id: number, newPassword: string) {
    const user = await this.findById(id);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.save(user);
    return { success: true };
  }

  async updateRole(id: number, role: UserRole) {
    const user = await this.findById(id);
    user.role = role;
    return this.usersRepo.save(user);
  }

  async createStaff(dto: CreateStaffUserDto) {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
    });
    return user;
  }
}
