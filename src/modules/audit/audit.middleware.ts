import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { AuditOutcome, type Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { errorCodeForStatus } from '../../common/errors/error-codes';

/** Only state-changing requests are audited; reads would drown the trail. */
const AUDITED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Keys never written to the audit trail, at any depth.
 *
 * An audit log that stores passwords is a liability, not a control.
 */
const REDACTED_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'passwordhash',
  'token',
  'refreshtoken',
  'accesstoken',
  'resettoken',
  'secret',
  'authorization',
]);

const REDACTED = '[REDACTED]';
const MAX_PAYLOAD_KEYS = 50;
const MAX_STRING_LENGTH = 500;

/**
 * Writes one audit row per state-changing request.
 *
 * Middleware rather than an interceptor, and hooked on the response finishing,
 * because middleware runs *before* the guards. An attempt refused by the
 * authorization guard never reaches an interceptor, and a refused attempt is
 * precisely what an audit trail exists to capture. Hooking `finish` means
 * every outcome is recorded: handled, refused, throttled or rejected by
 * validation.
 *
 * Detail only the handler knows — the declared action name, the id of a created
 * record, the domain error code — is supplied by AuditEnricherInterceptor on
 * `request.audit`; this class falls back to deriving an action from the route
 * when the request never got that far.
 *
 * Writing the log never affects the response it describes.
 */
@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (!AUDITED_METHODS.has(request.method)) {
      next();
      return;
    }

    const startedAt = Date.now();
    // Captured now: a pipe may replace `request.body` before the handler runs.
    const payload = AuditMiddleware.redact(request.body);

    response.on('finish', () => {
      void this.record(request, response, payload, Date.now() - startedAt);
    });

    next();
  }

  private async record(
    request: Request,
    response: Response,
    payload: unknown,
    durationMs: number,
  ): Promise<void> {
    const audit = request.audit;
    if (audit?.skip) return;

    const statusCode = response.statusCode;
    const action = audit?.action ?? AuditMiddleware.deriveAction(request);
    const outcome =
      audit?.outcome ?? (statusCode < 400 ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE);

    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: request.user?.id ?? null,
          actorRole: request.user?.role ?? null,
          actorEmail: request.user?.email ?? null,
          action,
          entityType: action.split('.')[0] || null,
          entityId: audit?.entityId ?? AuditMiddleware.entityIdFromPath(request) ?? null,
          method: request.method,
          path: (request.originalUrl ?? request.url).slice(0, 255),
          statusCode,
          outcome,
          // A guard refusal never reaches the interceptor, so the code is
          // derived from the status rather than left blank — "403" with no
          // reason is a poorer record than "403 FORBIDDEN".
          errorCode:
            audit?.errorCode ??
            (outcome === AuditOutcome.FAILURE ? errorCodeForStatus(statusCode) : null),
          payload: payload as Prisma.InputJsonValue,
          requestId: request.id ?? null,
          ipAddress: request.ip?.slice(0, 64) ?? null,
          userAgent: request.headers['user-agent']?.slice(0, 255) ?? null,
          durationMs,
        },
      });
    } catch (error) {
      // An audit write must never turn a served request into a failed one.
      this.logger.error(
        `Failed to record audit entry for ${request.method} ${request.originalUrl}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * A route-shaped action for a request that never reached its handler, e.g.
   * `POST /api/v1/members` becomes `members.create`.
   */
  private static deriveAction(request: Request): string {
    const path = (request.originalUrl ?? request.url).split('?')[0];
    const segments = path
      .split('/')
      .filter((segment) => segment.length > 0 && segment !== 'api' && !/^v\d+$/.test(segment));

    const resource = segments[0] ?? 'unknown';
    const tail = segments.length > 1 ? segments[segments.length - 1] : '';
    // A trailing id is not a verb; fall back to the HTTP method.
    const verb =
      tail && !/^[0-9a-f-]{8,}$/i.test(tail)
        ? tail.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
        : AuditMiddleware.verbFor(request.method);

    return `${resource}.${verb}`;
  }

  private static verbFor(method: string): string {
    switch (method) {
      case 'POST':
        return 'create';
      case 'PATCH':
      case 'PUT':
        return 'update';
      case 'DELETE':
        return 'remove';
      default:
        return method.toLowerCase();
    }
  }

  /** The last id-shaped segment of the path, when the handler supplied none. */
  private static entityIdFromPath(request: Request): string | undefined {
    const params = request.params as Record<string, string> | undefined;
    const candidate = params?.id ?? params?.memberId ?? params?.trainerId;
    if (typeof candidate === 'string' && candidate.length > 0) return candidate.slice(0, 64);

    const segments = (request.originalUrl ?? request.url).split('?')[0].split('/');
    const idLike = [...segments].reverse().find((segment) => /^[0-9a-f-]{36}$/i.test(segment));

    return idLike?.slice(0, 64);
  }

  /**
   * Copies a request body with every credential replaced, strings truncated and
   * the breadth capped — so an audit row stays a summary, not a mirror of the
   * request.
   */
  static redact(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return null;
    if (depth > 4) return '[TRUNCATED]';

    if (typeof value === 'string') {
      return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_PAYLOAD_KEYS)
        .map((item) => AuditMiddleware.redact(item, depth + 1));
    }

    if (typeof value === 'object') {
      const source = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const key of Object.keys(source).slice(0, MAX_PAYLOAD_KEYS)) {
        result[key] = REDACTED_KEYS.has(key.toLowerCase())
          ? REDACTED
          : AuditMiddleware.redact(source[key], depth + 1);
      }

      return result;
    }

    return null;
  }
}
