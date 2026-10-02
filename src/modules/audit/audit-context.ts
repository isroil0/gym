import type { AuditOutcome } from '@prisma/client';

/**
 * What the interceptor learns about a request and leaves for the middleware to
 * write. Everything is optional: a request refused by a guard never reaches the
 * interceptor, and the middleware still records it.
 */
export interface AuditContext {
  action?: string;
  entityId?: string;
  errorCode?: string;
  outcome?: AuditOutcome;
  skip?: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Populated by AuditEnricherInterceptor, consumed by AuditMiddleware. */
    audit?: AuditContext;
  }
}
