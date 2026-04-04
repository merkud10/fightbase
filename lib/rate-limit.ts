type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

export function checkRateLimit(scope: string, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucketKey = `${scope}:${key}`;
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    const next: RateLimitEntry = {
      count: 1,
      resetAt: now + windowMs
    };
    buckets.set(bucketKey, next);

    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: next.resetAt
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt
    };
  }

  current.count += 1;
  buckets.set(bucketKey, current);

  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt
  };
}
