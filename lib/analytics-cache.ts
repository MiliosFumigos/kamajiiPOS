type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const analyticsCache = new Map<string, CacheEntry<unknown>>();
const analyticsInFlight = new Map<string, Promise<unknown>>();

export function getCachedAnalytics<T>(key: string): T | null {
  const cached = analyticsCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    analyticsCache.delete(key);
    return null;
  }
  return cached.value as T;
}

export function setCachedAnalytics<T>(key: string, value: T, ttlMs = 5 * 60 * 1000) {
  analyticsCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearAnalyticsCache(prefix?: string) {
  if (!prefix) {
    analyticsCache.clear();
    return;
  }
  for (const key of Array.from(analyticsCache.keys())) {
    if (key.startsWith(prefix)) analyticsCache.delete(key);
  }
}

export function getOrCreateInFlightAnalytics<T>(
  key: string,
  factory: () => Promise<T>
): { promise: Promise<T>; isNew: boolean } {
  const existing = analyticsInFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    return { promise: existing, isNew: false };
  }

  const created = factory().finally(() => {
    analyticsInFlight.delete(key);
  });
  analyticsInFlight.set(key, created);
  return { promise: created, isNew: true };
}
