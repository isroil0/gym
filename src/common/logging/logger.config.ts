import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AppConfigService } from '../../config/configuration';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.refreshToken',
  'res.headers["set-cookie"]',
];

/**
 * Structured (JSON) request logging. Pretty-printed in development,
 * machine readable everywhere else. Health checks are not logged to
 * keep container probe noise out of the logs.
 */
export function buildLoggerOptions(config: AppConfigService): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      // Reuse an id already assigned by RequestIdMiddleware (or supplied by the
      // caller) so the logs, the x-request-id header and the error envelope all
      // report the same correlation id, whichever middleware runs first.
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const assigned = (req as IncomingMessage & { id?: string }).id;
        if (typeof assigned === 'string' && assigned.length > 0) return assigned;

        const inbound = req.headers[REQUEST_ID_HEADER];
        const id = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();
        (req as IncomingMessage & { id?: string }).id = id;
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      customProps: () => ({ context: 'HTTP' }),
      autoLogging: {
        ignore: (req: IncomingMessage) => (req.url ?? '').includes('/health'),
      },
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      transport: config.logPretty
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  };
}
