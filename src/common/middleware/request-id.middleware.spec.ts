import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, RequestIdMiddleware } from './request-id.middleware';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function run(headers: Record<string, string> = {}) {
  const middleware = new RequestIdMiddleware();
  const req = { headers } as unknown as Request;
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;

  middleware.use(req, res, next);
  return { req, setHeader, next };
}

describe('RequestIdMiddleware', () => {
  it('generates a uuid when the caller sends none', () => {
    const { req, setHeader, next } = run();

    expect(req.id).toMatch(UUID_RE);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses an inbound correlation id', () => {
    const { req, setHeader } = run({ [REQUEST_ID_HEADER]: 'trace-abc' });

    expect(req.id).toBe('trace-abc');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'trace-abc');
  });

  it('ignores an empty inbound header', () => {
    const { req } = run({ [REQUEST_ID_HEADER]: '' });
    expect(req.id).toMatch(UUID_RE);
  });
});
