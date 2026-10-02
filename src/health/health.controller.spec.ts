import { Test, type TestingModule } from '@nestjs/testing';
import { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { AppConfigService } from '../config/configuration';

describe('HealthController', () => {
  let controller: HealthController;
  const healthCheck = jest.fn();

  beforeEach(async () => {
    healthCheck.mockReset();
    healthCheck.mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} });

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: { check: healthCheck } },
        { provide: PrismaHealthIndicator, useValue: { isHealthy: jest.fn() } },
        { provide: MemoryHealthIndicator, useValue: { checkHeap: jest.fn() } },
        { provide: AppConfigService, useValue: { healthMemoryHeapBytes: 512 * 1024 * 1024 } },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('runs the database and memory indicators', async () => {
    await controller.check();

    expect(healthCheck).toHaveBeenCalledTimes(1);
    const indicators = healthCheck.mock.calls[0][0] as unknown[];
    expect(indicators).toHaveLength(2);
  });

  it('reports liveness without touching dependencies', () => {
    const result = controller.live();

    expect(result.status).toBe('ok');
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(healthCheck).not.toHaveBeenCalled();
  });
});
