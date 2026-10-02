import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import type {
  CreateExpenseCategoryDto,
  QueryExpenseCategoriesDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';

@Injectable()
export class ExpenseCategoriesService {
  private readonly logger = new Logger(ExpenseCategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: QueryExpenseCategoriesDto): Promise<PaginatedResult<ExpenseCategory>> {
    const filters: Prisma.ExpenseCategoryWhereInput[] = [];

    if (!query.includeArchived) filters.push({ archivedAt: null });
    if (query.search) {
      filters.push({ name: { contains: query.search, mode: Prisma.QueryMode.insensitive } });
    }

    const where: Prisma.ExpenseCategoryWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.expenseCategory.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.expenseCategory.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOneOrFail(id: string): Promise<ExpenseCategory> {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundError('Expense category', id);
    return category;
  }

  async create(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    await this.assertNameAvailable(dto.name);

    const category = await this.prisma.expenseCategory.create({
      data: { name: dto.name, description: dto.description ?? null },
    });

    this.logger.log(`Created expense category '${category.name}'`);
    return category;
  }

  async update(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> {
    const category = await this.findOneOrFail(id);

    if (dto.name !== undefined && dto.name !== category.name) {
      await this.assertNameAvailable(dto.name);
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  /**
   * Retires a category. Expenses already filed under it keep their history —
   * the relation is RESTRICT, so a category in use can never be deleted.
   */
  async archive(id: string): Promise<ExpenseCategory> {
    const category = await this.findOneOrFail(id);

    if (category.archivedAt !== null) {
      throw new ConflictError(`Expense category '${category.name}' is already archived`);
    }

    const archived = await this.prisma.expenseCategory.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    const inUse = await this.prisma.accountingEntry.count({ where: { expenseCategoryId: id } });
    this.logger.log(
      `Archived expense category '${category.name}'; ${inUse} existing entr${inUse === 1 ? 'y' : 'ies'} retained`,
    );

    return archived;
  }

  async reactivate(id: string): Promise<ExpenseCategory> {
    const category = await this.findOneOrFail(id);

    if (category.archivedAt === null) {
      throw new ConflictError(`Expense category '${category.name}' is already active`);
    }

    return this.prisma.expenseCategory.update({ where: { id }, data: { archivedAt: null } });
  }

  private async assertNameAvailable(name: string): Promise<void> {
    const existing = await this.prisma.expenseCategory.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(`An expense category named '${name}' already exists`, [
        { field: 'name', messages: ['must be unique'] },
      ]);
    }
  }
}
