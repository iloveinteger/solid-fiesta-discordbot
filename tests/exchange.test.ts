import { describe, expect, it, vi } from 'vitest';
import { FrankfurterProvider } from '../src/providers/exchange-provider.js';
import type {
  ExchangeCacheRepository,
  StoredExchangeRates,
} from '../src/repositories/exchange-cache-repository.js';
import { ExchangeService } from '../src/services/exchange-service.js';

class MemoryRepository implements ExchangeCacheRepository {
  public value?: StoredExchangeRates;
  public get(): StoredExchangeRates | undefined {
    return this.value;
  }
  public put(value: StoredExchangeRates): void {
    this.value = value;
  }
}

describe('환율', () => {
  it('USD 기준 응답에서 JPY/KRW를 계산한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ date: '2026-08-21', rates: { KRW: 1400, JPY: 140 } }), {
        status: 200,
      }),
    );
    await expect(new FrankfurterProvider(fetcher).fetchRates()).resolves.toMatchObject({
      usdKrw: 1400,
      jpyKrw: 10,
      dataDate: '2026-08-21',
    });
  });

  it('공급자 실패 시 마지막 정상 캐시와 시각을 반환한다', async () => {
    const repository = new MemoryRepository();
    repository.value = {
      usdKrw: 1300,
      jpyKrw: 9,
      dataDate: '2026-08-20',
      source: 'test',
      fetchedAt: new Date(0),
    };
    const provider = { fetchRates: vi.fn().mockRejectedValue(new Error('offline')) };
    const result = await new ExchangeService(provider, repository).getRates();
    expect(result).toMatchObject({ stale: true, usdKrw: 1300 });
    expect(result.fetchedAt).toEqual(new Date(0));
  });
});
