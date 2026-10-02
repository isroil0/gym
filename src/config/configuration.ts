import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.validation';

/**
 * Typed accessor around ConfigService so the rest of the app never
 * touches `process.env` or stringly-typed keys directly.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get port(): number {
    return this.get('PORT');
  }

  get apiPrefix(): string {
    return this.get('API_PREFIX');
  }

  get apiDefaultVersion(): string {
    return this.get('API_DEFAULT_VERSION');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get logPretty(): boolean {
    return this.get('LOG_PRETTY');
  }

  get swaggerEnabled(): boolean {
    return this.get('SWAGGER_ENABLED');
  }

  get swaggerPath(): string {
    return this.get('SWAGGER_PATH');
  }

  get corsOrigins(): string[] | string {
    const raw = this.get('CORS_ORIGINS');
    return raw === '*'
      ? '*'
      : raw
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);
  }

  get healthMemoryHeapBytes(): number {
    return this.get('HEALTH_MEMORY_HEAP_MB') * 1024 * 1024;
  }

  // ---- Authentication ----

  get jwtSecret(): string {
    return this.get('JWT_SECRET');
  }

  get jwtAccessExpiresIn(): string {
    return this.get('JWT_ACCESS_EXPIRES_IN');
  }

  get jwtIssuer(): string {
    return this.get('JWT_ISSUER');
  }

  get jwtAudience(): string {
    return this.get('JWT_AUDIENCE');
  }

  get refreshTokenExpiresInDays(): number {
    return this.get('REFRESH_TOKEN_EXPIRES_IN_DAYS');
  }

  get passwordResetExpiresInMinutes(): number {
    return this.get('PASSWORD_RESET_EXPIRES_IN_MINUTES');
  }

  get bcryptRounds(): number {
    return this.get('BCRYPT_ROUNDS');
  }

  // ---- Security ----

  get rateLimitMax(): number {
    return this.get('RATE_LIMIT_MAX');
  }

  get rateLimitWindowSeconds(): number {
    return this.get('RATE_LIMIT_WINDOW_SECONDS');
  }

  get authRateLimitMax(): number {
    return this.get('AUTH_RATE_LIMIT_MAX');
  }

  get authRateLimitWindowSeconds(): number {
    return this.get('AUTH_RATE_LIMIT_WINDOW_SECONDS');
  }

  get slowQueryMs(): number {
    return this.get('SLOW_QUERY_MS');
  }

  get qrSecret(): string {
    return this.get('QR_SECRET');
  }

  // ---- Seed ----

  get seedGymName(): string {
    return this.get('SEED_GYM_NAME');
  }

  get seedAdminEmail(): string {
    return this.get('SEED_ADMIN_EMAIL');
  }

  get seedAdminPassword(): string {
    return this.get('SEED_ADMIN_PASSWORD');
  }
}
