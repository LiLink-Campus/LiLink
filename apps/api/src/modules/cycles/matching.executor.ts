import { ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { MatchingInput, MatchingResult } from './matching.engine';

let preceding: Promise<unknown> = Promise.resolve();
let pending = 0;

// One solver at a time leaves CPU and memory available for user requests.
export function runMatching(input: MatchingInput): Promise<MatchingResult> {
  if (pending >= 4) {
    return Promise.reject(
      new ServiceUnavailableException('Matching is busy. Please retry later.'),
    );
  }
  pending += 1;
  const task = preceding.then(() => execute(input));
  preceding = task.catch(() => undefined);
  return task.finally(() => {
    pending -= 1;
  });
}

function execute(input: MatchingInput): Promise<MatchingResult> {
  return new Promise((resolve, reject) => {
    const compiled = join(__dirname, 'matching.worker.js');
    const sourceMode = !existsSync(compiled);
    const worker = new Worker(
      sourceMode ? join(__dirname, 'matching.worker.ts') : compiled,
      {
        workerData: input,
        resourceLimits: { maxOldGenerationSizeMb: 1536 },
        ...(sourceMode
          ? {
              execArgv: [
                '-r',
                require.resolve('ts-node/register/transpile-only'),
              ],
              env: {
                ...process.env,
                TS_NODE_PROJECT: join(__dirname, '../../../tsconfig.json'),
              },
            }
          : {}),
      },
    );
    let result: MatchingResult | undefined;
    let failure: Error | undefined;
    const timeout = setTimeout(() => {
      failure = new Error('Matching exceeded the 120 second limit.');
      void worker.terminate();
    }, 120_000);
    worker.once('message', (value: MatchingResult) => {
      result = value;
    });
    worker.once('error', (error: unknown) => {
      failure =
        error instanceof Error ? error : new Error('Matching worker failed.');
    });
    worker.once('exit', (code) => {
      clearTimeout(timeout);
      if (failure || code !== 0 || !result) {
        reject(
          failure ??
            new Error(`Matching worker exited without a result (${code}).`),
        );
      } else {
        resolve(result);
      }
    });
  });
}
