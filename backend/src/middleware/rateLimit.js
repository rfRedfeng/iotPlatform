/**
 * 限流中间件
 * 基于 Redis 实现：100 请求/分钟/用户
 * 使用滑动窗口计数算法，Lua 脚本保证原子性
 */

import CacheManager from '../data-access/redis/CacheManager.js';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 100;
const KEY_PREFIX = 'ratelimit:';

// Lua 脚本：原子化执行滑动窗口限流检查 + 计数
// KEYS[1] = rate limit key
// ARGV[1] = now timestamp (ms)
// ARGV[2] = windowStart timestamp (ms)
// ARGV[3] = TTL seconds
// ARGV[4] = max requests
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local maxReq = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

local count = redis.call('ZCARD', key)
if count >= maxReq then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'BY', 'SCORE')
  local resetAt = 0
  if oldest and #oldest > 0 then
    resetAt = math.ceil((tonumber(oldest[1]) + ttl * 1000) / 1000)
  else
    resetAt = math.ceil((now + ttl * 1000) / 1000)
  end
  return {0, 0, resetAt}
end

redis.call('ZADD', key, now, tostring(now))
redis.call('EXPIRE', key, ttl)

return {1, maxReq - count - 1, math.ceil((now + ttl * 1000) / 1000)}
`;

export function rateLimitMiddleware(req, res, next) {
  // 测试环境下跳过限流（jest 高频调用会偶发 redis 连接抖动，且对测试无意义）
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const userId = req.user?.userId;
  const identifier = userId ?? req.ip;
  const key = `${KEY_PREFIX}${String(identifier)}`;

  _checkAndIncrement(key).then(({ allowed, remaining, resetAt }) => {
    res.set({
      'X-RateLimit-Limit': MAX_REQUESTS,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': resetAt
    });

    if (!allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 429,
          message: 'Too many requests, please try again later'
        }
      });
    }

    next();
  }).catch(err => {
    console.error('[RateLimit] Error:', err.message);
    next();
  });
}

async function _checkAndIncrement(key) {
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;

  const client = await CacheManager.getClient();
  const result = await client.eval(RATE_LIMIT_SCRIPT, {
    keys: [key],
    arguments: [now, windowStart, WINDOW_SECONDS, MAX_REQUESTS]
  });

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    resetAt: result[2]
  };
}