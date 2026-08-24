import type { ExchangeProvider, ExchangeProviderResult } from '../providers/exchange-provider.js';

interface CachedExchangeRates extends ExchangeProviderResult {
  fetchedAt: Date;
}

export interface ExchangeResult extends CachedExchangeRates {
  stale: boolean;
}

export class ExchangeService {
  private cached?: CachedExchangeRates;

  public constructor(
    private readonly provider: ExchangeProvider,
    private readonly cacheTtlMs = 10 * 60 * 1_000,
  ) {}

  public async getRates(): Promise<ExchangeResult> {
    const cached = this.cached;
    if (cached && Date.now() - cached.fetchedAt.getTime() < this.cacheTtlMs) {
      return { ...cached, stale: false };
    }
    try {
      const fresh = await this.provider.fetchRates();
      const stored = { ...fresh, fetchedAt: new Date() };
      this.cached = stored;
      return { ...stored, stale: false };
    } catch (error) {
      if (cached) return { ...cached, stale: true };
      throw error;
    }
  }
}
