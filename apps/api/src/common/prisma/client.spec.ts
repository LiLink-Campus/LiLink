import { createPostgresPoolConfig, readDatabaseUrl } from './client';

describe('readDatabaseUrl', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => readDatabaseUrl()).toThrow('DATABASE_URL is required.');
  });

  it('throws when DATABASE_URL is only whitespace', () => {
    process.env.DATABASE_URL = '   ';
    expect(() => readDatabaseUrl()).toThrow('DATABASE_URL is required.');
  });

  it('returns a trimmed connection string', () => {
    process.env.DATABASE_URL = '  postgresql://example/db  ';
    expect(readDatabaseUrl()).toBe('postgresql://example/db');
  });
});

describe('createPostgresPoolConfig', () => {
  const envKeys = [
    'DATABASE_URL',
    'DATABASE_CONNECTION_LIMIT',
    'DATABASE_POOL_TIMEOUT_SECONDS',
  ] as const;
  const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> =
    {};

  beforeEach(() => {
    for (const key of envKeys) {
      snapshot[key] = process.env[key];
    }
    process.env.DATABASE_URL = 'postgresql://pool-config-test';
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = snapshot[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('uses default pool limits when optional env vars are unset', () => {
    delete process.env.DATABASE_CONNECTION_LIMIT;
    delete process.env.DATABASE_POOL_TIMEOUT_SECONDS;

    const config = createPostgresPoolConfig();

    expect(config.connectionString).toBe('postgresql://pool-config-test');
    expect(config.max).toBe(20);
    expect(config.connectionTimeoutMillis).toBe(10_000);
  });

  it('parses DATABASE_CONNECTION_LIMIT and DATABASE_POOL_TIMEOUT_SECONDS', () => {
    process.env.DATABASE_CONNECTION_LIMIT = '5';
    process.env.DATABASE_POOL_TIMEOUT_SECONDS = '3';

    const config = createPostgresPoolConfig();

    expect(config.max).toBe(5);
    expect(config.connectionTimeoutMillis).toBe(3000);
  });

  it('rejects non-integer DATABASE_CONNECTION_LIMIT', () => {
    process.env.DATABASE_CONNECTION_LIMIT = '2.5';
    expect(() => createPostgresPoolConfig()).toThrow(
      'DATABASE_CONNECTION_LIMIT must be a positive integer.',
    );
  });

  it('rejects non-positive DATABASE_CONNECTION_LIMIT', () => {
    process.env.DATABASE_CONNECTION_LIMIT = '0';
    expect(() => createPostgresPoolConfig()).toThrow(
      'DATABASE_CONNECTION_LIMIT must be a positive integer.',
    );
  });

  it('rejects negative DATABASE_POOL_TIMEOUT_SECONDS', () => {
    process.env.DATABASE_POOL_TIMEOUT_SECONDS = '-1';
    expect(() => createPostgresPoolConfig()).toThrow(
      'DATABASE_POOL_TIMEOUT_SECONDS must be a non-negative integer.',
    );
  });

  it('allows zero DATABASE_POOL_TIMEOUT_SECONDS', () => {
    process.env.DATABASE_POOL_TIMEOUT_SECONDS = '0';
    const config = createPostgresPoolConfig();
    expect(config.connectionTimeoutMillis).toBe(0);
  });
});
