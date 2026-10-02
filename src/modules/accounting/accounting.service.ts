import { Injectable, Logger } from '@nestjs/common';
import {
  AccountingEntryType,
  IncomeSource,
  Prisma,
  type AccountingEntry,
  type PaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { ZERO, money, type Money } from '../../common/money/money';
import { computeTotals, type LedgerTotals } from '../payments/billing-math';
import { toDateOnly } from '../memberships/membership-period';
import { GymTimeService } from '../../common/time/gym-time.service';
import type {
  AccountingEntryWithRelations,
  CreateAccountingEntryDto,
  QueryAccountingEntriesDto,
} from './dto/accounting-entry.dto';

const ENTRY_INCLUDE = {
  expenseCategory: true,
  trainer: { include: { user: true } },
  recordedBy: true,
} satisfies Prisma.AccountingEntryInclude;

/** Only entries that have not been voided count towards any total. */
const NOT_VOIDED: Prisma.AccountingEntryWhereInput = { voidedAt: null };

export interface PostIncomeInput {
  paymentId: string;
  amount: Prisma.Decimal;
  occurredOn: Date;
  description: string;
  method: PaymentMethod;
  recordedByUserId?: string | null;
}

export interface PostRefundInput {
  refundId: string;
  amount: Prisma.Decimal;
  occurredOn: Date;
  description: string;
  method: PaymentMethod;
  recordedByUserId?: string | null;
}

export interface PeriodTotals extends LedgerTotals {
  from: Date;
  to: Date;
}

export interface DailyTotals {
  date: string;
  income: Money;
  refunds: Money;
  revenue: Money;
  expenses: Money;
  profit: Money;
}

export interface MonthlyTotals extends DailyTotals {
  month: number;
  year: number;
}

export interface CategoryBreakdown {
  expenseCategoryId: string | null;
  expenseCategoryName: string;
  amount: Money;
}

export interface MethodBreakdown {
  method: PaymentMethod | null;
  income: Money;
  refunds: Money;
}

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gymTime: GymTimeService,
  ) {}

  /**
   * The calendar date a money movement belongs to.
   *
   * `occurred_on` is a SQL `date`, so it has to be *some* calendar date. Using
   * the gym's local date means a payment taken at 20:00 on the last day of the
   * month lands in that month's revenue rather than the next one's. With the
   * timezone set to UTC — the default — this is identical to taking the UTC
   * date, so it changes nothing until a gym configures its own zone.
   */
  private ledgerDate(instant: Date): Date {
    return this.gymTime.localDateAsUtcMidnight(this.gymTime.localDateOf(instant));
  }

  // -------------------------------------------------------------------------
  // Automatic posting
  //
  // These are the only way a payment or refund reaches the ledger. Both take a
  // transaction client, so the money record and its ledger entry are written
  // together or not at all, and both rely on the unique index on
  // payment_id / refund_id to make a double post impossible even under a race.
  // -------------------------------------------------------------------------

  async postPaymentIncome(
    tx: Prisma.TransactionClient,
    input: PostIncomeInput,
  ): Promise<AccountingEntry> {
    return tx.accountingEntry.create({
      data: {
        type: AccountingEntryType.INCOME,
        amount: input.amount,
        occurredOn: this.ledgerDate(input.occurredOn),
        description: input.description,
        incomeSource: IncomeSource.MEMBERSHIP_PAYMENT,
        method: input.method,
        paymentId: input.paymentId,
        isAutomatic: true,
        recordedByUserId: input.recordedByUserId ?? null,
      },
    });
  }

  async postRefund(tx: Prisma.TransactionClient, input: PostRefundInput): Promise<AccountingEntry> {
    return tx.accountingEntry.create({
      data: {
        type: AccountingEntryType.REFUND,
        amount: input.amount,
        occurredOn: this.ledgerDate(input.occurredOn),
        description: input.description,
        method: input.method,
        refundId: input.refundId,
        isAutomatic: true,
        recordedByUserId: input.recordedByUserId ?? null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Manual entries
  // -------------------------------------------------------------------------

  async createEntry(
    dto: CreateAccountingEntryDto,
    recordedByUserId: string,
  ): Promise<AccountingEntryWithRelations> {
    if (dto.type === AccountingEntryType.EXPENSE) {
      if (!dto.expenseCategoryId) {
        throw new BusinessRuleError('An expense requires an expense category', [
          { field: 'expenseCategoryId', messages: ['is required for an expense'] },
        ]);
      }
      await this.requireUsableCategory(dto.expenseCategoryId);
    } else if (dto.expenseCategoryId) {
      throw new BusinessRuleError('Income cannot be assigned an expense category', [
        { field: 'expenseCategoryId', messages: ['is only valid for an expense'] },
      ]);
    }

    if (dto.trainerId) {
      if (dto.type !== AccountingEntryType.EXPENSE) {
        throw new BusinessRuleError('Only an expense can be attributed to a trainer', [
          { field: 'trainerId', messages: ['is only valid for an expense'] },
        ]);
      }
      const trainer = await this.prisma.trainer.findUnique({
        where: { id: dto.trainerId },
        select: { id: true },
      });
      if (!trainer) throw new NotFoundError('Trainer', dto.trainerId);
    }

    const entry = await this.prisma.accountingEntry.create({
      data: {
        type: dto.type,
        amount: money(dto.amount),
        occurredOn: toDateOnly(new Date(dto.occurredOn)),
        description: dto.description,
        expenseCategoryId: dto.expenseCategoryId ?? null,
        incomeSource: dto.type === AccountingEntryType.INCOME ? IncomeSource.OTHER : null,
        method: dto.method ?? null,
        trainerId: dto.trainerId ?? null,
        isAutomatic: false,
        recordedByUserId,
      },
      include: ENTRY_INCLUDE,
    });

    this.logger.log(
      `Recorded ${entry.type} of ${entry.amount.toFixed(2)} on ${entry.occurredOn.toISOString().slice(0, 10)}: ${entry.description}`,
    );
    return entry;
  }

  /**
   * Voids a manual entry. The row is kept — a ledger that can lose rows cannot
   * be audited — but it stops counting towards any total.
   *
   * Automatic entries are immutable: correcting one means refunding the
   * payment that produced it, so the money record and the ledger stay in step.
   */
  async voidEntry(id: string, reason: string): Promise<AccountingEntryWithRelations> {
    const entry = await this.findEntryOrFail(id);

    if (entry.isAutomatic) {
      throw new BusinessRuleError(
        'This entry was generated by a payment or refund and cannot be voided. ' +
          'Refund the payment instead, so the ledger and the money records stay consistent.',
      );
    }

    if (entry.voidedAt !== null) {
      throw new ConflictError(`Accounting entry '${id}' is already voided`);
    }

    const voided = await this.prisma.accountingEntry.update({
      where: { id },
      data: { voidedAt: new Date(), voidedReason: reason },
      include: ENTRY_INCLUDE,
    });

    this.logger.log(`Voided accounting entry ${id}: ${reason}`);
    return voided;
  }

  async findEntryOrFail(id: string): Promise<AccountingEntryWithRelations> {
    const entry = await this.prisma.accountingEntry.findUnique({
      where: { id },
      include: ENTRY_INCLUDE,
    });

    if (!entry) throw new NotFoundError('Accounting entry', id);
    return entry;
  }

  async findEntries(
    query: QueryAccountingEntriesDto,
  ): Promise<PaginatedResult<AccountingEntryWithRelations>> {
    const where = this.entryFilter(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.accountingEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.accountingEntry.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  private entryFilter(query: QueryAccountingEntriesDto): Prisma.AccountingEntryWhereInput {
    const filters: Prisma.AccountingEntryWhereInput[] = [];

    if (query.type) filters.push({ type: query.type });
    if (query.expenseCategoryId) filters.push({ expenseCategoryId: query.expenseCategoryId });
    if (query.trainerId) filters.push({ trainerId: query.trainerId });
    if (query.from) filters.push({ occurredOn: { gte: toDateOnly(new Date(query.from)) } });
    if (query.to) filters.push({ occurredOn: { lte: toDateOnly(new Date(query.to)) } });
    if (query.search) {
      filters.push({
        description: { contains: query.search, mode: Prisma.QueryMode.insensitive },
      });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  // -------------------------------------------------------------------------
  // Totals
  // -------------------------------------------------------------------------

  /** Income, refunds, revenue, expenses and profit over a date range. */
  async totalsForPeriod(from: Date, to: Date): Promise<PeriodTotals> {
    const fromDate = toDateOnly(from);
    const toDate = toDateOnly(to);

    if (toDate < fromDate) {
      throw new BusinessRuleError('`to` must not be earlier than `from`', [
        { field: 'to', messages: ['must be on or after from'] },
      ]);
    }

    const grouped = await this.prisma.accountingEntry.groupBy({
      by: ['type'],
      where: { ...NOT_VOIDED, occurredOn: { gte: fromDate, lte: toDate } },
      _sum: { amount: true },
    });

    const byType = new Map<AccountingEntryType, Money>(
      grouped.map((row) => [row.type, money(row._sum.amount ?? 0)]),
    );

    const totals = computeTotals({
      income: byType.get(AccountingEntryType.INCOME) ?? ZERO,
      refunds: byType.get(AccountingEntryType.REFUND) ?? ZERO,
      expenses: byType.get(AccountingEntryType.EXPENSE) ?? ZERO,
    });

    return { ...totals, from: fromDate, to: toDate };
  }

  /**
   * Per-day totals across a range. Grouped in SQL on the date column, so day
   * boundaries follow the stored dates rather than the server's timezone.
   */
  async dailyTotals(from: Date, to: Date): Promise<DailyTotals[]> {
    const fromDate = toDateOnly(from);
    const toDate = toDateOnly(to);

    if (toDate < fromDate) {
      throw new BusinessRuleError('`to` must not be earlier than `from`', [
        { field: 'to', messages: ['must be on or after from'] },
      ]);
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; type: AccountingEntryType; total: Prisma.Decimal }>
    >`
      SELECT occurred_on AS day, type, SUM(amount) AS total
      FROM accounting_entries
      WHERE voided_at IS NULL AND occurred_on BETWEEN ${fromDate} AND ${toDate}
      GROUP BY occurred_on, type
      ORDER BY occurred_on ASC
    `;

    return AccountingService.foldByBucket(rows, (row) => row.day.toISOString().slice(0, 10)).map(
      ([date, totals]) => ({ date, ...totals }),
    );
  }

  /** Per-month totals for a calendar year. */
  async monthlyTotals(year: number): Promise<MonthlyTotals[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ month: number; type: AccountingEntryType; total: Prisma.Decimal }>
    >`
      SELECT EXTRACT(MONTH FROM occurred_on)::int AS month, type, SUM(amount) AS total
      FROM accounting_entries
      WHERE voided_at IS NULL AND EXTRACT(YEAR FROM occurred_on) = ${year}
      GROUP BY month, type
      ORDER BY month ASC
    `;

    return AccountingService.foldByBucket(rows, (row) => String(row.month)).map(
      ([month, totals]) => ({
        year,
        month: Number.parseInt(month, 10),
        date: `${year}-${String(month).padStart(2, '0')}`,
        ...totals,
      }),
    );
  }

  /**
   * Collapses `(bucket, type, total)` rows into one totals object per bucket.
   * Shared by the daily and monthly reports so the arithmetic is identical.
   */
  private static foldByBucket<T extends { type: AccountingEntryType; total: Prisma.Decimal }>(
    rows: T[],
    keyOf: (row: T) => string,
  ): Array<[string, LedgerTotals]> {
    const buckets = new Map<string, Record<AccountingEntryType, Money>>();

    for (const row of rows) {
      const key = keyOf(row);
      const bucket = buckets.get(key) ?? { INCOME: ZERO, EXPENSE: ZERO, REFUND: ZERO };

      bucket[row.type] = bucket[row.type].plus(money(row.total));
      buckets.set(key, bucket);
    }

    return [...buckets.entries()].map(([key, bucket]) => [
      key,
      computeTotals({
        income: bucket.INCOME,
        refunds: bucket.REFUND,
        expenses: bucket.EXPENSE,
      }),
    ]);
  }

  /** Expense totals grouped by category, for the period breakdown. */
  async expensesByCategory(from: Date, to: Date): Promise<CategoryBreakdown[]> {
    const grouped = await this.prisma.accountingEntry.groupBy({
      by: ['expenseCategoryId'],
      where: {
        ...NOT_VOIDED,
        type: AccountingEntryType.EXPENSE,
        occurredOn: { gte: toDateOnly(from), lte: toDateOnly(to) },
      },
      _sum: { amount: true },
    });

    const categories = await this.prisma.expenseCategory.findMany({
      where: {
        id: {
          in: grouped.map((row) => row.expenseCategoryId).filter((id): id is string => id !== null),
        },
      },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((category) => [category.id, category.name]));

    return grouped
      .map((row) => ({
        expenseCategoryId: row.expenseCategoryId,
        expenseCategoryName: row.expenseCategoryId
          ? (nameById.get(row.expenseCategoryId) ?? 'Unknown')
          : 'Uncategorised',
        amount: money(row._sum.amount ?? 0),
      }))
      .sort((a, b) => b.amount.comparedTo(a.amount));
  }

  /** Income and refunds grouped by payment method. */
  async byPaymentMethod(from: Date, to: Date): Promise<MethodBreakdown[]> {
    const grouped = await this.prisma.accountingEntry.groupBy({
      by: ['method', 'type'],
      where: {
        ...NOT_VOIDED,
        type: { in: [AccountingEntryType.INCOME, AccountingEntryType.REFUND] },
        occurredOn: { gte: toDateOnly(from), lte: toDateOnly(to) },
      },
      _sum: { amount: true },
    });

    const byMethod = new Map<PaymentMethod | null, { income: Money; refunds: Money }>();

    for (const row of grouped) {
      const current = byMethod.get(row.method) ?? { income: ZERO, refunds: ZERO };
      const amount = money(row._sum.amount ?? 0);

      if (row.type === AccountingEntryType.INCOME) {
        current.income = current.income.plus(amount);
      } else {
        current.refunds = current.refunds.plus(amount);
      }

      byMethod.set(row.method, current);
    }

    return [...byMethod.entries()].map(([method, totals]) => ({ method, ...totals }));
  }

  // -------------------------------------------------------------------------
  // Expense categories
  // -------------------------------------------------------------------------

  async requireUsableCategory(id: string): Promise<void> {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundError('Expense category', id);

    if (category.archivedAt !== null) {
      throw new BusinessRuleError(
        `Expense category '${category.name}' is archived and cannot take new expenses`,
        [{ field: 'expenseCategoryId', messages: ['category must be active'] }],
      );
    }
  }
}
