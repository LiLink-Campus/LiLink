import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { config as loadDotenv } from 'dotenv';

/**
 * Loads repo-root `.env` then `apps/api/.env` (override), matching `scripts/load-env.mjs`.
 * Preserves variables that were already defined by the parent process.
 * Must run before `env.ts` parses `process.env` (e.g. `main.ts` imports `env` before `NestFactory.create`).
 */
export function preloadMonorepoEnvIntoProcess(): void {
  const apiPackageRoot = resolveApiPackageRoot(__dirname);
  const repoRoot = join(apiPackageRoot, '..', '..');
  const rootPath = join(repoRoot, '.env');
  const apiPath = join(apiPackageRoot, '.env');
  const mergedEnv: Record<string, string> = {};

  if (existsSync(rootPath)) {
    loadDotenv({ path: rootPath, processEnv: mergedEnv });
  }
  if (existsSync(apiPath)) {
    loadDotenv({ path: apiPath, processEnv: mergedEnv, override: true });
  }

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Resolves `.env` paths for ConfigModule: api package first, then repo root fallback.
 * Matches `scripts/load-env.mjs` so Nest sees the same effective variables as Prisma scripts.
 */
export function monorepoEnvFilePaths(): string[] {
  const apiPackageRoot = resolveApiPackageRoot(__dirname);
  const repoRoot = join(apiPackageRoot, '..', '..');
  const paths = [join(apiPackageRoot, '.env'), join(repoRoot, '.env')].filter(
    (filePath) => existsSync(filePath),
  );
  return paths.length > 0 ? paths : ['.env'];
}

function resolveApiPackageRoot(startDir: string): string {
  let current = startDir;
  for (let depth = 0; depth < 8; depth++) {
    const pkgPath = join(current, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          name?: string;
        };
        if (pkg.name === 'api') {
          return current;
        }
      } catch {
        /* ignore invalid package.json */
      }
    }
    const parent = join(current, '..');
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return process.cwd();
}
