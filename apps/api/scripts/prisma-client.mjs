import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
const sourceClientModule = '../src/common/prisma/client.ts';
const builtClientModulePath = path.join(
  apiRoot,
  'dist',
  'src',
  'common',
  'prisma',
  'client.js',
);

export async function loadPrismaClientModule() {
  try {
    return await import(sourceClientModule);
  } catch (sourceError) {
    if (existsSync(builtClientModulePath)) {
      return import(pathToFileURL(builtClientModulePath).href);
    }

    throw sourceError;
  }
}
