/**
 * 测试辅助：Redis 队列操作
 * 用于验证任务入队、检查任务结果
 */
import CacheManager from '../../src/data-access/redis/CacheManager.js';

const RESULT_TTL = 300;

/**
 * 向任务队列写入一个任务
 */
export async function enqueueTask(task) {
  return await CacheManager.enqueue('task:queue', JSON.stringify(task));
}

/**
 * 从任务队列取出一个任务
 */
export async function dequeueTask() {
  return await CacheManager.dequeue('task:queue');
}

/**
 * 等待任务结果（轮询直到完成或超时）
 * @param {string} taskId
 * @param {number} timeoutMs
 * @param {number} intervalMs
 * @returns {Promise<object|null>}
 */
export async function waitForTaskResult(taskId, timeoutMs = 5000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await CacheManager.get(`task:result:${taskId}`);
    if (raw) {
      return JSON.parse(raw);
    }
    await sleep(intervalMs);
  }
  return null;
}

/**
 * 手动写入任务结果（模拟 Worker 行为）
 */
export async function writeTaskResult(taskId, tenantId, result) {
  result.processedAt = new Date().toISOString();
  await CacheManager.set(`task:result:${taskId}`, JSON.stringify(result), RESULT_TTL);
}

/**
 * 清空任务队列和所有结果
 */
export async function clearQueue() {
  const client = await CacheManager.getClient();
  // 清空所有 task:result:* keys（简单处理）
  // 注意：这会清空所有 key，测试专用
  const keys = await client.keys('task:result:*');
  for (const key of keys) {
    await CacheManager.del(key);
  }
  // 清空队列
  while (true) {
    const item = await CacheManager.dequeue('task:queue');
    if (!item) break;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}