import { Worker } from 'node:worker_threads';
import type { FactorCacheRepository } from '../../repositories/factor-cache-repository.js';
import { formatFactors, parseNaturalNumber } from './number-theory.js';

interface WorkerResponse {
  factors?: string[];
  error?: string;
}

export interface FactorResult {
  input: bigint;
  factors: bigint[];
  formatted: string;
  cached: boolean;
}

export class FactorService {
  public constructor(
    private readonly repository: FactorCacheRepository,
    private readonly timeoutMs = 8_000,
    private readonly maximumDigits = 80,
  ) {}

  public async calculate(raw: string): Promise<FactorResult> {
    const input = parseNaturalNumber(raw, this.maximumDigits);
    const key = input.toString();
    const cached = this.repository.get(key);
    if (cached)
      return { input, factors: cached, formatted: formatFactors(input, cached), cached: true };

    const factors = await this.runWorker(key);
    this.repository.put(key, factors);
    return { input, factors, formatted: formatFactors(input, factors), cached: false };
  }

  private runWorker(input: string): Promise<bigint[]> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./factor-worker.js', import.meta.url), {
        workerData: { input },
      });
      const timeout = setTimeout(() => {
        void worker.terminate();
        reject(
          new Error(
            `계산 시간이 ${this.timeoutMs / 1_000}초를 초과했습니다. 더 작은 수를 입력해 주세요.`,
          ),
        );
      }, this.timeoutMs);

      worker.once('message', (message: WorkerResponse) => {
        clearTimeout(timeout);
        void worker.terminate();
        if (message.error) reject(new Error(message.error));
        else if (message.factors) resolve(message.factors.map(BigInt));
        else reject(new Error('계산 작업자가 올바른 결과를 반환하지 않았습니다.'));
      });
      worker.once('error', (error) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
      worker.once('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error('소인수분해 작업자가 비정상 종료했습니다.'));
        }
      });
    });
  }
}
