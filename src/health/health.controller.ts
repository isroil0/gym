import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { AppConfigService } from '../config/configuration';
import { SWAGGER_TAGS } from '../common/swagger/swagger.setup';
import { Public } from '../modules/auth/decorators/public.decorator';

// Container and load-balancer probes cannot present credentials.
@Public()
@ApiTags(SWAGGER_TAGS.health)
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Service health',
    description: 'Reports database connectivity and process memory headroom.',
  })
  @ApiOkResponse({ description: 'All health indicators are up' })
  @ApiServiceUnavailableResponse({ description: 'At least one health indicator is down' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.memory.checkHeap('memory_heap', this.config.healthMemoryHeapBytes),
    ]);
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns 200 as long as the process is running. Performs no dependency checks.',
  })
  @ApiOkResponse({ description: 'Process is alive' })
  live(): { status: 'ok'; uptimeSeconds: number; timestamp: string } {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
