import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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
