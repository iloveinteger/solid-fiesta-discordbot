export interface ExchangeProviderResult {
  usdKrw: number;
  jpyKrw: number;
  dataDate: string;
  source: string;
}

export interface ExchangeProvider {
  fetchRates(): Promise<ExchangeProviderResult>;
}

interface FrankfurterResponse {
  date?: unknown;
  rates?: { KRW?: unknown; JPY?: unknown };
}

export class FrankfurterProvider implements ExchangeProvider {
  public constructor(private readonly fetcher: typeof fetch = fetch) {}

  public async fetchRates(): Promise<ExchangeProviderResult> {
    const response = await this.fetcher('https://api.frankfurter.app/latest?from=USD&to=KRW,JPY', {
      headers: { Accept: 'application/json', 'User-Agent': 'solid-fiesta-discordbot/1.0' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`환율 공급자가 HTTP ${response.status}을 반환했습니다.`);
    const body = (await response.json()) as FrankfurterResponse;
    const krw = body.rates?.KRW;
    const jpy = body.rates?.JPY;
    if (typeof krw !== 'number' || typeof jpy !== 'number' || typeof body.date !== 'string') {
      throw new Error('환율 공급자 응답 형식이 올바르지 않습니다.');
    }
    if (!Number.isFinite(krw) || !Number.isFinite(jpy) || krw <= 0 || jpy <= 0) {
      throw new Error('환율 공급자가 유효하지 않은 값을 반환했습니다.');
    }
    return {
      usdKrw: krw,
      jpyKrw: krw / jpy,
      dataDate: body.date,
      source: 'Frankfurter (유럽중앙은행 기준환율)',
    };
  }
}
