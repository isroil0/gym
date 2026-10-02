import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';
import {
  bearer,
  seedAndLogin,
  seedMemberProfile,
  seedMembership,
  seedPlan,
  seedTrainerProfile,
  type SignedInUser,
} from './utils/auth';

function denialReason(body: { details?: Array<{ field: string; messages: string[] }> }): string {
  return body.details?.[0]?.messages[0] ?? '';
}

describe('QR membership cards (e2e)', () => {
  let ctx: TestContext;
  let server: App;
  let admin: SignedInUser;
  let member: Awaited<ReturnType<typeof seedMemberProfile>>;

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
    member = await seedMemberProfile(ctx, server, { email: 'mia@gym.test' });
    const plan = await seedPlan(ctx, { name: 'Unlimited' });
    await seedMembership(ctx, member.memberId, plan.id);
  });

  const asAdmin = () => bearer(admin.accessToken);

  const card = () =>
    request(server)
      .get(`/api/v1/membership-cards/members/${member.memberId}`)
      .set(...asAdmin());

  const scanIn = (token: string) =>
    request(server)
      .post('/api/v1/attendance/check-in/qr')
      .set(...asAdmin())
      .send({ token });

  describe('issuing', () => {
    it('issues a card on first request and returns a scannable token', async () => {
      const res = await card().expect(200);

      expect(res.body.version).toBe(1);
      expect(res.body.active).toBe(true);
      expect(res.body.memberCode).toMatch(/^M-\d{6}$/);
      expect(res.body.memberName).toBeTruthy();
      expect(res.body.token.split('.')).toHaveLength(4);
      expect(res.body.token.startsWith('GYM1.')).toBe(true);
      expect(res.body.revokedAt).toBeNull();
      expect(res.body.lastUsedAt).toBeNull();
    });

    it('returns the same token on a second request, so it can be re-displayed', async () => {
      const first = await card().expect(200);
      const second = await card().expect(200);

      expect(second.body.token).toBe(first.body.token);
      expect(second.body.id).toBe(first.body.id);
      expect(await ctx.prisma.membershipCard.count()).toBe(1);
    });

    it('stores no replayable secret', async () => {
      const res = await card().expect(200);

      const stored = await ctx.prisma.membershipCard.findUniqueOrThrow({
        where: { memberId: member.memberId },
      });
      const columns = JSON.stringify(stored);

      // The signature exists nowhere in the row — it is derived on demand.
      expect(columns).not.toContain(res.body.token.split('.')[3]);
    });

    it('issues distinct cards to different members', async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });

      const mine = await card().expect(200);
      const theirs = await request(server)
        .get(`/api/v1/membership-cards/members/${other.memberId}`)
        .set(...asAdmin())
        .expect(200);

      expect(theirs.body.token).not.toBe(mine.body.token);
    });

    it('rejects an unknown member', async () => {
      await request(server)
        .get('/api/v1/membership-cards/members/0b5f8a2e-0000-4000-8000-000000000000')
        .set(...asAdmin())
        .expect(404);
    });
  });

  describe('scanning', () => {
    it('admits a member with a valid current card and stamps its last use', async () => {
      const token = (await card().expect(200)).body.token as string;

      const res = await scanIn(token).expect(201);
      expect(res.body.admitted).toBe(true);
      expect(res.body.attendance.method).toBe('QR');

      const reloaded = await card().expect(200);
      expect(reloaded.body.lastUsedAt).not.toBeNull();
    });

    it.each([
      ['a tampered signature', (t: string) => `${t.slice(0, -4)}dead`],
      [
        'a swapped member id',
        (t: string) => t.replace(t.split('.')[1], '0b5f8a2e-9999-4000-8000-000000009999'),
      ],
      ['a bumped version', (t: string) => t.replace(/\.\d+\./, '.99.')],
      ['a foreign prefix', (t: string) => t.replace('GYM1', 'OTHER')],
      ['truncated input', (t: string) => t.split('.').slice(0, 2).join('.')],
    ])('refuses %s', async (_label, mangle) => {
      const token = (await card().expect(200)).body.token as string;

      const res = await scanIn(mangle(token)).expect(422);
      expect(denialReason(res.body)).toBe('CARD_INVALID');
      expect(await ctx.prisma.attendance.count()).toBe(0);
    });

    it('refuses a well-formed card for a member who has none issued', async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'nocard@gym.test' });
      const otherCard = await request(server)
        .get(`/api/v1/membership-cards/members/${other.memberId}`)
        .set(...asAdmin())
        .expect(200);

      await ctx.prisma.membershipCard.delete({ where: { memberId: other.memberId } });

      const res = await scanIn(otherCard.body.token as string).expect(422);
      expect(denialReason(res.body)).toBe('CARD_NOT_ISSUED');
    });

    it('applies the membership rules, not just the card checks', async () => {
      await ctx.prisma.memberMembership.deleteMany({ where: { memberId: member.memberId } });
      const token = (await card().expect(200)).body.token as string;

      const res = await scanIn(token).expect(422);
      expect(denialReason(res.body)).toBe('NO_MEMBERSHIP');
    });

    it('tolerates whitespace from a scanner', async () => {
      const token = (await card().expect(200)).body.token as string;
      await scanIn(`  ${token}  `).expect(201);
    });
  });

  describe('regeneration', () => {
    it('invalidates every previous copy of the card', async () => {
      const oldToken = (await card().expect(200)).body.token as string;

      const regenerated = await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/regenerate`)
        .set(...asAdmin())
        .expect(200);

      expect(regenerated.body.version).toBe(2);
      expect(regenerated.body.token).not.toBe(oldToken);

      const refused = await scanIn(oldToken).expect(422);
      expect(denialReason(refused.body)).toBe('CARD_SUPERSEDED');

      await scanIn(regenerated.body.token as string).expect(201);
    });

    it('keeps bumping the version on repeated regenerations', async () => {
      for (const expected of [2, 3, 4]) {
        const res = await request(server)
          .post(`/api/v1/membership-cards/members/${member.memberId}/regenerate`)
          .set(...asAdmin())
          .expect(200);
        expect(res.body.version).toBe(expected);
      }
    });

    it('lets a member replace their own lost card', async () => {
      const before = (await card().expect(200)).body.token as string;

      const res = await request(server)
        .post('/api/v1/membership-cards/me/regenerate')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.token).not.toBe(before);
      await scanIn(before).expect(422);
      await scanIn(res.body.token as string).expect(201);
    });
  });

  describe('revocation', () => {
    it('blocks entry and records the reason', async () => {
      const token = (await card().expect(200)).body.token as string;

      const revoked = await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/revoke`)
        .set(...asAdmin())
        .send({ reason: 'Card shared with a non-member' })
        .expect(200);

      expect(revoked.body.active).toBe(false);
      expect(revoked.body.revokedAt).not.toBeNull();
      expect(revoked.body.revokedReason).toBe('Card shared with a non-member');

      const refused = await scanIn(token).expect(422);
      expect(denialReason(refused.body)).toBe('CARD_REVOKED');
    });

    it('still lets a member already inside leave with a revoked card', async () => {
      const token = (await card().expect(200)).body.token as string;
      await scanIn(token).expect(201);

      await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/revoke`)
        .set(...asAdmin())
        .send({ reason: 'Revoked mid-visit' })
        .expect(200);

      const res = await request(server)
        .post('/api/v1/attendance/check-out/qr')
        .set(...asAdmin())
        .send({ token })
        .expect(200);

      expect(res.body.stillInside).toBe(false);
    });

    it('refuses to revoke twice', async () => {
      await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/revoke`)
        .set(...asAdmin())
        .send({})
        .expect(200);
      await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/revoke`)
        .set(...asAdmin())
        .send({})
        .expect(409);
    });

    it('is reinstated by regenerating, with a fresh token', async () => {
      const oldToken = (await card().expect(200)).body.token as string;
      await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/revoke`)
        .set(...asAdmin())
        .send({ reason: 'Lost' })
        .expect(200);

      const res = await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/regenerate`)
        .set(...asAdmin())
        .expect(200);

      expect(res.body.active).toBe(true);
      expect(res.body.revokedAt).toBeNull();
      expect(res.body.revokedReason).toBeNull();

      // The replacement works; the revoked one is still dead.
      await scanIn(res.body.token as string).expect(201);
      await request(server)
        .post('/api/v1/attendance/check-out')
        .set(...asAdmin())
        .send({ memberId: member.memberId })
        .expect(200);
      const stale = await scanIn(oldToken).expect(422);
      expect(denialReason(stale.body)).toBe('CARD_SUPERSEDED');
    });
  });

  describe('authorization', () => {
    it('a member reads and regenerates only their own card', async () => {
      const res = await request(server)
        .get('/api/v1/membership-cards/me')
        .set(...bearer(member.accessToken))
        .expect(200);

      expect(res.body.memberId).toBe(member.memberId);
    });

    it("a member cannot read another member's card", async () => {
      const other = await seedMemberProfile(ctx, server, { email: 'other@gym.test' });

      await request(server)
        .get(`/api/v1/membership-cards/members/${other.memberId}`)
        .set(...bearer(member.accessToken))
        .expect(403);
    });

    it('a member cannot revoke a card', async () => {
      await request(server)
        .post(`/api/v1/membership-cards/members/${member.memberId}/revoke`)
        .set(...bearer(member.accessToken))
        .send({})
        .expect(403);
    });

    it('a trainer cannot reach membership cards at all', async () => {
      const trainer = await seedTrainerProfile(ctx, server);

      await request(server)
        .get(`/api/v1/membership-cards/members/${member.memberId}`)
        .set(...bearer(trainer.accessToken))
        .expect(403);
      await request(server)
        .get('/api/v1/membership-cards/me')
        .set(...bearer(trainer.accessToken))
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/membership-cards/me').expect(401);
      await request(server).get(`/api/v1/membership-cards/members/${member.memberId}`).expect(401);
    });
  });
});
