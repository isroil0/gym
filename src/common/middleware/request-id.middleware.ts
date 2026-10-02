import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation id attached to every request and echoed in logs and errors. */
    id?: string;
  }
}

/**
 * Assigns a correlation id to every request (reusing an inbound x-request-id
 * when the caller supplies one) and echoes it back on the response.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // pino-http may already have assigned an id; never overwrite it.
    const inbound = req.id ?? req.headers[REQUEST_ID_HEADER];
    const requestId = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();

    req.id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
