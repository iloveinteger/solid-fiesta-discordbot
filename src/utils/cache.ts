export interface CacheValue<T> {
  value: T;
  storedAt: Date;
}

export class TtlCache<K, V> {
  readonly #entries = new Map<K, CacheValue<V>>();

  public constructor(private readonly ttlMs: number) {}

  public get(key: K, allowStale = false): CacheValue<V> | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (!allowStale && Date.now() - entry.storedAt.getTime() >= this.ttlMs) return undefined;
    return entry;
  }

  public set(key: K, value: V, storedAt = new Date()): CacheValue<V> {
    const entry = { value, storedAt };
    this.#entries.set(key, entry);
    return entry;
  }
}
