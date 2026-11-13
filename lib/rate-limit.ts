// Local process limiter. Replace with shared storage before multi-instance production deployment.
export function createRateLimiter(limit = 10, windowMs = 3_600_000) {
  const buckets = new Map<string, { count: number; expires: number }>();
  return (key: string, now = Date.now()): number => {
    for (const [id, bucket] of buckets) if (bucket.expires <= now) buckets.delete(id);
    const bucket = buckets.get(key) ?? { count: 0, expires: now + windowMs };
    if (bucket.count >= limit) return Math.max(1, Math.ceil((bucket.expires - now) / 1000));
    bucket.count++;
    buckets.set(key, bucket);
    return 0;
  };
}
export const checkGenerationLimit = createRateLimiter();
