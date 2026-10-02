import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import type { PrismaService } from '../prisma/prisma.service';

describe('PrismaHealthIndicator', () => {
  const up = jest.fn((data: unknown) => ({ database: { status: 'up', ...(data as object) } }));
  const down = jest.fn((data: unknown) => ({ database: { status: 'down', ...(data as object) } }));
  const healthIndicatorService = {
    check: jest.fn(() => ({ up, down })),
  } as unknown as HealthIndicatorService;

  beforeEach(() => {
    up.mockClear();
    down.mockClear();
  });

  it('reports up when the database answers', async () => {
    const prisma = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as PrismaService;
    const indicator = new PrismaHealthIndicator(prisma, healthIndicatorService);

    await indicator.isHealthy('database');

    expect(up).toHaveBeenCalledTimes(1);
    expect(down).not.toHaveBeenCalled();
    expect(up.mock.calls[0][0]).toHaveProperty('responseTimeMs');
  });

  it('reports down when the database is unreachable', async () => {
    const prisma = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as PrismaService;
    const indicator = new PrismaHealthIndicator(prisma, healthIndicatorService);

    await indicator.isHealthy('database');

    expect(down).toHaveBeenCalledWith({ message: 'ECONNREFUSED' });
  });
});
