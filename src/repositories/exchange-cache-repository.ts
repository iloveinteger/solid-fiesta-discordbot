import type { DatabaseSync } from 'node:sqlite';

export interface StoredExchangeRates {
  usdKrw: number;
  jpyKrw: number;
  dataDate: string;
  source: string;
  fetchedAt: Date;
}

export interface ExchangeCacheRepository {
  get(): StoredExchangeRates | undefined;
  put(value: StoredExchangeRates): void;
}

interface ExchangeRow {
  payload_json: string;
  fetched_at: string;
}

export class SqliteExchangeCacheRepository implements ExchangeCacheRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public get(): StoredExchangeRates | undefined {
    const row = this.database
      .prepare('SELECT payload_json, fetched_at FROM exchange_cache WHERE cache_key = ?')
      .get('frankfurter') as ExchangeRow | undefined;
    if (!row) return undefined;
    try {
      const value = JSON.parse(row.payload_json) as Omit<StoredExchangeRates, 'fetchedAt'>;
      if (
        typeof value.usdKrw !== 'number' ||
        typeof value.jpyKrw !== 'number' ||
        typeof value.dataDate !== 'string' ||
        typeof value.source !== 'string'
      ) {
        return undefined;
      }
      return { ...value, fetchedAt: new Date(row.fetched_at) };
    } catch {
      return undefined;
    }
  }

  public put(value: StoredExchangeRates): void {
    const payload = JSON.stringify({
      usdKrw: value.usdKrw,
      jpyKrw: value.jpyKrw,
      dataDate: value.dataDate,
      source: value.source,
    });
    this.database
      .prepare(
        `
        INSERT INTO exchange_cache (cache_key, payload_json, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          fetched_at = excluded.fetched_at
      `,
      )
      .run('frankfurter', payload, value.fetchedAt.toISOString());
  }
}
