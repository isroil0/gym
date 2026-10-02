import {
  AccountingEntryType,
  IncomeSource,
  MembershipPlanStatus,
  MembershipStatus,
  PaymentMethod,
  Prisma,
  ProfileStatus,
  UserRole,
  UserStatus,
  type User,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { hash } from 'bcryptjs';
import type { TestContext } from './test-app';

export const TEST_PASSWORD = 'TestPass123';

export interface SeededUser {
  user: User;
  password: string;
}

export interface SignedInUser extends SeededUser {
  accessToken: string;
  refreshToken: string;
}

/** Creates a user directly in the database, bypassing the HTTP layer. */
export async function seedUser(
  ctx: TestContext,
  overrides: Partial<{
    email: string;
    password: string;
    role: UserRole;
    status: UserStatus;
    firstName: string;
    lastName: string;
  }> = {},
): Promise<SeededUser> {
  const role = overrides.role ?? UserRole.MEMBER;
  const password = overrides.password ?? TEST_PASSWORD;
  const email = (
    overrides.email ??
    `${role.toLowerCase()}-${Date.now()}-${Math.round(Math.random() * 1e6)}@gym.test`
  ).toLowerCase();

  const user = await ctx.prisma.user.create({
    data: {
      email,
      // Cost 4 matches BCRYPT_ROUNDS in .env.test; keeps the suite fast.
      passwordHash: await hash(password, 4),
      role,
      status: overrides.status ?? UserStatus.ACTIVE,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? role,
    },
  });

  return { user, password };
}

/** Logs a user in over HTTP and returns their tokens. */
export async function login(
  server: App,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

/** Seeds a user and signs them in. */
export async function seedAndLogin(
  ctx: TestContext,
  server: App,
  overrides: Parameters<typeof seedUser>[1] = {},
): Promise<SignedInUser> {
  const seeded = await seedUser(ctx, overrides);
  const tokens = await login(server, seeded.user.email, seeded.password);
  return { ...seeded, ...tokens };
}

export function bearer(accessToken: string): [string, string] {
  return ['Authorization', `Bearer ${accessToken}`];
}

/**
 * Creates a trainer account + profile directly in the database and signs in.
 * Returns the profile id alongside the tokens, which is what assignment and
 * scoping assertions need.
 */
export async function seedTrainerProfile(
  ctx: TestContext,
  server: App,
  overrides: { email?: string; firstName?: string; specialization?: string } = {},
): Promise<SignedInUser & { trainerId: string }> {
  const signedIn = await seedAndLogin(ctx, server, {
    role: UserRole.TRAINER,
    email: overrides.email,
    firstName: overrides.firstName,
  });

  const trainer = await ctx.prisma.trainer.create({
    data: { userId: signedIn.user.id, specialization: overrides.specialization ?? null },
  });

  return { ...signedIn, trainerId: trainer.id };
}

/** Creates a member account + profile directly in the database and signs in. */
export async function seedMemberProfile(
  ctx: TestContext,
  server: App,
  overrides: {
    email?: string;
    firstName?: string;
    assignedTrainerId?: string;
    notes?: string;
    status?: ProfileStatus;
  } = {},
): Promise<SignedInUser & { memberId: string }> {
  const signedIn = await seedAndLogin(ctx, server, {
    role: UserRole.MEMBER,
    email: overrides.email,
    firstName: overrides.firstName,
  });

  const member = await ctx.prisma.member.create({
    data: {
      userId: signedIn.user.id,
      notes: overrides.notes ?? null,
      status: overrides.status ?? ProfileStatus.ACTIVE,
      assignedTrainerId: overrides.assignedTrainerId ?? null,
      assignedAt: overrides.assignedTrainerId ? new Date() : null,
    },
  });

  return { ...signedIn, memberId: member.id };
}

/** Creates a membership plan directly in the database. */
export async function seedPlan(
  ctx: TestContext,
  overrides: {
    name?: string;
    durationDays?: number;
    price?: string;
    visitLimit?: number | null;
    status?: MembershipPlanStatus;
    displayOrder?: number;
  } = {},
) {
  return ctx.prisma.membershipPlan.create({
    data: {
      name: overrides.name ?? `Plan ${Math.round(Math.random() * 1e9)}`,
      durationDays: overrides.durationDays ?? 30,
      price: new Prisma.Decimal(overrides.price ?? '49.99'),
      visitLimit: overrides.visitLimit ?? null,
      status: overrides.status ?? MembershipPlanStatus.ACTIVE,
      displayOrder: overrides.displayOrder ?? 0,
    },
  });
}

/** ISO date (YYYY-MM-DD) offset from today, in UTC. */
export function isoDaysFromToday(offset: number): string {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(utcMidnight + offset * 86_400_000).toISOString().slice(0, 10);
}

/** Creates a membership directly in the database, bypassing the HTTP layer. */
export async function seedMembership(
  ctx: TestContext,
  memberId: string,
  planId: string,
  overrides: {
    startDate?: Date;
    endDate?: Date;
    status?: MembershipStatus;
    purchasePrice?: string;
    visitLimit?: number | null;
    visitsUsed?: number;
    frozenAt?: Date | null;
  } = {},
) {
  const start = overrides.startDate ?? new Date(`${isoDaysFromToday(0)}T00:00:00.000Z`);
  const end = overrides.endDate ?? new Date(`${isoDaysFromToday(29)}T00:00:00.000Z`);

  return ctx.prisma.memberMembership.create({
    data: {
      memberId,
      planId,
      purchasePrice: new Prisma.Decimal(overrides.purchasePrice ?? '49.99'),
      visitLimit: overrides.visitLimit ?? null,
      visitsUsed: overrides.visitsUsed ?? 0,
      startDate: start,
      endDate: end,
      status: overrides.status ?? MembershipStatus.ACTIVE,
      frozenAt: overrides.frozenAt ?? null,
    },
  });
}

/** Creates an expense category directly in the database. */
export async function seedExpenseCategory(
  ctx: TestContext,
  overrides: { name?: string; archived?: boolean } = {},
) {
  return ctx.prisma.expenseCategory.create({
    data: {
      name: overrides.name ?? `Category ${Math.round(Math.random() * 1e9)}`,
      archivedAt: overrides.archived ? new Date() : null,
    },
  });
}

/** Creates a payment plus its automatic income entry, as the service would. */
export async function seedPayment(
  ctx: TestContext,
  memberId: string,
  overrides: {
    membershipId?: string | null;
    amount?: string;
    method?: PaymentMethod;
    paidAt?: Date;
  } = {},
) {
  const amount = new Prisma.Decimal(overrides.amount ?? '49.99');
  const paidAt = overrides.paidAt ?? new Date();
  const method = overrides.method ?? PaymentMethod.CASH;

  return ctx.prisma.payment.create({
    data: {
      memberId,
      membershipId: overrides.membershipId ?? null,
      amount,
      method,
      paidAt,
      ledgerEntries: {
        create: {
          type: AccountingEntryType.INCOME,
          amount,
          occurredOn: new Date(paidAt.toISOString().slice(0, 10)),
          description: 'Seeded payment',
          incomeSource: IncomeSource.MEMBERSHIP_PAYMENT,
          method,
          isAutomatic: true,
        },
      },
    },
  });
}

/**
 * Creates a ledger entry directly.
 *
 * An EXPENSE is given a category when none is supplied: the application always
 * sets one, and a check constraint now enforces it, so a helper that omitted it
 * would be fabricating a state the system cannot reach.
 */
export async function seedLedgerEntry(
  ctx: TestContext,
  overrides: {
    type?: AccountingEntryType;
    amount?: string;
    occurredOn?: string;
    description?: string;
    expenseCategoryId?: string;
    isAutomatic?: boolean;
    voided?: boolean;
  } = {},
) {
  const type = overrides.type ?? AccountingEntryType.EXPENSE;

  const expenseCategoryId =
    type === AccountingEntryType.EXPENSE
      ? (overrides.expenseCategoryId ?? (await seedExpenseCategory(ctx)).id)
      : null;

  return ctx.prisma.accountingEntry.create({
    data: {
      type,
      amount: new Prisma.Decimal(overrides.amount ?? '100.00'),
      occurredOn: new Date(`${overrides.occurredOn ?? isoDaysFromToday(0)}T00:00:00.000Z`),
      description: overrides.description ?? 'Seeded entry',
      expenseCategoryId,
      incomeSource: type === AccountingEntryType.INCOME ? IncomeSource.OTHER : null,
      isAutomatic: overrides.isAutomatic ?? false,
      voidedAt: overrides.voided ? new Date() : null,
    },
  });
}
