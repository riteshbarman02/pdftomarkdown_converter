/**
 * Minimal in-memory fixed-window rate limiter keyed by client address.
 *
 * This is per-process. For multi-instance deployments, replace `check` with a shared
 * store (for example Upstash Redis) behind the same interface.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __p2mRateBuckets?: Map<string, Bucket> };
const buckets = (g.__p2mRateBuckets ??= new Map<string, Bucket>());

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
): RateLimitResult {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip") || "local";
}

/** Test helper. */
export function resetRateLimits() {
  buckets.clear();
}
