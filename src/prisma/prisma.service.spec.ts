import { PrismaService } from './prisma.service';
import type { AppConfigService } from '../config/configuration';

const config = {
  databaseUrl: 'postgresql://gym:gym@localhost:55433/gym_dev?schema=public',
  isProduction: false,
} as AppConfigService;

describe('PrismaService', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('refuses to truncate outside the test environment', async () => {
    const service = new PrismaService(config);
    process.env.NODE_ENV = 'production';

    await expect(service.truncateAllTables()).rejects.toThrow(/only available when NODE_ENV=test/);
  });

  it('issues a trivial query when pinged', async () => {
    const service = new PrismaService(config);
    const queryRaw = jest
      .spyOn(service, '$queryRaw')
      .mockResolvedValue([{ '?column?': 1 }] as never);

    await service.ping();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
