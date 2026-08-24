import type { DatabaseSync } from 'node:sqlite';

interface FactorRow {
  factors_json: string;
}

export interface FactorCacheRepository {
  get(input: string): bigint[] | undefined;
  put(input: string, factors: readonly bigint[]): void;
}

export class SqliteFactorCacheRepository implements FactorCacheRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public get(input: string): bigint[] | undefined {
    const row = this.database
      .prepare('SELECT factors_json FROM factor_cache WHERE input = ?')
      .get(input) as FactorRow | undefined;
    if (!row) return undefined;
    const parsed: unknown = JSON.parse(row.factors_json);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      return undefined;
    }
    return parsed.map((item) => BigInt(item));
  }

  public put(input: string, factors: readonly bigint[]): void {
    this.database
      .prepare(
        `
        INSERT INTO factor_cache (input, factors_json, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(input) DO UPDATE SET
          factors_json = excluded.factors_json,
          created_at = excluded.created_at
      `,
      )
      .run(input, JSON.stringify(factors.map(String)), new Date().toISOString());
  }
}
