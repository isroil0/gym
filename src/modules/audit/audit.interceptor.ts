import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditOutcome } from '@prisma/client';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AppException } from '../../common/errors/app.exception';
import { AUDIT_ACTION_KEY, AUDIT_SKIP_KEY } from './audit.decorator';
import type { AuditContext } from './audit-context';

/**
 * Annotates a request with what the handler did, for the middleware to record.
 *
 * It does not write anything itself. Guards run *before* interceptors, so a
 * request refused by the authorization guard never reaches here — and a refused
 * attempt is exactly what an audit trail is for. Writing happens in
 * AuditMiddleware, which sees every request including those; this class only
 * supplies the detail that is unavailable from outside the handler: the
 * declared action name, the id of the record created, and the error code.
 */
@Injectable()
export class AuditEnricherInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const audit: AuditContext = request.audit ?? {};
    request.audit = audit;

    if (
      this.reflector.getAllAndOverride<boolean>(AUDIT_SKIP_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      audit.skip = true;
      return next.handle();
    }

    audit.action =
      this.reflector.getAllAndOverride<string>(AUDIT_ACTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? AuditEnricherInterceptor.deriveAction(context);

    return next.handle().pipe(
      tap({
        next: (body) => {
          audit.outcome = AuditOutcome.SUCCESS;
          audit.entityId = AuditEnricherInterceptor.entityIdOf(body) ?? audit.entityId;
        },
        error: (error: unknown) => {
          audit.outcome = AuditOutcome.FAILURE;
          audit.errorCode = AuditEnricherInterceptor.errorCodeOf(error);
        },
      }),
    );
  }

  /** `PaymentsController.refund` becomes `payments.refund`. */
  private static deriveAction(context: ExecutionContext): string {
    const controller = context.getClass().name.replace(/Controller$/, '');
    const handler = context.getHandler().name;

    return `${controller.charAt(0).toLowerCase()}${controller.slice(1)}.${handler}`;
  }

  /** The id of a newly created record, read from the response. */
  private static entityIdOf(body: unknown): string | undefined {
    if (body && typeof body === 'object' && 'id' in body) {
      const id = (body as { id?: unknown }).id;
      if (typeof id === 'string') return id.slice(0, 64);
    }
    return undefined;
  }

  private static errorCodeOf(error: unknown): string | undefined {
    if (error instanceof AppException) return error.errorCode;
    return error instanceof Error ? error.name.slice(0, 60) : undefined;
  }
}
