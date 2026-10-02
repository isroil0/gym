import { PaymentStatus, PaymentMethod, Prisma, UserRole, UserStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MembersService } from '../members/members.service';
import type { AccountingService } from '../accounting/accounting.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { QueryPaymentsDto } from './dto/payment.dto';

const ADMIN: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@gym.test',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
};

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

function query(overrides: Partial<QueryPaymentsDto> = {}): QueryPaymentsDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    memberId: 'member-1',
    membershipId: 'mm-1',
    amount: new Prisma.Decimal('50.00'),
    method: PaymentMethod.CASH,
    status: PaymentStatus.COMPLETED,
    paidAt: new Date('2026-10-01T10:00:00.000Z'),
    reference: null,
    notes: null,
    recordedByUserId: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    refunds: [],
    ...overrides,
  };
}

describe('PaymentsService', () => {
  let prisma: {
    payment: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    refund: { create: jest.Mock; findMany: jest.Mock };
    memberMembership: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let members: { findOneOrFail: jest.Mock; scopeFor: jest.Mock };
  let accounting: { postPaymentIncome: jest.Mock; postRefund: jest.Mock };
  let service: PaymentsService;

  beforeEach(() => {
    prisma = {
      payment: {
        create: jest.fn().mockResolvedValue(makePayment()),
        update: jest.fn().mockResolvedValue(makePayment()),
        findUnique: jest.fn().mockResolvedValue(makePayment()),
        findFirst: jest.fn().mockResolvedValue(makePayment()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      refund: {
        create: jest.fn().mockResolvedValue({ id: 'ref-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      memberMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mm-1', memberId: 'member-1' }),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.resolve([[], 0]),
    );

    members = {
      findOneOrFail: jest
        .fn()
        .mockResolvedValue({ id: 'member-1', user: { firstName: 'Mia', lastName: 'Member' } }),
      scopeFor: jest.fn().mockResolvedValue({ assignedTrainerId: 'trainer-1' }),
    };
    accounting = {
      postPaymentIncome: jest.fn().mockResolvedValue({}),
      postRefund: jest.fn().mockResolvedValue({}),
    };

    service = new PaymentsService(
      prisma as unknown as PrismaService,
      members as unknown as MembersService,
      accounting as unknown as AccountingService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('create', () => {
    const dto = {
      memberId: 'member-1',
      membershipId: 'mm-1',
      amount: 49.99,
      method: PaymentMethod.CASH,
    };

    it('writes the payment and its income entry inside one transaction', async () => {
      await service.create(dto, ADMIN);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.payment.create).toHaveBeenCalledTimes(1);
      expect(accounting.postPaymentIncome).toHaveBeenCalledTimes(1);
    });

    it('posts income through the transaction client, not a separate connection', async () => {
      await service.create(dto, ADMIN);
      expect(accounting.postPaymentIncome.mock.calls[0][0]).toBe(prisma);
    });

    it('posts income for exactly the amount received, linked to the payment', async () => {
      await service.create(dto, ADMIN);

      const posted = accounting.postPaymentIncome.mock.calls[0][1] as {
        amount: Prisma.Decimal;
        paymentId: string;
        method: PaymentMethod;
      };
      expect(posted.amount.toFixed(2)).toBe('49.99');
      expect(posted.paymentId).toBe('pay-1');
      expect(posted.method).toBe(PaymentMethod.CASH);
    });

    it('records who took the payment', async () => {
      await service.create(dto, ADMIN);

      const data = prisma.payment.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.recordedByUserId).toBe('admin-1');
    });

    it('defaults paidAt to now', async () => {
      await service.create({ ...dto, paidAt: undefined }, ADMIN);

      const data = prisma.payment.create.mock.calls[0][0].data as { paidAt: Date };
      expect(data.paidAt).toBeInstanceOf(Date);
    });

    it('accepts a payment with no membership, as other member income', async () => {
      await service.create({ ...dto, membershipId: undefined }, ADMIN);

      const data = prisma.payment.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.membershipId).toBeNull();
      expect(prisma.memberMembership.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a membership belonging to a different member', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue({
        id: 'mm-1',
        memberId: 'someone-else',
      });

      await expect(service.create(dto, ADMIN)).rejects.toThrow(/belongs to a different member/);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown membership', async () => {
      prisma.memberMembership.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, ADMIN)).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });

    it('does not post income when the member does not exist', async () => {
      members.findOneOrFail.mockRejectedValue(new Error('not found'));

      await expect(service.create(dto, ADMIN)).rejects.toThrow();
      expect(accounting.postPaymentIncome).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    it('posts the refund entry in the same transaction and marks the payment', async () => {
      await service.refund('pay-1', { amount: 20, reason: 'Goodwill' }, ADMIN);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(accounting.postRefund).toHaveBeenCalledTimes(1);
      expect(accounting.postRefund.mock.calls[0][0]).toBe(prisma);

      const update = prisma.payment.update.mock.calls[0][0].data as { status: PaymentStatus };
      expect(update.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    });

    it('marks a full refund as REFUNDED', async () => {
      await service.refund('pay-1', { amount: 50, reason: 'Cancelled' }, ADMIN);

      const update = prisma.payment.update.mock.calls[0][0].data as { status: PaymentStatus };
      expect(update.status).toBe(PaymentStatus.REFUNDED);
    });

    it('treats several partial refunds adding to the full amount as REFUNDED', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ refunds: [{ amount: new Prisma.Decimal('30.00') }] }),
      );

      await service.refund('pay-1', { amount: 20, reason: 'Rest' }, ADMIN);

      const update = prisma.payment.update.mock.calls[0][0].data as { status: PaymentStatus };
      expect(update.status).toBe(PaymentStatus.REFUNDED);
    });

    it('refuses to refund more than is left', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ refunds: [{ amount: new Prisma.Decimal('40.00') }] }),
      );

      await expect(
        service.refund('pay-1', { amount: 20, reason: 'Too much' }, ADMIN),
      ).rejects.toThrow(/exceeds the 10.00 still refundable/);
      expect(accounting.postRefund).not.toHaveBeenCalled();
    });

    it('refuses to refund an already fully refunded payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ refunds: [{ amount: new Prisma.Decimal('50.00') }] }),
      );

      await expect(service.refund('pay-1', { amount: 1, reason: 'Again' }, ADMIN)).rejects.toThrow(
        /already been refunded in full/,
      );
    });

    it('refunds by the original method unless told otherwise', async () => {
      await service.refund('pay-1', { amount: 10, reason: 'x' }, ADMIN);
      expect((prisma.refund.create.mock.calls[0][0].data as { method: PaymentMethod }).method).toBe(
        PaymentMethod.CASH,
      );

      prisma.refund.create.mockClear();
      await service.refund(
        'pay-1',
        { amount: 10, reason: 'x', method: PaymentMethod.TRANSFER },
        ADMIN,
      );
      expect((prisma.refund.create.mock.calls[0][0].data as { method: PaymentMethod }).method).toBe(
        PaymentMethod.TRANSFER,
      );
    });

    it('allows refunding the exact remaining amount', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        makePayment({ refunds: [{ amount: new Prisma.Decimal('49.99') }] }),
      );

      await expect(
        service.refund('pay-1', { amount: 0.01, reason: 'Final cent' }, ADMIN),
      ).resolves.toBeDefined();
    });
  });

  describe('scoping', () => {
    function filters(): Record<string, unknown>[] {
      return prisma.payment.findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];
    }

    it('places no restriction on an administrator', async () => {
      await service.findMany(query(), principal(UserRole.ADMIN));
      expect(filters()[0]).toEqual({});
    });

    it('restricts a member to their own payments', async () => {
      await service.findMany(query(), principal(UserRole.MEMBER));
      expect(filters()[0]).toEqual({ member: { userId: 'user-1' } });
    });

    it('shows a trainer nothing: money records are not their business', async () => {
      await service.findMany(query(), principal(UserRole.TRAINER));

      expect(filters()[0]).toEqual({ id: '00000000-0000-0000-0000-000000000000' });
      expect(members.scopeFor).not.toHaveBeenCalled();
    });

    it('reports an out-of-scope payment as not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneScoped('pay-9', principal(UserRole.MEMBER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });

    it('includes the whole of the `to` day in a date filter', async () => {
      await service.findMany(query({ to: '2026-10-31' }), principal(UserRole.ADMIN));

      const dateFilter = filters().find((f) => 'paidAt' in f) as { paidAt: { lt: Date } };
      expect(dateFilter.paidAt.lt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });
  });
});
