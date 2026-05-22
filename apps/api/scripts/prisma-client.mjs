import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
const builtClientModulePath = path.join(
  apiRoot,
  'dist',
  'src',
  'common',
  'prisma',
  'client.js',
);

function runNpmScript(scriptName) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', scriptName], {
    cwd: apiRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to run npm script "${scriptName}".`);
  }
}

function ensureBuiltApi(requiredRelativePaths = []) {
  const requiredPaths = [
    builtClientModulePath,
    ...requiredRelativePaths.map((relativePath) =>
      path.resolve(apiRoot, relativePath),
    ),
  ];

  if (requiredPaths.every((requiredPath) => existsSync(requiredPath))) {
    return;
  }

  runNpmScript('build:shared');
  runNpmScript('build');

  const missingPaths = requiredPaths.filter(
    (requiredPath) => !existsSync(requiredPath),
  );
  if (missingPaths.length > 0) {
    throw new Error(
      `API build completed but expected output is missing: ${missingPaths.join(', ')}`,
    );
  }
}

export async function loadPrismaClientModule(requiredRelativePaths = []) {
  ensureBuiltApi(requiredRelativePaths);
  return import(pathToFileURL(builtClientModulePath).href);
}
