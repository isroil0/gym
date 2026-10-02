import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

/** Terminus health indicator that issues a trivial query against PostgreSQL. */
@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const startedAt = process.hrtime.bigint();

    try {
      await this.prisma.ping();
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return indicator.up({ responseTimeMs: Math.round(elapsedMs * 100) / 100 });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'Database unreachable',
      });
    }
  }
}
