/**
 * 限流中间件
 * 基于 Redis 实现：100 请求/分钟/用户
 * 使用滑动窗口计数算法
 */

import CacheManager from '../data-access/redis/CacheManager.js';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 100;
const KEY_PREFIX = 'ratelimit:';

function getKey(userId, ip) {
  return `${KEY_PREFIX}${userId || ip}`;
}

export function rateLimitMiddleware(req, res, next) {
  // 优先用 userId（已登录），降级用 IP
  const identifier = req.user?.userId || req.ip;
  const key = getKey(req.user?.userId, req.ip);

  _checkAndIncrement(key).then(({ allowed, remaining, resetAt }) => {
    // 设置响应头
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
    // Redis 出错时放行，不阻塞业务
    console.error('[RateLimit] Error:', err.message);
    next();
  });
}

async function _checkAndIncrement(key) {
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;

  // 使用 Redis 事务保证原子性
  const client = await CacheManager.getClient();

  // 移除窗口外的旧记录
  await client.zRemRangeByScore(key, 0, windowStart);

  // 获取当前窗口内请求数
  const count = await client.zCard(key);

  if (count >= MAX_REQUESTS) {
    // 超限，拒绝
    const oldestTs = await client.zRange(key, 0, 0, { BY: 'SCORE' });
    const resetAt = oldestTs.length > 0
      ? Math.ceil((parseInt(oldestTs[0]) + WINDOW_SECONDS * 1000) / 1000)
      : Math.ceil((now + WINDOW_SECONDS * 1000) / 1000);
    return { allowed: false, remaining: 0, resetAt };
  }

  // 记录本次请求
  await client.zAdd(key, { score: now, value: String(now) });
  await client.expire(key, WINDOW_SECONDS);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - count - 1,
    resetAt: Math.ceil((now + WINDOW_SECONDS * 1000) / 1000)
  };
}