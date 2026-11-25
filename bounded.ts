// A `Map` that holds at most `max` entries, dropping the one used longest ago to make room: for
// what the app keeps in memory for a session (posts passed between pages, long texts asked for),
// which would otherwise grow for as long as the app stays open.

export class BoundedMap<K, V> extends Map<K, V> {
  constructor(readonly max: number) {
    super();
  }

  /** The value, which now counts as the one used last. */
  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    const value = super.get(key)!;
    super.delete(key);
    super.set(key, value);
    return value;
  }

  /** Sets the value as the one used last; past `max`, drops the one used longest ago. */
  override set(key: K, value: V): this {
    if (this.max <= 0) {
      super.clear();
      return this;
    }
    super.delete(key);
    super.set(key, value);
    // A `Map` iterates in insertion order: its first key is the one used longest ago.
    while (this.size > this.max) super.delete(super.keys().next().value as K);
    return this;
  }
}
