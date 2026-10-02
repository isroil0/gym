import { TrainingSessionStatus, UserRole, UserStatus } from '@prisma/client';
import { TrainingSessionsService } from './training-sessions.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MemberAccessService } from './member-access.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { QueryTrainingSessionsDto } from './dto/training-session.dto';

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

function query(overrides: Partial<QueryTrainingSessionsDto> = {}): QueryTrainingSessionsDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    trainerId: 'trainer-1',
    memberId: 'member-1',
    startsAt: new Date('2026-10-20T09:00:00.000Z'),
    endsAt: new Date('2026-10-20T10:00:00.000Z'),
    status: TrainingSessionStatus.SCHEDULED,
    ...overrides,
  };
}

describe('TrainingSessionsService', () => {
  let prisma: {
    trainingSession: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    trainer: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { assertCanManage: jest.Mock; readScope: jest.Mock; ownTrainerId: jest.Mock };
  let service: TrainingSessionsService;

  const dto = {
    memberId: 'member-1',
    startsAt: '2026-10-20T09:00:00.000Z',
    endsAt: '2026-10-20T10:00:00.000Z',
  };

  beforeEach(() => {
    prisma = {
      trainingSession: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(makeSession()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
      },
      trainer: { findUnique: jest.fn().mockResolvedValue({ id: 'trainer-2' }) },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    access = {
      assertCanManage: jest.fn().mockResolvedValue(undefined),
      readScope: jest.fn().mockResolvedValue({ assignedTrainerId: 'trainer-1' }),
      ownTrainerId: jest.fn().mockResolvedValue('trainer-1'),
    };

    service = new TrainingSessionsService(
      prisma as unknown as PrismaService,
      access as unknown as MemberAccessService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('booking', () => {
    it('books a trainer as themselves', async () => {
      const created = (await service.create(dto, principal(UserRole.TRAINER))) as unknown as Record<
        string,
        unknown
      >;

      expect(created.trainerId).toBe('trainer-1');
    });

    it("refuses a trainer booking into a colleague's diary", async () => {
      await expect(
        service.create({ ...dto, trainerId: 'trainer-2' }, principal(UserRole.TRAINER)),
      ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
    });

    it('accepts a trainer naming their own id explicitly', async () => {
      await expect(
        service.create({ ...dto, trainerId: 'trainer-1' }, principal(UserRole.TRAINER)),
      ).resolves.toBeDefined();
    });

    it('requires an administrator to name the trainer', async () => {
      await expect(service.create(dto, principal(UserRole.ADMIN))).rejects.toThrow(
        /trainerId is required/,
      );
    });

    it('rejects an unknown trainer named by an administrator', async () => {
      prisma.trainer.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...dto, trainerId: 'ghost' }, principal(UserRole.ADMIN)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });

    it('rejects a trainer account with no profile', async () => {
      access.ownTrainerId.mockResolvedValue(null);

      await expect(service.create(dto, principal(UserRole.TRAINER))).rejects.toMatchObject({
        errorCode: 'NOT_FOUND',
      });
    });

    it('checks member access before the slot', async () => {
      access.assertCanManage.mockRejectedValue(new Error('denied'));

      await expect(service.create(dto, principal(UserRole.TRAINER))).rejects.toThrow();
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a zero-length window', '2026-10-20T09:00:00.000Z', 'endsAt must be after startsAt'],
      ['an inverted window', '2026-10-20T08:00:00.000Z', 'endsAt must be after startsAt'],
      ['an implausibly short window', '2026-10-20T09:02:00.000Z', 'at least 5 minutes'],
    ])('refuses %s', async (_label, endsAt, message) => {
      await expect(service.create({ ...dto, endsAt }, principal(UserRole.TRAINER))).rejects.toThrow(
        new RegExp(message),
      );
    });

    it('refuses a slot that clashes for the trainer', async () => {
      prisma.trainingSession.findFirst.mockResolvedValueOnce({
        startsAt: new Date('2026-10-20T09:30:00.000Z'),
        endsAt: new Date('2026-10-20T10:30:00.000Z'),
      });

      await expect(service.create(dto, principal(UserRole.TRAINER))).rejects.toThrow(
        /trainer already has a session/,
      );
    });

    it('refuses a slot that clashes for the member', async () => {
      prisma.trainingSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        startsAt: new Date('2026-10-20T09:30:00.000Z'),
        endsAt: new Date('2026-10-20T10:30:00.000Z'),
      });

      await expect(service.create(dto, principal(UserRole.TRAINER))).rejects.toThrow(
        /member already has a session/,
      );
    });

    it('looks for clashes with half-open bounds, so back-to-back is free', async () => {
      await service.create(dto, principal(UserRole.TRAINER));

      const where = prisma.trainingSession.findFirst.mock.calls[0][0].where as {
        startsAt: { lt: Date };
        endsAt: { gt: Date };
      };
      expect(where.startsAt.lt.toISOString()).toBe('2026-10-20T10:00:00.000Z');
      expect(where.endsAt.gt.toISOString()).toBe('2026-10-20T09:00:00.000Z');
    });

    it('treats only scheduled and completed sessions as occupying the slot', async () => {
      await service.create(dto, principal(UserRole.TRAINER));

      const where = prisma.trainingSession.findFirst.mock.calls[0][0].where as {
        status: { in: TrainingSessionStatus[] };
      };
      expect(where.status.in).toEqual([
        TrainingSessionStatus.SCHEDULED,
        TrainingSessionStatus.COMPLETED,
      ]);
    });
  });

  describe('transitions', () => {
    it('stamps completion', async () => {
      await service.complete('session-1', { trainerNotes: 'Hit 95kg' }, principal(UserRole.ADMIN));

      const data = prisma.trainingSession.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.status).toBe(TrainingSessionStatus.COMPLETED);
      expect(data.completedAt).toBeInstanceOf(Date);
      expect(data.trainerNotes).toBe('Hit 95kg');
    });

    it('records the cancellation reason', async () => {
      await service.cancel('session-1', { reason: 'Member unwell' }, principal(UserRole.ADMIN));

      const data = prisma.trainingSession.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.status).toBe(TrainingSessionStatus.CANCELLED);
      expect(data.cancellationReason).toBe('Member unwell');
    });

    it('marks a no-show without a cancellation stamp, since the time was used', async () => {
      await service.markNoShow('session-1', principal(UserRole.ADMIN));

      const data = prisma.trainingSession.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.status).toBe(TrainingSessionStatus.NO_SHOW);
      expect(data.cancelledAt).toBeUndefined();
    });

    it.each([
      TrainingSessionStatus.COMPLETED,
      TrainingSessionStatus.CANCELLED,
      TrainingSessionStatus.NO_SHOW,
    ])('refuses every change once a session is %s, all as a conflict', async (status) => {
      prisma.trainingSession.findUnique.mockResolvedValue(makeSession({ status }));

      for (const attempt of [
        () => service.complete('session-1', {}, principal(UserRole.ADMIN)),
        () => service.cancel('session-1', {}, principal(UserRole.ADMIN)),
        () => service.markNoShow('session-1', principal(UserRole.ADMIN)),
        () =>
          service.reschedule(
            'session-1',
            { startsAt: '2026-10-21T09:00:00.000Z' },
            principal(UserRole.ADMIN),
          ),
      ]) {
        await expect(attempt()).rejects.toMatchObject({ errorCode: 'CONFLICT' });
      }
    });

    it('re-checks the slot only when the times change', async () => {
      await service.reschedule('session-1', { location: 'Studio 1' }, principal(UserRole.ADMIN));
      expect(prisma.trainingSession.findFirst).not.toHaveBeenCalled();

      await service.reschedule(
        'session-1',
        { startsAt: '2026-10-21T09:00:00.000Z' },
        principal(UserRole.ADMIN),
      );
      expect(prisma.trainingSession.findFirst).toHaveBeenCalled();
    });

    it('keeps the original length when only the start moves', async () => {
      // The fixture session is 09:00-10:00; moving it to 14:00 must end at 15:00
      // rather than leaving a window that ends before it begins.
      await service.reschedule(
        'session-1',
        { startsAt: '2026-10-20T14:00:00.000Z' },
        principal(UserRole.ADMIN),
      );

      const data = prisma.trainingSession.update.mock.calls[0][0].data as {
        startsAt: Date;
        endsAt: Date;
      };
      expect(data.startsAt.toISOString()).toBe('2026-10-20T14:00:00.000Z');
      expect(data.endsAt.toISOString()).toBe('2026-10-20T15:00:00.000Z');
    });

    it('moves a session to another day without needing both ends', async () => {
      await service.reschedule(
        'session-1',
        { startsAt: '2026-10-27T09:00:00.000Z' },
        principal(UserRole.ADMIN),
      );

      const data = prisma.trainingSession.update.mock.calls[0][0].data as { endsAt: Date };
      expect(data.endsAt.toISOString()).toBe('2026-10-27T10:00:00.000Z');
    });

    it('honours an explicit end that shortens the session', async () => {
      await service.reschedule(
        'session-1',
        { endsAt: '2026-10-20T09:30:00.000Z' },
        principal(UserRole.ADMIN),
      );

      const data = prisma.trainingSession.update.mock.calls[0][0].data as { endsAt: Date };
      expect(data.endsAt.toISOString()).toBe('2026-10-20T09:30:00.000Z');
    });

    it('excludes the session being moved from its own clash check', async () => {
      await service.reschedule(
        'session-1',
        { startsAt: '2026-10-20T09:30:00.000Z', endsAt: '2026-10-20T10:30:00.000Z' },
        principal(UserRole.ADMIN),
      );

      const where = prisma.trainingSession.findFirst.mock.calls[0][0].where as {
        id: { not: string };
      };
      expect(where.id).toEqual({ not: 'session-1' });
    });

    it("hides another trainer's session from a trainer, as not found", async () => {
      prisma.trainingSession.findUnique.mockResolvedValue(makeSession({ trainerId: 'trainer-9' }));

      await expect(
        service.cancel('session-1', {}, principal(UserRole.TRAINER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('reads', () => {
    it('scopes the list by member visibility', async () => {
      await service.findMany(query(), principal(UserRole.TRAINER));

      const filters = prisma.trainingSession.findMany.mock.calls[0][0].where.AND as unknown[];
      expect(filters[0]).toEqual({ member: { assignedTrainerId: 'trainer-1' } });
    });

    it('keys a trainer schedule on the trainer, not on their member list', async () => {
      await service.scheduleForTrainer('trainer-1', query());

      const filters = prisma.trainingSession.findMany.mock.calls[0][0].where.AND as unknown[];
      expect(filters[0]).toEqual({ trainerId: 'trainer-1' });
    });

    it('treats a bare `to` date as the end of that day', async () => {
      await service.scheduleForTrainer('trainer-1', query({ to: '2026-10-31' }));

      const filters = prisma.trainingSession.findMany.mock.calls[0][0].where.AND as Array<{
        startsAt?: { lte: Date };
      }>;
      const bound = filters.find((f) => f.startsAt)?.startsAt?.lte;
      expect(bound?.toISOString()).toBe('2026-10-31T23:59:59.999Z');
    });

    it('uses an exact instant when `to` carries a time', async () => {
      await service.scheduleForTrainer('trainer-1', query({ to: '2026-10-31T12:00:00.000Z' }));

      const filters = prisma.trainingSession.findMany.mock.calls[0][0].where.AND as Array<{
        startsAt?: { lte: Date };
      }>;
      expect(filters.find((f) => f.startsAt)?.startsAt?.lte.toISOString()).toBe(
        '2026-10-31T12:00:00.000Z',
      );
    });

    it('reports an out-of-scope session as not found', async () => {
      prisma.trainingSession.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneScoped('session-9', principal(UserRole.MEMBER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });
});
