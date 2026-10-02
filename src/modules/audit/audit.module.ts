import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditEnricherInterceptor } from './audit.interceptor';
import { AuditMiddleware } from './audit.middleware';
import { PermissionAuditService } from './permission-audit.service';

/**
 * Audit module — the trail of state-changing requests, and the permission
 * matrix read from the running metadata (Phase 9).
 *
 * Two pieces, deliberately:
 *
 * - **AuditMiddleware** writes every row. Middleware runs before the guards, so
 *   an attempt refused by authorization is still recorded.
 * - **AuditEnricherInterceptor** adds what only the handler knows — the declared
 *   action, the created record's id, the domain error code.
 *
 * Both are global, so an endpoint added later is audited without anyone
 * remembering to instrument it.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    PermissionAuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditEnricherInterceptor },
  ],
  exports: [AuditService, PermissionAuditService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditMiddleware).forRoutes('*path');
  }
}
