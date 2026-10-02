import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit:action';
export const AUDIT_SKIP_KEY = 'audit:skip';

/**
 * Names the action an endpoint performs, e.g. `payments.refund`.
 * Without it the interceptor derives a name from the controller and handler,
 * so a new endpoint is still audited — this only improves the label.
 */
export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);

/**
 * Excludes an endpoint from the audit trail.
 *
 * Reserved for routes whose payload is a credential and whose outcome is
 * already logged elsewhere. Using it anywhere else creates a blind spot.
 */
export const SkipAudit = () => SetMetadata(AUDIT_SKIP_KEY, true);
