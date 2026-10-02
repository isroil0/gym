import { AccountingEntryType, PaymentMethod, UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  bearer,
  isoDaysFromToday,
  seedAndLogin,
  seedExpenseCategory,
  seedLedgerEntry,
  seedMemberProfile,
  seedMembership,
  seedPlan,
  seedTrainerProfile,
  type SignedInUser,
} from './utils/auth';

describe('Accounting (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    admin = await seedAndLogin(ctx, server, { role: UserRole.ADMIN });
  });

  const asAdmin = () => bearer(admin.accessToken);

  describe('expense categories', () => {
    it('creates, lists, renames and archives a category', async () => {
      const created = await request(server)
        .post('/api/v1/accounting/expense-categories')
        .set(...asAdmin())
        .send({ name: 'Rent', description: 'Premises rent' })
        .expect(201);

      expect(created.body.name).toBe('Rent');
      expect(created.body.archived).toBe(false);

      const renamed = await request(server)
        .patch(`/api/v1/accounting/expense-categories/${created.body.id}`)
        .set(...asAdmin())
        .send({ name: 'Rent & utilities' })
        .expect(200);
      expect(renamed.body.name).toBe('Rent & utilities');

      const archived = await request(server)
        .post(`/api/v1/accounting/expense-categories/${created.body.id}/archive`)
        .set(...asAdmin())
        .expect(200);
      expect(archived.body.archived).toBe(true);
    });

    it('hides archived categories by default and shows them on request', async () => {
      await seedExpenseCategory(ctx, { name: 'Active one' });
      await seedExpenseCategory(ctx, { name: 'Retired one', archived: true });

      const active = await request(server)
        .get('/api/v1/accounting/expense-categories')
        .set(...asAdmin())
        .expect(200);
      expect(active.body.meta.total).toBe(1);

      const all = await request(server)
        .get('/api/v1/accounting/expense-categories')
        .query({ includeArchived: true })
        .set(...asAdmin())
        .expect(200);
      expect(all.body.meta.total).toBe(2);
    });

    it('rejects a duplicate name', async () => {
      await seedExpenseCategory(ctx, { name: 'Rent' });

      await request(server)
        .post('/api/v1/accounting/expense-categories')
        .set(...asAdmin())
        .send({ name: 'Rent' })
        .expect(409);
    });

    it('refuses an expense against an archived category but keeps its history', async () => {
      const category = await seedExpenseCategory(ctx, { name: 'Old thing' });
      await seedLedgerEntry(ctx, { expenseCategoryId: category.id, amount: '100.00' });

      await request(server)
        .post(`/api/v1/accounting/expense-categories/${category.id}/archive`)
        .set(...asAdmin())
        .expect(200);

      const res = await request(server)
        .post('/api/v1/accounting/entries')
        .set(...asAdmin())
        .send({
          type: AccountingEntryType.EXPENSE,
          amount: 50,
          occurredOn: isoDaysFromToday(0),
          description: 'Late expense',
          expenseCategoryId: category.id,
        })
        .expect(422);
      expect(res.body.message).toMatch(/archived and cannot take new expenses/);

      // The earlier entry survives.
      const entries = await request(server)
        .get('/api/v1/accounting/entries')
        .query({ expenseCategoryId: category.id })
        .set(...asAdmin())
        .expect(200);
      expect(entries.body.meta.total).toBe(1);
    });

    it('allows expenses again once the category is reactivated', async () => {
      const category = await seedExpenseCategory(ctx, { archived: true });

      await request(server)
        .post(`/api/v1/accounting/expense-categories/${category.id}/reactivate`)
        .set(...asAdmin())
        .expect(200);

      await request(server)
        .post('/api/v1/accounting/entries')
        .set(...asAdmin())
        .send({
          type: AccountingEntryType.EXPENSE,
          amount: 50,
          occurredOn: isoDaysFromToday(0),
          description: 'Allowed now',
          expenseCategoryId: category.id,
        })
        .expect(201);
    });
  });

  describe('manual entries', () => {
    let category: Awaited<ReturnType<typeof seedExpenseCategory>>;

    beforeEach(async () => {
      category = await seedExpenseCategory(ctx, { name: 'Rent' });
    });

    const entry = (body: Record<string, unknown>) =>
      request(server)
        .post('/api/v1/accounting/entries')
        .set(...asAdmin())
        .send(body);

    it('records a categorised expense and names who entered it', async () => {
      const res = await entry({
        type: AccountingEntryType.EXPENSE,
        amount: 1200.5,
        occurredOn: isoDaysFromToday(0),
        description: 'October rent',
        expenseCategoryId: category.id,
        method: PaymentMethod.TRANSFER,
      }).expect(201);

      expect(res.body.amount).toBe('1200.50');
      expect(res.body.expenseCategoryName).toBe('Rent');
      expect(res.body.isAutomatic).toBe(false);
      expect(res.body.recordedBy).toBeTruthy();
      expect(res.body.incomeSource).toBeNull();
    });

    it('records manual income as OTHER rather than a membership payment', async () => {
      const res = await entry({
        type: AccountingEntryType.INCOME,
        amount: 40,
        occurredOn: isoDaysFromToday(0),
        description: 'Towel sales',
      }).expect(201);

      expect(res.body.incomeSource).toBe('OTHER');
      expect(res.body.expenseCategoryId).toBeNull();
    });

    it('requires a category on an expense and forbids one on income', async () => {
      // Both are field-combination problems, so both are 422 — not one 400 and
      // one 422 for what is conceptually the same class of mistake.
      const missing = await entry({
        type: AccountingEntryType.EXPENSE,
        amount: 50,
        occurredOn: isoDaysFromToday(0),
        description: 'Uncategorised',
      }).expect(422);
      expect(missing.body.message).toMatch(/requires an expense category/);

      const misplaced = await entry({
        type: AccountingEntryType.INCOME,
        amount: 50,
        occurredOn: isoDaysFromToday(0),
        description: 'Income with a category',
        expenseCategoryId: category.id,
      }).expect(422);
      expect(misplaced.body.message).toMatch(/Income cannot be assigned an expense category/);
    });

    it('still rejects a malformed category id as a validation error', async () => {
      await entry({
        type: AccountingEntryType.EXPENSE,
        amount: 50,
        occurredOn: isoDaysFromToday(0),
        description: 'Bad id',
        expenseCategoryId: 'not-a-uuid',
      }).expect(400);
    });

    it('refuses to hand-enter a REFUND', async () => {
      await entry({
        type: AccountingEntryType.REFUND,
        amount: 50,
        occurredOn: isoDaysFromToday(0),
        description: 'Should not be possible',
      }).expect(400);
    });

    it('attributes an expense to a trainer, which is how a salary is recorded', async () => {
      const trainer = await seedTrainerProfile(ctx, server, { firstName: 'Tina' });

      const res = await entry({
        type: AccountingEntryType.EXPENSE,
        amount: 2500,
        occurredOn: isoDaysFromToday(0),
        description: 'Tina October salary',
        expenseCategoryId: category.id,
        trainerId: trainer.trainerId,
      }).expect(201);

      expect(res.body.trainerId).toBe(trainer.trainerId);
      expect(res.body.trainerName).toContain('Tina');
    });

    it('refuses to attribute income to a trainer', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await entry({
        type: AccountingEntryType.INCOME,
        amount: 100,
        occurredOn: isoDaysFromToday(0),
        description: 'Not a payout',
        trainerId: trainer.trainerId,
      }).expect(422);
    });

    it.each([
      ['a zero amount', { amount: 0 }],
      ['a negative amount', { amount: -5 }],
      ['three decimal places', { amount: 1.234 }],
      ['a non-ISO date', { occurredOn: '01/10/2026' }],
    ])('rejects %s', async (_label, override) => {
      await entry({
        type: AccountingEntryType.EXPENSE,
        amount: 10,
        occurredOn: isoDaysFromToday(0),
        description: 'Test',
        expenseCategoryId: category.id,
        ...override,
      }).expect(400);
    });
  });

  describe('voiding', () => {
    it('voids a manual entry and removes it from the totals, without deleting it', async () => {
      const category = await seedExpenseCategory(ctx);
      const created = await request(server)
        .post('/api/v1/accounting/entries')
        .set(...asAdmin())
        .send({
          type: AccountingEntryType.EXPENSE,
          amount: 99,
          occurredOn: isoDaysFromToday(0),
          description: 'Mistake',
          expenseCategoryId: category.id,
        })
        .expect(201);

      const before = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);
      expect(before.body.expenses).toBe('99.00');

      const voided = await request(server)
        .post(`/api/v1/accounting/entries/${created.body.id}/void`)
        .set(...asAdmin())
        .send({ reason: 'Wrong amount' })
        .expect(200);
      expect(voided.body.voided).toBe(true);
      expect(voided.body.voidedReason).toBe('Wrong amount');

      const after = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);
      expect(after.body.expenses).toBe('0.00');

      // Still there, still auditable.
      expect(await ctx.prisma.accountingEntry.count()).toBe(1);
    });

    it('refuses to void an entry generated by a payment', async () => {
      const member = await seedMemberProfile(ctx, server);
      const plan = await seedPlan(ctx);
      const membership = await seedMembership(ctx, member.memberId, plan.id);

      const payment = await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: member.memberId,
          membershipId: membership.id,
          amount: 49.99,
          method: PaymentMethod.CASH,
        })
        .expect(201);

      const entry = await ctx.prisma.accountingEntry.findFirstOrThrow({
        where: { paymentId: payment.body.id },
      });

      const res = await request(server)
        .post(`/api/v1/accounting/entries/${entry.id}/void`)
        .set(...asAdmin())
        .send({ reason: 'Trying anyway' })
        .expect(422);

      expect(res.body.message).toMatch(/cannot be voided/);
    });

    it('refuses to void twice', async () => {
      const entry = await seedLedgerEntry(ctx);

      await request(server)
        .post(`/api/v1/accounting/entries/${entry.id}/void`)
        .set(...asAdmin())
        .send({ reason: 'First' })
        .expect(200);
      await request(server)
        .post(`/api/v1/accounting/entries/${entry.id}/void`)
        .set(...asAdmin())
        .send({ reason: 'Second' })
        .expect(409);
    });

    it('requires a reason to void', async () => {
      const entry = await seedLedgerEntry(ctx);

      await request(server)
        .post(`/api/v1/accounting/entries/${entry.id}/void`)
        .set(...asAdmin())
        .send({})
        .expect(400);
    });
  });

  describe('totals', () => {
    let category: Awaited<ReturnType<typeof seedExpenseCategory>>;

    beforeEach(async () => {
      category = await seedExpenseCategory(ctx, { name: 'Rent' });

      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.INCOME,
        amount: '1000.00',
        occurredOn: isoDaysFromToday(0),
      });
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.REFUND,
        amount: '150.00',
        occurredOn: isoDaysFromToday(0),
      });
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.EXPENSE,
        amount: '400.00',
        occurredOn: isoDaysFromToday(0),
        expenseCategoryId: category.id,
      });
    });

    it('computes revenue as income less refunds, and profit as revenue less expenses', async () => {
      const res = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.income).toBe('1000.00');
      expect(res.body.refunds).toBe('150.00');
      expect(res.body.revenue).toBe('850.00');
      expect(res.body.expenses).toBe('400.00');
      expect(res.body.profit).toBe('450.00');
    });

    it('breaks expenses down by category', async () => {
      const res = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.expensesByCategory).toEqual([
        { expenseCategoryId: category.id, expenseCategoryName: 'Rent', amount: '400.00' },
      ]);
    });

    it('reports a loss as a negative profit', async () => {
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.EXPENSE,
        amount: '5000.00',
        occurredOn: isoDaysFromToday(0),
        expenseCategoryId: category.id,
      });

      const res = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.profit).toBe('-4550.00');
    });

    it('excludes entries outside the range', async () => {
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.INCOME,
        amount: '999.00',
        occurredOn: isoDaysFromToday(-10),
      });

      const res = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.income).toBe('1000.00');
    });

    it('excludes voided entries', async () => {
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.INCOME,
        amount: '500.00',
        occurredOn: isoDaysFromToday(0),
        voided: true,
      });

      const res = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.income).toBe('1000.00');
    });

    it('is all zeroes for a period with nothing in it', async () => {
      const res = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(-30), to: isoDaysFromToday(-20) })
        .set(...asAdmin())
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          income: '0.00',
          refunds: '0.00',
          revenue: '0.00',
          expenses: '0.00',
          profit: '0.00',
        }),
      );
    });

    it('rejects a range that ends before it starts', async () => {
      await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(-5) })
        .set(...asAdmin())
        .expect(422);
    });

    it('requires both ends of the range', async () => {
      await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(400);
    });

    it('reports per-day totals', async () => {
      await seedLedgerEntry(ctx, {
        type: AccountingEntryType.INCOME,
        amount: '60.00',
        occurredOn: isoDaysFromToday(-1),
      });

      const res = await request(server)
        .get('/api/v1/accounting/daily')
        .query({ from: isoDaysFromToday(-1), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toEqual(
        expect.objectContaining({ date: isoDaysFromToday(-1), income: '60.00', profit: '60.00' }),
      );
      expect(res.body[1]).toEqual(
        expect.objectContaining({ date: isoDaysFromToday(0), revenue: '850.00', profit: '450.00' }),
      );
    });

    it('reports per-month totals for a year', async () => {
      const year = Number.parseInt(isoDaysFromToday(0).slice(0, 4), 10);

      const res = await request(server)
        .get('/api/v1/accounting/monthly')
        .query({ year })
        .set(...asAdmin())
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const month = isoDaysFromToday(0).slice(0, 7);
      const bucket = (res.body as Array<{ date: string }>).find((row) => row.date === month);
      expect(bucket).toBeDefined();
    });

    it('splits income and refunds by payment method', async () => {
      const member = await seedMemberProfile(ctx, server);
      const plan = await seedPlan(ctx);
      const membership = await seedMembership(ctx, member.memberId, plan.id);

      const payment = await request(server)
        .post('/api/v1/payments')
        .set(...asAdmin())
        .send({
          memberId: member.memberId,
          membershipId: membership.id,
          amount: 30,
          method: PaymentMethod.CARD,
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/payments/${payment.body.id}/refund`)
        .set(...asAdmin())
        .send({ amount: 10, reason: 'Partial' })
        .expect(200);

      const res = await request(server)
        .get('/api/v1/accounting/summary')
        .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0) })
        .set(...asAdmin())
        .expect(200);

      const card = (
        res.body.byPaymentMethod as Array<{ method: string; income: string; refunds: string }>
      ).find((row) => row.method === PaymentMethod.CARD);
      expect(card).toEqual({ method: PaymentMethod.CARD, income: '30.00', refunds: '10.00' });
    });
  });

  describe('authorization', () => {
    it.each([
      ['get', '/api/v1/accounting/entries'],
      ['get', '/api/v1/accounting/expense-categories'],
      ['post', '/api/v1/accounting/entries'],
      ['post', '/api/v1/accounting/expense-categories'],
    ])('%s %s is ADMIN only', async (method, path) => {
      const trainer = await seedTrainerProfile(ctx, server);
      const member = await seedMemberProfile(ctx, server);

      for (const token of [trainer.accessToken, member.accessToken]) {
        const res = await request(server)
          [method as 'get' | 'post'](path)
          .set(...bearer(token))
          .send({});
        expect(res.status).toBe(403);
      }
    });

    it('summary, daily and monthly are ADMIN only', async () => {
      const member = await seedMemberProfile(ctx, server);

      for (const path of ['summary', 'daily', 'monthly']) {
        await request(server)
          .get(`/api/v1/accounting/${path}`)
          .query({ from: isoDaysFromToday(0), to: isoDaysFromToday(0), year: 2026 })
          .set(...bearer(member.accessToken))
          .expect(403);
      }
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/accounting/entries').expect(401);
    });
  });
});
