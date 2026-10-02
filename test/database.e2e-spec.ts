import { closeTestApp, createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Database (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('runs raw queries through the Prisma client', async () => {
    const rows = await ctx.prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
  });

  it('has applied the migrations (app_settings table exists)', async () => {
    const rows = await ctx.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'app_settings'
      ) AS exists
    `;
    expect(rows[0].exists).toBe(true);
  });

  it('records applied migrations in _prisma_migrations', async () => {
    const rows = await ctx.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });

  it('performs a full write/read/delete round trip', async () => {
    await resetDatabase(ctx);

    const created = await ctx.prisma.appSetting.create({
      data: { key: 'test.roundtrip', value: 'yes', description: 'e2e round trip' },
    });
    expect(created.id).toBeDefined();
    expect(created.createdAt).toBeInstanceOf(Date);

    const found = await ctx.prisma.appSetting.findUnique({ where: { key: 'test.roundtrip' } });
    expect(found?.value).toBe('yes');

    await ctx.prisma.appSetting.delete({ where: { key: 'test.roundtrip' } });
    expect(await ctx.prisma.appSetting.findUnique({ where: { key: 'test.roundtrip' } })).toBeNull();
  });

  it('enforces the unique constraint on setting keys', async () => {
    await resetDatabase(ctx);
    await ctx.prisma.appSetting.create({ data: { key: 'test.unique', value: '1' } });

    await expect(
      ctx.prisma.appSetting.create({ data: { key: 'test.unique', value: '2' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('truncates every table on reset', async () => {
    await ctx.prisma.appSetting.create({ data: { key: 'test.truncate', value: '1' } });
    await resetDatabase(ctx);

    expect(await ctx.prisma.appSetting.count()).toBe(0);
  });
});
