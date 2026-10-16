const Redis = require('ioredis');

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is missing. Add it to Server/.env (e.g. redis://localhost:6379).');
}

// BullMQ needs `maxRetriesPerRequest: null` because its workers hold blocking
// Redis commands open. Every connection is created the same way to keep it simple.
function createRedis() {
  return new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
}

const redis = createRedis();

// Fixed-window rate limit shared by every server instance. SET NX creates the
// counter with its expiry only once per window; INCR keeps that expiry.
async function isRateLimited(key, limit, windowSeconds) {
  const [, [, count]] = await redis
    .multi()
    .set(key, 0, 'EX', windowSeconds, 'NX')
    .incr(key)
    .exec();
  return count > limit;
}

module.exports = { redis, createRedis, isRateLimited };
