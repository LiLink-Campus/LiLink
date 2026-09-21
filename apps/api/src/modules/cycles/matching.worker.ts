import { parentPort, workerData } from 'node:worker_threads';
import { MatchingEngine, type MatchingInput } from './matching.engine';

if (!parentPort) throw new Error('Matching must run in a worker.');
parentPort.postMessage(
  new MatchingEngine((stage) => {
    console.log(JSON.stringify({ kind: 'matching-performance', ...stage }));
  }).calculate(workerData as MatchingInput),
);
