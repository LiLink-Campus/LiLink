jest.mock('fs', () => {
  const actualFs = jest.requireActual<typeof import('fs')>('fs');

  return {
    ...actualFs,
    existsSync: jest.fn((path: string) => {
      const normalizedPath = path.replace(/\\/g, '/');

      return (
        normalizedPath.endsWith('/apps/api/package.json') ||
        normalizedPath.endsWith('/.env')
      );
    }),
    readFileSync: jest.fn(() => JSON.stringify({ name: 'api' })),
  };
});

jest.mock('dotenv', () => ({
  config: jest.fn(
    (options?: {
      path?: string;
      processEnv?: Record<string, string>;
      override?: boolean;
    }) => {
      const target = options?.processEnv ?? process.env;
      const normalizedPath = options?.path?.replace(/\\/g, '/') ?? '';
      const parsed = normalizedPath.endsWith('/apps/api/.env')
        ? { SAMPLE_ENV_KEY: 'api-file-key' }
        : { SAMPLE_ENV_KEY: 'root-file-key' };

      for (const [key, value] of Object.entries(parsed)) {
        if (options?.override || target[key] === undefined) {
          target[key] = value;
        }
      }

      return { parsed };
    },
  ),
}));

import { preloadMonorepoEnvIntoProcess } from './monorepo-env-paths';

describe('preloadMonorepoEnvIntoProcess', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, SAMPLE_ENV_KEY: 'shell-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('lets apps/api/.env override parent process values', () => {
    preloadMonorepoEnvIntoProcess();

    expect(process.env.SAMPLE_ENV_KEY).toBe('api-file-key');
  });
});
