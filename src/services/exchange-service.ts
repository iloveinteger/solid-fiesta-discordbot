import type {
  ExchangeCacheRepository,
  StoredExchangeRates,
} from '../repositories/exchange-cache-repository.js';
import type { ExchangeProvider } from '../providers/exchange-provider.js';

export interface ExchangeResult extends StoredExchangeRates {
  stale: boolean;
}

export class ExchangeService {
  public constructor(
    private readonly provider: ExchangeProvider,
    private readonly repository: ExchangeCacheRepository,
    private readonly cacheTtlMs = 10 * 60 * 1_000,
  ) {}

  public async getRates(): Promise<ExchangeResult> {
    const cached = this.repository.get();
    if (cached && Date.now() - cached.fetchedAt.getTime() < this.cacheTtlMs) {
      return { ...cached, stale: false };
    }
    try {
      const fresh = await this.provider.fetchRates();
      const stored = { ...fresh, fetchedAt: new Date() };
      this.repository.put(stored);
      return { ...stored, stale: false };
    } catch (error) {
      if (cached) return { ...cached, stale: true };
      throw error;
    }
  }
}
