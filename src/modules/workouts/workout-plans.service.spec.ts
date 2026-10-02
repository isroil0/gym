import { Prisma, UserRole, UserStatus, WorkoutPlanStatus } from '@prisma/client';
import { WorkoutPlansService } from './workout-plans.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MemberAccessService } from './member-access.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { QueryWorkoutPlansDto } from './dto/workout-plan.dto';

function principal(role: UserRole): AuthenticatedUser {
  return { id: 'user-1', email: 'a@gym.test', role, status: UserStatus.ACTIVE };
}

function query(overrides: Partial<QueryWorkoutPlansDto> = {}): QueryWorkoutPlansDto {
  return { page: 1, limit: 20, skip: 0, take: 20, ...overrides };
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    memberId: 'member-1',
    trainerId: 'trainer-1',
    name: 'Autumn strength',
    status: WorkoutPlanStatus.ACTIVE,
    startDate: null,
    endDate: null,
    archivedAt: null,
    days: [],
    ...overrides,
  };
}

describe('WorkoutPlansService', () => {
  let prisma: {
    workoutPlan: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    workoutDay: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    workoutExercise: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let access: { assertCanManage: jest.Mock; readScope: jest.Mock; ownTrainerId: jest.Mock };
  let service: WorkoutPlansService;

  beforeEach(() => {
    prisma = {
      workoutPlan: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(makePlan()),
        findUnique: jest.fn().mockResolvedValue(makePlan()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makePlan()),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
      },
      workoutDay: {
        create: jest.fn().mockResolvedValue({ id: 'day-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      workoutExercise: {
        create: jest.fn().mockResolvedValue({ id: 'ex-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    access = {
      assertCanManage: jest.fn().mockResolvedValue(undefined),
      readScope: jest.fn().mockResolvedValue({ assignedTrainerId: 'trainer-1' }),
      ownTrainerId: jest.fn().mockResolvedValue('trainer-1'),
    };

    service = new WorkoutPlansService(
      prisma as unknown as PrismaService,
      access as unknown as MemberAccessService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('create', () => {
    const dto = { memberId: 'member-1', name: 'Autumn strength' };

    it('checks member access before writing anything', async () => {
      access.assertCanManage.mockRejectedValue(new Error('denied'));

      await expect(service.create(dto, principal(UserRole.TRAINER))).rejects.toThrow();
      expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
    });

    it('records the authoring trainer when a trainer writes the plan', async () => {
      const created = (await service.create(dto, principal(UserRole.TRAINER))) as unknown as Record<
        string,
        unknown
      >;

      expect(created.trainerId).toBe('trainer-1');
    });

    it('leaves the author unset when an administrator writes the plan', async () => {
      const created = (await service.create(dto, principal(UserRole.ADMIN))) as unknown as Record<
        string,
        unknown
      >;

      expect(created.trainerId).toBeNull();
      expect(access.ownTrainerId).not.toHaveBeenCalled();
    });

    it('stores dates as date-only values', async () => {
      const created = (await service.create(
        { ...dto, startDate: '2026-10-01', endDate: '2026-12-31' },
        principal(UserRole.ADMIN),
      )) as unknown as Record<string, Date>;

      expect(created.startDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(created.endDate.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    it('rejects an end date before the start date', async () => {
      await expect(
        service.create(
          { ...dto, startDate: '2026-12-01', endDate: '2026-10-01' },
          principal(UserRole.ADMIN),
        ),
      ).rejects.toThrow(/must not be earlier than startDate/);
    });
  });

  describe('scoping', () => {
    it('filters by the member read scope', async () => {
      await service.findMany(query(), principal(UserRole.TRAINER));

      const filters = prisma.workoutPlan.findMany.mock.calls[0][0].where.AND as unknown[];
      expect(filters[0]).toEqual({ member: { assignedTrainerId: 'trainer-1' } });
    });

    it('reports an out-of-scope plan as not found', async () => {
      prisma.workoutPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneScoped('plan-9', principal(UserRole.TRAINER)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });

    it('re-checks member access when changing plan content, not just the plan', async () => {
      access.assertCanManage.mockRejectedValue(new Error('denied'));

      await expect(
        service.addDay('plan-1', { dayOrder: 1, name: 'Push' }, principal(UserRole.TRAINER)),
      ).rejects.toThrow();
      expect(prisma.workoutDay.create).not.toHaveBeenCalled();
    });
  });

  describe('days', () => {
    it('refuses a day position already taken', async () => {
      prisma.workoutDay.findFirst.mockResolvedValue({ id: 'day-9', name: 'Pull day' });

      await expect(
        service.addDay('plan-1', { dayOrder: 1, name: 'Push' }, principal(UserRole.ADMIN)),
      ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('allows keeping the same position when renaming a day', async () => {
      prisma.workoutDay.findFirst.mockResolvedValue({ id: 'day-1', dayOrder: 1, name: 'Push' });

      await service.updateDay(
        'plan-1',
        'day-1',
        { dayOrder: 1, name: 'Push A' },
        principal(UserRole.ADMIN),
      );

      expect(prisma.workoutDay.update).toHaveBeenCalled();
    });

    it('rejects a day that belongs to a different plan', async () => {
      prisma.workoutDay.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDay('plan-1', 'day-9', { name: 'X' }, principal(UserRole.ADMIN)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('exercises', () => {
    beforeEach(() => {
      // The day lookup succeeds; the order-clash lookup is the second call.
      prisma.workoutDay.findFirst.mockResolvedValue({ id: 'day-1', dayOrder: 1 });
    });

    it('stores the load as a decimal and keeps the unit', async () => {
      await service.addExercise(
        'plan-1',
        'day-1',
        { exerciseOrder: 1, name: 'Bench', sets: 4, reps: '8-12', weight: 80, weightUnit: 'LB' },
        principal(UserRole.ADMIN),
      );

      const data = prisma.workoutExercise.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.weight).toBeInstanceOf(Prisma.Decimal);
      expect((data.weight as Prisma.Decimal).toFixed(2)).toBe('80.00');
      expect(data.weightUnit).toBe('LB');
    });

    it('leaves the load null when none is prescribed', async () => {
      await service.addExercise(
        'plan-1',
        'day-1',
        { exerciseOrder: 1, name: 'Plank', sets: 3, reps: '45s' },
        principal(UserRole.ADMIN),
      );

      const data = prisma.workoutExercise.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.weight).toBeNull();
      expect(data.weightUnit).toBeUndefined();
    });

    it('refuses a position already taken within the day', async () => {
      prisma.workoutExercise.findFirst.mockResolvedValue({ id: 'ex-9', name: 'Squat' });

      await expect(
        service.addExercise(
          'plan-1',
          'day-1',
          { exerciseOrder: 1, name: 'Bench', sets: 4, reps: '8' },
          principal(UserRole.ADMIN),
        ),
      ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('rejects an exercise that belongs to a different day', async () => {
      prisma.workoutExercise.findFirst.mockResolvedValue(null);

      await expect(
        service.removeExercise('plan-1', 'day-1', 'ex-9', principal(UserRole.ADMIN)),
      ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('archive / reactivate', () => {
    it('refuses to archive twice', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue(
        makePlan({ status: WorkoutPlanStatus.ARCHIVED }),
      );

      await expect(service.archive('plan-1', principal(UserRole.ADMIN))).rejects.toMatchObject({
        errorCode: 'CONFLICT',
      });
    });

    it('refuses to reactivate an active plan', async () => {
      await expect(service.reactivate('plan-1', principal(UserRole.ADMIN))).rejects.toMatchObject({
        errorCode: 'CONFLICT',
      });
    });

    it('clears the archive stamp on reactivation', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue(
        makePlan({ status: WorkoutPlanStatus.ARCHIVED, archivedAt: new Date() }),
      );

      await service.reactivate('plan-1', principal(UserRole.ADMIN));

      const data = prisma.workoutPlan.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.status).toBe(WorkoutPlanStatus.ACTIVE);
      expect(data.archivedAt).toBeNull();
    });
  });
});
