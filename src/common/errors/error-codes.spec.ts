import { ErrorCode, errorCodeForStatus } from './error-codes';

describe('errorCodeForStatus', () => {
  it.each([
    [400, ErrorCode.BAD_REQUEST],
    [401, ErrorCode.UNAUTHORIZED],
    [403, ErrorCode.FORBIDDEN],
    [404, ErrorCode.NOT_FOUND],
    [409, ErrorCode.CONFLICT],
    [422, ErrorCode.UNPROCESSABLE_ENTITY],
    [429, ErrorCode.TOO_MANY_REQUESTS],
    [503, ErrorCode.SERVICE_UNAVAILABLE],
  ])('maps %i to %s', (status, expected) => {
    expect(errorCodeForStatus(status)).toBe(expected);
  });

  it('maps unknown 5xx statuses to INTERNAL_SERVER_ERROR', () => {
    expect(errorCodeForStatus(500)).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(errorCodeForStatus(502)).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
  });

  it('maps unknown 4xx statuses to BAD_REQUEST', () => {
    expect(errorCodeForStatus(418)).toBe(ErrorCode.BAD_REQUEST);
  });
});
