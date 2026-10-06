import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeRecoveryArtifact(data: Record<string, unknown>) {
  const sourceRoot = process.env.E2E_SOURCE_ROOT ?? process.cwd();
  const output = process.env.E2E_OUTPUT!;
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, 'mail-outbox-recovery.json'),
    JSON.stringify(
      {
        sha: execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        sourceIncludesUncommittedChanges: Boolean(
          execFileSync('git', ['-C', sourceRoot, 'status', '--porcelain'], {
            encoding: 'utf8',
          }).trim(),
        ),
        budget: {
          F: 60_000,
          B: 120_000,
          C: 60_000,
          Q: 1000,
          sendWait: 3000,
          smtp: 2000,
          W: 10_000,
          T_scan: 191_000,
          finiteBacklog: 6,
          batch: 2,
          concurrency: 1,
          T_delivery: 611_000,
        },
        expectedAssertions: 11,
        ...data,
      },
      null,
      2,
    ),
  );
}
