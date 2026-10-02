import { AccountingEntryType, IncomeSource, PaymentMethod, Prisma } from '@prisma/client';
import { AccountingService } from './accounting.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { format } from '../../common/money/money';
import { GymTimeService } from '../../common/time/gym-time.service';
import { zonedDateString } from '../../common/time/zoned-time';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A UTC gym, so ledger dates match the UTC date exactly. */
function gymTime(zone = 'UTC'): GymTimeService {
  return {
    zone,
    localDateOf: (instant: Date) => zonedDateString(instant, zone),
    localDateAsUtcMidnight: (localDate: string) => new Date(`${localDate}T00:00:00.000Z`),
  } as unknown as GymTimeService;
}

describe('AccountingService', () => {
  let prisma: {
    accountingEntry: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    expenseCategory: { findUnique: jest.Mock; findMany: jest.Mock };
    trainer: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let service: AccountingService;

  beforeEach(() => {
    prisma = {
      accountingEntry: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      expenseCategory: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Rent', archivedAt: null }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      trainer: { findUnique: jest.fn().mockResolvedValue({ id: 'trainer-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };

    service = new AccountingService(prisma as unknown as PrismaService, gymTime());
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('automatic posting', () => {
    const tx = () => prisma as unknown as Prisma.TransactionClient;

    it('posts payment income with a unique link back to the payment', async () => {
      await service.postPaymentIncome(tx(), {
        paymentId: 'pay-1',
        amount: new Prisma.Decimal('49.99'),
        occurredOn: new Date('2026-10-01T14:33:00.000Z'),
        description: 'Membership payment',
        method: PaymentMethod.CASH,
        recordedByUserId: 'user-1',
      });

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.type).toBe(AccountingEntryType.INCOME);
      expect(data.paymentId).toBe('pay-1');
      expect(data.isAutomatic).toBe(true);
      expect(data.incomeSource).toBe(IncomeSource.MEMBERSHIP_PAYMENT);
    });

    it('stores the posting date as a date, discarding the time of day', async () => {
      await service.postPaymentIncome(tx(), {
        paymentId: 'pay-1',
        amount: new Prisma.Decimal('10.00'),
        occurredOn: new Date('2026-10-01T23:59:59.000Z'),
        description: 'x',
        method: PaymentMethod.CARD,
      });

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as { occurredOn: Date };
      expect(data.occurredOn.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('posts a refund as its own type, not as an expense', async () => {
      await service.postRefund(tx(), {
        refundId: 'ref-1',
        amount: new Prisma.Decimal('5.00'),
        occurredOn: d('2026-10-05'),
        description: 'Refund — goodwill',
        method: PaymentMethod.CASH,
      });

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.type).toBe(AccountingEntryType.REFUND);
      expect(data.refundId).toBe('ref-1');
      expect(data.isAutomatic).toBe(true);
      expect(data.expenseCategoryId).toBeUndefined();
    });

    it("writes through the caller's transaction client, not its own connection", async () => {
      const txClient = { accountingEntry: { create: jest.fn().mockResolvedValue({}) } };

      await service.postPaymentIncome(txClient as unknown as Prisma.TransactionClient, {
        paymentId: 'pay-1',
        amount: new Prisma.Decimal('1.00'),
        occurredOn: new Date(),
        description: 'x',
        method: PaymentMethod.CASH,
      });

      expect(txClient.accountingEntry.create).toHaveBeenCalledTimes(1);
      expect(prisma.accountingEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('createEntry', () => {
    const expense = {
      type: AccountingEntryType.EXPENSE,
      amount: 1200,
      occurredOn: '2026-10-01',
      description: 'October rent',
      expenseCategoryId: 'cat-1',
    };

    it('records a categorised expense as manual', async () => {
      await service.createEntry(expense, 'user-1');

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.isAutomatic).toBe(false);
      expect(data.expenseCategoryId).toBe('cat-1');
      expect(data.incomeSource).toBeNull();
      expect(data.recordedByUserId).toBe('user-1');
    });

    it('marks manual income as OTHER rather than a membership payment', async () => {
      await service.createEntry(
        {
          type: AccountingEntryType.INCOME,
          amount: 50,
          occurredOn: '2026-10-01',
          description: 'Towel sales',
        },
        'user-1',
      );

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.incomeSource).toBe(IncomeSource.OTHER);
    });

    it('refuses an expense with no category', async () => {
      await expect(
        service.createEntry({ ...expense, expenseCategoryId: undefined }, 'user-1'),
      ).rejects.toThrow(/expense requires an expense category/);
    });

    it('refuses income carrying an expense category', async () => {
      await expect(
        service.createEntry(
          {
            type: AccountingEntryType.INCOME,
            amount: 50,
            occurredOn: '2026-10-01',
            description: 'x',
            expenseCategoryId: 'cat-1',
          },
          'user-1',
        ),
      ).rejects.toThrow(/Income cannot be assigned an expense category/);
    });

    it('refuses an archived category', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Old',
        archivedAt: new Date(),
      });

      await expect(service.createEntry(expense, 'user-1')).rejects.toThrow(
        /archived and cannot take new expenses/,
      );
    });

    it('refuses an unknown category', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(null);
      await expect(service.createEntry(expense, 'user-1')).rejects.toMatchObject({
        errorCode: 'NOT_FOUND',
      });
    });

    it('attributes an expense to a trainer', async () => {
      await service.createEntry({ ...expense, trainerId: 'trainer-1' }, 'user-1');

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.trainerId).toBe('trainer-1');
    });

    it('refuses to attribute income to a trainer', async () => {
      await expect(
        service.createEntry(
          {
            type: AccountingEntryType.INCOME,
            amount: 50,
            occurredOn: '2026-10-01',
            description: 'x',
            trainerId: 'trainer-1',
          },
          'user-1',
        ),
      ).rejects.toThrow(/Only an expense can be attributed to a trainer/);
    });

    it('refuses an unknown trainer', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);

      await expect(
        service.createEntry({ ...expense, trainerId: 'ghost' }, 'user-1'),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('voidEntry', () => {
    it('refuses to void an automatically generated entry', async () => {
      prisma.accountingEntry.findUnique.mockResolvedValue({
        id: 'e-1',
        isAutomatic: true,
        voidedAt: null,
      });

      await expect(service.voidEntry('e-1', 'oops')).rejects.toThrow(
        /generated by a payment or refund and cannot be voided/,
      );
      expect(prisma.accountingEntry.update).not.toHaveBeenCalled();
    });

    it('voids a manual entry without deleting it', async () => {
      prisma.accountingEntry.findUnique.mockResolvedValue({
        id: 'e-1',
        isAutomatic: false,
        voidedAt: null,
      });

      await service.voidEntry('e-1', 'Wrong amount');

      const data = prisma.accountingEntry.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.voidedAt).toBeInstanceOf(Date);
      expect(data.voidedReason).toBe('Wrong amount');
    });

    it('refuses to void twice', async () => {
      prisma.accountingEntry.findUnique.mockResolvedValue({
        id: 'e-1',
        isAutomatic: false,
        voidedAt: new Date(),
      });

      await expect(service.voidEntry('e-1', 'again')).rejects.toMatchObject({
        errorCode: 'CONFLICT',
      });
    });
  });

  describe('totalsForPeriod', () => {
    it('derives revenue and profit from the grouped sums', async () => {
      prisma.accountingEntry.groupBy.mockResolvedValue([
        { type: AccountingEntryType.INCOME, _sum: { amount: new Prisma.Decimal('1000.00') } },
        { type: AccountingEntryType.REFUND, _sum: { amount: new Prisma.Decimal('150.00') } },
        { type: AccountingEntryType.EXPENSE, _sum: { amount: new Prisma.Decimal('400.00') } },
      ]);

      const totals = await service.totalsForPeriod(d('2026-10-01'), d('2026-10-31'));

      expect(format(totals.revenue)).toBe('850.00');
      expect(format(totals.profit)).toBe('450.00');
    });

    it('excludes voided entries', async () => {
      await service.totalsForPeriod(d('2026-10-01'), d('2026-10-31'));

      const where = prisma.accountingEntry.groupBy.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(where.voidedAt).toBeNull();
    });

    it('is all zeroes for a period with no entries', async () => {
      const totals = await service.totalsForPeriod(d('2026-10-01'), d('2026-10-31'));

      expect(format(totals.income)).toBe('0.00');
      expect(format(totals.profit)).toBe('0.00');
    });

    it('rejects a range that ends before it starts', async () => {
      await expect(service.totalsForPeriod(d('2026-10-31'), d('2026-10-01'))).rejects.toThrow(
        /must not be earlier than/,
      );
    });
  });

  describe('dailyTotals', () => {
    it('folds the per-type rows into one totals object per day', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          day: d('2026-10-01'),
          type: AccountingEntryType.INCOME,
          total: new Prisma.Decimal('100.00'),
        },
        {
          day: d('2026-10-01'),
          type: AccountingEntryType.EXPENSE,
          total: new Prisma.Decimal('40.00'),
        },
        {
          day: d('2026-10-02'),
          type: AccountingEntryType.INCOME,
          total: new Prisma.Decimal('60.00'),
        },
        {
          day: d('2026-10-02'),
          type: AccountingEntryType.REFUND,
          total: new Prisma.Decimal('10.00'),
        },
      ]);

      const rows = await service.dailyTotals(d('2026-10-01'), d('2026-10-02'));

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(expect.objectContaining({ date: '2026-10-01' }));
      expect(format(rows[0].profit)).toBe('60.00');
      expect(format(rows[1].revenue)).toBe('50.00');
      expect(format(rows[1].profit)).toBe('50.00');
    });

    it('rejects an inverted range', async () => {
      await expect(service.dailyTotals(d('2026-10-05'), d('2026-10-01'))).rejects.toThrow(
        /must not be earlier than/,
      );
    });
  });

  describe('monthlyTotals', () => {
    it('labels each bucket with a zero-padded month', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { month: 1, type: AccountingEntryType.INCOME, total: new Prisma.Decimal('500.00') },
        { month: 10, type: AccountingEntryType.INCOME, total: new Prisma.Decimal('800.00') },
        { month: 10, type: AccountingEntryType.EXPENSE, total: new Prisma.Decimal('300.00') },
      ]);

      const rows = await service.monthlyTotals(2026);

      expect(rows[0].date).toBe('2026-01');
      expect(rows[1].date).toBe('2026-10');
      expect(format(rows[1].profit)).toBe('500.00');
    });
  });

  describe('expensesByCategory', () => {
    it('names each category and sorts by the largest spend', async () => {
      prisma.accountingEntry.groupBy.mockResolvedValue([
        { expenseCategoryId: 'cat-1', _sum: { amount: new Prisma.Decimal('100.00') } },
        { expenseCategoryId: 'cat-2', _sum: { amount: new Prisma.Decimal('900.00') } },
      ]);
      prisma.expenseCategory.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Cleaning' },
        { id: 'cat-2', name: 'Rent' },
      ]);

      const rows = await service.expensesByCategory(d('2026-10-01'), d('2026-10-31'));

      expect(rows[0].expenseCategoryName).toBe('Rent');
      expect(rows[1].expenseCategoryName).toBe('Cleaning');
    });

    it('labels an entry with no category as uncategorised', async () => {
      prisma.accountingEntry.groupBy.mockResolvedValue([
        { expenseCategoryId: null, _sum: { amount: new Prisma.Decimal('50.00') } },
      ]);

      const rows = await service.expensesByCategory(d('2026-10-01'), d('2026-10-31'));
      expect(rows[0].expenseCategoryName).toBe('Uncategorised');
    });
  });

  describe('byPaymentMethod', () => {
    it('splits income and refunds per method', async () => {
      prisma.accountingEntry.groupBy.mockResolvedValue([
        {
          method: PaymentMethod.CASH,
          type: AccountingEntryType.INCOME,
          _sum: { amount: new Prisma.Decimal('20.00') },
        },
        {
          method: PaymentMethod.CASH,
          type: AccountingEntryType.REFUND,
          _sum: { amount: new Prisma.Decimal('5.00') },
        },
        {
          method: PaymentMethod.CARD,
          type: AccountingEntryType.INCOME,
          _sum: { amount: new Prisma.Decimal('30.00') },
        },
      ]);

      const rows = await service.byPaymentMethod(d('2026-10-01'), d('2026-10-31'));
      const cash = rows.find((row) => row.method === PaymentMethod.CASH);
      const card = rows.find((row) => row.method === PaymentMethod.CARD);

      expect(format(cash!.income)).toBe('20.00');
      expect(format(cash!.refunds)).toBe('5.00');
      expect(format(card!.refunds)).toBe('0.00');
    });
  });

  describe('ledger dating', () => {
    it("files a late-evening payment on the gym's local date, not the UTC date", async () => {
      // 01:30 UTC on 1 August is still 21:30 on 31 July in New York.
      const newYorkGym = new AccountingService(
        prisma as unknown as PrismaService,
        gymTime('America/New_York'),
      );

      await newYorkGym.postPaymentIncome(prisma as unknown as Prisma.TransactionClient, {
        paymentId: 'pay-1',
        amount: new Prisma.Decimal('49.99'),
        occurredOn: new Date('2026-08-01T01:30:00.000Z'),
        description: 'x',
        method: PaymentMethod.CASH,
      });

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as { occurredOn: Date };
      expect(data.occurredOn.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    });

    it('matches the UTC date when the gym runs on UTC', async () => {
      await service.postPaymentIncome(prisma as unknown as Prisma.TransactionClient, {
        paymentId: 'pay-1',
        amount: new Prisma.Decimal('49.99'),
        occurredOn: new Date('2026-08-01T01:30:00.000Z'),
        description: 'x',
        method: PaymentMethod.CASH,
      });

      const data = prisma.accountingEntry.create.mock.calls[0][0].data as { occurredOn: Date };
      expect(data.occurredOn.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });
  });
});
