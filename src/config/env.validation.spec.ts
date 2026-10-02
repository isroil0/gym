import { validateEnv } from './env.validation';

const VALID_DB = 'postgresql://gym:gym@localhost:55433/gym_dev?schema=public';
const VALID_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

const VALID_QR_SECRET = 'a-test-qr-secret-that-is-at-least-32-chars';

/** The minimum set of variables that have no default. */
const REQUIRED = {
  DATABASE_URL: VALID_DB,
  JWT_SECRET: VALID_SECRET,
  QR_SECRET: VALID_QR_SECRET,
};

describe('validateEnv', () => {
  it('applies defaults when only required variables are present', () => {
    const env = validateEnv({ ...REQUIRED });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api');
    expect(env.API_DEFAULT_VERSION).toBe('1');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.SWAGGER_PATH).toBe('docs');
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe('15m');
    expect(env.REFRESH_TOKEN_EXPIRES_IN_DAYS).toBe(30);
    expect(env.PASSWORD_RESET_EXPIRES_IN_MINUTES).toBe(60);
    expect(env.BCRYPT_ROUNDS).toBe(12);
  });

  it('coerces PORT from a string', () => {
    const env = validateEnv({ ...REQUIRED, PORT: '4100' });
    expect(env.PORT).toBe(4100);
  });

  it('parses boolean-like variables', () => {
    const env = validateEnv({ ...REQUIRED, LOG_PRETTY: 'true', SWAGGER_ENABLED: 'false' });
    expect(env.LOG_PRETTY).toBe(true);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_SECRET: VALID_SECRET, QR_SECRET: VALID_QR_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('throws when DATABASE_URL is not a postgres connection string', () => {
    expect(() => validateEnv({ ...REQUIRED, DATABASE_URL: 'mysql://localhost/gym' })).toThrow(
      /must be a PostgreSQL connection string/,
    );
  });

  it('throws when NODE_ENV is not a known environment', () => {
    expect(() => validateEnv({ ...REQUIRED, NODE_ENV: 'staging' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('throws when PORT is out of range', () => {
    expect(() => validateEnv({ ...REQUIRED, PORT: '70000' })).toThrow(/PORT/);
  });

  it('reports every invalid variable in one error', () => {
    expect(() => validateEnv({ ...REQUIRED, DATABASE_URL: 'nope', PORT: '-1' })).toThrow(
      /DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/,
    );
  });

  it('requires JWT_SECRET', () => {
    expect(() => validateEnv({ DATABASE_URL: VALID_DB, QR_SECRET: VALID_QR_SECRET })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects a JWT_SECRET that is too short to be safe', () => {
    expect(() => validateEnv({ ...REQUIRED, JWT_SECRET: 'too-short' })).toThrow(
      /JWT_SECRET must be at least 32 characters/,
    );
  });

  it('requires QR_SECRET', () => {
    expect(() => validateEnv({ DATABASE_URL: VALID_DB, JWT_SECRET: VALID_SECRET })).toThrow(
      /QR_SECRET/,
    );
  });

  it('rejects a QR_SECRET that is too short to be safe', () => {
    expect(() => validateEnv({ ...REQUIRED, QR_SECRET: 'too-short' })).toThrow(
      /QR_SECRET must be at least 32 characters/,
    );
  });

  it('rejects a malformed access-token duration', () => {
    expect(() => validateEnv({ ...REQUIRED, JWT_ACCESS_EXPIRES_IN: '15 minutes' })).toThrow(
      /JWT_ACCESS_EXPIRES_IN must look like/,
    );
  });

  it('rejects a bcrypt cost factor below the safe floor', () => {
    expect(() => validateEnv({ ...REQUIRED, BCRYPT_ROUNDS: '2' })).toThrow(/BCRYPT_ROUNDS/);
  });
});
