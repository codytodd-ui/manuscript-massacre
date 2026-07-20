// Manuscript Mentors — minimal in-memory sliding-window rate limiter.
//
// Good enough to stop casual abuse on a single long-lived server. On serverless
// each instance has its own memory, so for real protection at scale use a shared
// store (e.g. Upstash Redis rate limiting). Distinct buckets keep, e.g., login
// attempts separate from critique spend.

const buckets = new Map(); // key -> number[] (timestamps)

export function rateLimit(key, { limit = 40, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const fresh = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - fresh[0])) / 1000));
    return { ok: false, retryAfter };
  }
  fresh.push(now);
  buckets.set(key, fresh);
  // Opportunistic cleanup so the Map doesn't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, arr] of buckets) {
      const live = arr.filter((t) => now - t < windowMs);
      if (live.length) buckets.set(k, live); else buckets.delete(k);
    }
  }
  return { ok: true, remaining: limit - fresh.length };
}

export function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  const real = req.headers && req.headers['x-real-ip'];
  if (real) return String(real);
  return (req.socket && req.socket.remoteAddress) || 'local';
}
