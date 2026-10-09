import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Assert actual local cache writes without archiving public payloads or estimating billing.
export async function homeCacheFiles() {
  const root = path.join(process.env.E2E_WORKSPACE!, 'apps/web/.next');
  const files: string[] = [];
  async function scan(directory: string) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await scan(file); continue; }
      if (directory.startsWith('cache/')) {
        const value = JSON.parse(await readFile(path.join(root, file), 'utf8'));
        if (!value.tags?.includes('public-home')) continue;
      } else if (!/^server\/app\/index\.(html|rsc|meta)$/.test(file) && !file.startsWith('server/app/index.segments/')) continue;
      files.push(file);
    }
  }
  await scan('server/app');
  await scan('cache/fetch-cache');
  const result = [];
  for (const file of files.sort()) {
    const before = await stat(path.join(root, file), { bigint: true });
    const body = await readFile(path.join(root, file));
    const after = await stat(path.join(root, file), { bigint: true });
    if (before.mtimeNs !== after.mtimeNs || before.size !== after.size) throw new Error('Home cache changed while taking a snapshot.');
    result.push({ file, mtimeNs: after.mtimeNs.toString(), sha256: createHash('sha256').update(body).digest('hex') });
  }
  if (!result.some(row => row.file.endsWith('index.html'))) throw new Error('Missing real homepage cache.');
  return result;
}
