import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Schema for every environment variable the application consumes.
 * The app refuses to boot when this validation fails.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  API_PREFIX: z.string().min(1).default('api'),
  API_DEFAULT_VERSION: z.string().min(1).default('1'),

  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  LOG_PRETTY: booleanFromString.default(false),

  SWAGGER_ENABLED: booleanFromString.default(true),
  SWAGGER_PATH: z.string().min(1).default('docs'),

  CORS_ORIGINS: z.string().default('*'),

  // ---- Health ----
  /// Heap ceiling for the /health memory indicator, in megabytes. Raise it for
  /// long-lived processes that legitimately hold more (such as a test runner
  /// executing the whole suite in one process).
  HEALTH_MEMORY_HEAP_MB: z.coerce.number().int().min(64).max(16384).default(512),

  // ---- Authentication ----
  /// Signing key for access tokens. Long enough that it cannot be brute forced.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /// Access token lifetime, as an `ms`-style duration (e.g. 15m, 1h).
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_ACCESS_EXPIRES_IN must look like 15m, 1h or 7d')
    .default('15m'),
  JWT_ISSUER: z.string().min(1).default('gym-crm'),
  JWT_AUDIENCE: z.string().min(1).default('gym-crm-api'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  PASSWORD_RESET_EXPIRES_IN_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  /// bcrypt cost factor. 12 is the production default; tests lower it for speed.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // ---- Security ----
  /// Requests allowed per IP within the window, for ordinary endpoints.
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(300),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  /// A much tighter limit for credential endpoints, to blunt brute force.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  /// Queries slower than this are logged at warn level. 0 disables.
  SLOW_QUERY_MS: z.coerce.number().int().min(0).max(60000).default(300),

  // ---- QR membership cards ----
  /// Signs QR card payloads. Distinct from JWT_SECRET on purpose.
  QR_SECRET: z.string().min(32, 'QR_SECRET must be at least 32 characters'),

  SEED_GYM_NAME: z.string().min(1).default('Gym CRM'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@gym.local'),
  SEED_ADMIN_PASSWORD: z.string().min(10).default('ChangeMe123!'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Used by @nestjs/config as the `validate` hook.
 * Throws a readable aggregated error listing every invalid variable.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
