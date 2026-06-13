/**
 * Jest 全局测试设置
 * 在所有测试之前运行，设置环境变量和全局状态
 */
import 'dotenv/config';

// 设置测试环境
process.env.NODE_ENV = 'test';

// 确保 JWT_SECRET 已设置（否则 jwt.js 会 process.exit）
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
}

// 清理 Redis 队列的辅助函数（供各测试文件调用）
export async function clearRedisQueue() {
  const CacheManager = (await import('../src/data-access/redis/CacheManager.js')).default;
  const client = await CacheManager.getClient();

  // 清空 task:queue
  while (true) {
    const item = await CacheManager.dequeue('task:queue');
    if (!item) break;
  }

  // 清空 task:result:*
  const keys = await client.keys('task:result:*');
  for (const key of keys) {
    await CacheManager.del(key);
  }
}