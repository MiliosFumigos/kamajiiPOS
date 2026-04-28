type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const analyticsCache = new Map<string, CacheEntry<unknown>>();

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
