import { ExpenseCategoriesService } from './expense-categories.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { QueryExpenseCategoriesDto } from './dto/expense-category.dto';

function query(overrides: Partial<QueryExpenseCategoriesDto> = {}): QueryExpenseCategoriesDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

describe('ExpenseCategoriesService', () => {
  let prisma: {
    expenseCategory: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    accountingEntry: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ExpenseCategoriesService;

  beforeEach(() => {
    prisma = {
      expenseCategory: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
      },
      accountingEntry: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };

    service = new ExpenseCategoriesService(prisma as unknown as PrismaService);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  it('hides archived categories unless asked for', async () => {
    await service.findMany(query());

    const where = prisma.expenseCategory.findMany.mock.calls[0][0].where as { AND: unknown[] };
    expect(where.AND).toContainEqual({ archivedAt: null });
  });

  it('includes archived categories on request', async () => {
    await service.findMany(query({ includeArchived: true }));

    expect(prisma.expenseCategory.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('rejects a duplicate name', async () => {
    prisma.expenseCategory.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.create({ name: 'Rent' })).rejects.toMatchObject({
      errorCode: 'CONFLICT',
      details: [{ field: 'name', messages: ['must be unique'] }],
    });
  });

  it('archives without deleting the history filed under it', async () => {
    prisma.expenseCategory.findUnique.mockResolvedValue({
      id: 'cat-1',
      name: 'Rent',
      archivedAt: null,
    });
    prisma.accountingEntry.count.mockResolvedValue(12);

    await service.archive('cat-1');

    const data = prisma.expenseCategory.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(prisma.accountingEntry.count).toHaveBeenCalledWith({
      where: { expenseCategoryId: 'cat-1' },
    });
  });

  it('refuses to archive twice', async () => {
    prisma.expenseCategory.findUnique.mockResolvedValue({
      id: 'cat-1',
      name: 'Rent',
      archivedAt: new Date(),
    });

    await expect(service.archive('cat-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
  });

  it('refuses to reactivate an active category', async () => {
    prisma.expenseCategory.findUnique.mockResolvedValue({
      id: 'cat-1',
      name: 'Rent',
      archivedAt: null,
    });

    await expect(service.reactivate('cat-1')).rejects.toMatchObject({ errorCode: 'CONFLICT' });
  });

  it('allows resubmitting the same name on update', async () => {
    prisma.expenseCategory.findUnique.mockResolvedValue({
      id: 'cat-1',
      name: 'Rent',
      archivedAt: null,
    });

    await expect(service.update('cat-1', { name: 'Rent' })).resolves.toBeDefined();
  });

  it('rejects an unknown category', async () => {
    prisma.expenseCategory.findUnique.mockResolvedValue(null);
    await expect(service.findOneOrFail('ghost')).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
