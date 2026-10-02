import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GymTimeService } from '../../common/time/gym-time.service';
import { NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import type { QueryAuditLogsDto } from './dto/audit-log.dto';

/**
 * Reading the audit trail.
 *
 * There is deliberately no update or delete: a log an administrator can edit
 * is not evidence. Pruning old entries is a database-level retention job, not
 * an API operation.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymTime: GymTimeService,
  ) {}

  async findMany(query: QueryAuditLogsDto): Promise<PaginatedResult<AuditLog>> {
    const filters: Prisma.AuditLogWhereInput[] = [];

    if (query.actorId) filters.push({ actorId: query.actorId });
    if (query.actorRole) filters.push({ actorRole: query.actorRole });
    if (query.action) filters.push({ action: { startsWith: query.action } });
    if (query.entityType) filters.push({ entityType: query.entityType });
    if (query.entityId) filters.push({ entityId: query.entityId });
    if (query.outcome) filters.push({ outcome: query.outcome });

    if (query.from) {
      filters.push({ createdAt: { gte: this.gymTime.range(query.from, query.from).start } });
    }
    if (query.to) {
      filters.push({ createdAt: { lt: this.gymTime.range(query.to, query.to).end } });
    }

    const where: Prisma.AuditLogWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOneOrFail(id: string): Promise<AuditLog> {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundError('Audit log', id);
    return log;
  }

  /** Everything that touched one record, for an investigation. */
  findForEntity(
    entityType: string,
    entityId: string,
    query: QueryAuditLogsDto,
  ): Promise<PaginatedResult<AuditLog>> {
    // `skip`/`take` are getters on the pagination DTO, so the object is
    // mutated rather than spread — a spread would drop them.
    query.entityType = entityType;
    query.entityId = entityId;

    return this.findMany(query);
  }
}
