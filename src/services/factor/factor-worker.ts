import { parentPort, workerData } from 'node:worker_threads';
import { factorize } from './number-theory.js';

const input = (workerData as { input: string }).input;

try {
  parentPort?.postMessage({ factors: factorize(BigInt(input)).map(String) });
} catch (error) {
  parentPort?.postMessage({
    error: error instanceof Error ? error.message : '계산에 실패했습니다.',
  });
}
