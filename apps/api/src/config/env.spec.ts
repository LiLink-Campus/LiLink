// Stub the .env preload so apps/api/.env (loaded with override:true) cannot
// clobber the APP_ENV/NODE_ENV values each case sets before re-importing env.
jest.mock('./monorepo-env-paths', () => ({
  preloadMonorepoEnvIntoProcess: jest.fn(),
  monorepoEnvFilePaths: jest.fn(() => [] as string[]),
}));

describe('isLocalDevRuntime (dev-override gate)', () => {
  const originalAppEnv = process.env.APP_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    restoreEnv('APP_ENV', originalAppEnv);
    restoreEnv('NODE_ENV', originalNodeEnv);
    jest.resetModules();
  });

  function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  // env.APP_ENV is frozen at module-parse time, so the gate has to be re-imported
  // under explicit APP_ENV/NODE_ENV to be exercised. Setting both before require
  // also prevents the .env preload from overriding them, so this is robust both
  // locally (APP_ENV defaults to development) and in CI (APP_ENV=test).
  function loadGate(appEnv: string, nodeEnv: string): () => boolean {
    jest.resetModules();
    process.env.APP_ENV = appEnv;
    process.env.NODE_ENV = nodeEnv;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./env') as typeof import('./env')).isLocalDevRuntime;
  }

  it('is true only for a developer runtime (APP_ENV=development, NODE_ENV!=production)', () => {
    expect(loadGate('development', 'development')()).toBe(true);
    expect(loadGate('development', 'test')()).toBe(true);
  });

  it('is false in CI (APP_ENV=test)', () => {
    expect(loadGate('test', 'test')()).toBe(false);
  });

  it('is false on a production host (APP_ENV=production)', () => {
    expect(loadGate('production', 'production')()).toBe(false);
  });

  it('is false whenever NODE_ENV=production, even if APP_ENV=development', () => {
    expect(loadGate('development', 'production')()).toBe(false);
  });
});
