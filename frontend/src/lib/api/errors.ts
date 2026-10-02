/** The error envelope every backend failure uses. */
export interface ApiErrorBody {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  details?: Array<{ field?: string; messages?: string[] }>;
  path?: string;
  method?: string;
  timestamp?: string;
  requestId?: string;
}

/**
 * A failed API call. Carries the backend's machine-readable `error` code so
 * the UI can translate it, and the per-field details so a form can mark the
 * exact inputs the server rejected.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Array<{ field?: string; messages?: string[] }>;
  readonly requestId?: string;

  constructor(status: number, body: Partial<ApiErrorBody> | null, fallback = 'Request failed') {
    super(body?.message || fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error || codeForStatus(status);
    this.details = body?.details ?? [];
    this.requestId = body?.requestId;
  }

  /** Field name → first message, ready to hand to react-hook-form. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const detail of this.details) {
      if (detail.field && detail.messages?.length) out[detail.field] = detail.messages[0]!;
    }
    return out;
  }

  /** The first denial reason the backend gave, if it gave one. */
  get reason(): string | undefined {
    return this.details[0]?.messages?.[0];
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isValidation(): boolean {
    return this.status === 400 || this.status === 422;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }
  /** Retrying has a chance of working; 4xx mostly does not. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/**
 * The code the backend would have used, for the rare reply that carries none.
 * Spellings taken from the API's own `ErrorCode` enum so the translation
 * lookup matches a real key rather than silently falling back to English.
 */
function codeForStatus(status: number): string {
  switch (status) {
    case 0:
      return 'NETWORK_ERROR';
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 405:
      return 'METHOD_NOT_ALLOWED';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  }
}

/** A connection that never reached the server. */
export function networkError(cause?: unknown): ApiError {
  const error = new ApiError(0, null, 'Network request failed');
  if (cause instanceof Error) error.cause = cause;
  return error;
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
