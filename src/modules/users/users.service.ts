import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { QueryUsersDto } from './dto/query-users.dto';

/**
 * Owns the user account record: identity, credentials and status.
 * The member and trainer profiles that link to it live in their own modules.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Emails are stored and compared lower-cased. */
  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Creates an account.
   *
   * `client` lets a caller run this inside an existing transaction, so that
   * creating a profile and its account either both succeed or both roll back.
   */
  async create(dto: CreateUserDto, client?: Prisma.TransactionClient): Promise<User> {
    const db = client ?? this.prisma;
    const email = UsersService.normalizeEmail(dto.email);

    if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictError(`A user with email '${email}' already exists`, [
        { field: 'email', messages: ['must be unique'] },
      ]);
    }

    return db.user.create({
      data: {
        email,
        passwordHash: await this.passwords.hash(dto.password),
        role: dto.role,
        status: dto.status ?? UserStatus.ACTIVE,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim(),
      },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: UsersService.normalizeEmail(email) },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async findMany(query: QueryUsersDto): Promise<PaginatedResult<User>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { firstName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { lastName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async setStatus(id: string, status: UserStatus): Promise<User> {
    await this.findByIdOrFail(id);
    return this.prisma.user.update({ where: { id }, data: { status } });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async recordLogin(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }
}
