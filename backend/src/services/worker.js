/**
 * Service Worker — 异步任务队列消费者
 * 从 Redis List (task:queue) 消费任务，调用对应 handler 处理
 * 处理结果写入 task:result:{taskId}，并通过 WebSocket 推送
 */

import CacheManager from '../data-access/redis/CacheManager.js';
import RealtimePusher from '../data-processing/RealtimePusher.js';
import { getHandler } from './handlerRegistry.js';

const QUEUE_KEY = 'task:queue';
const RESULT_TTL = 300; // 5min 结果过期时间
const POLL_INTERVAL_MS = 100; // 100ms 轮询一次

// 进行任务处理的主循环
let running = true;
let activePromise = null; // 当前运行中的 Worker Promise（用于 stop 后再 start）

export function stopWorker() {
  if (!running) return;
  running = false;
  // 静默切换 running 标志，避免 jest 测试期间打印噪声
}

export function isWorkerRunning() {
  return activePromise !== null;
}

export async function startWorker() {
  if (activePromise) return activePromise; // 已经在跑就不重复启动

  console.log('[Worker] 启动数据处理 Worker');

  // 优雅关闭（仅注册一次，避免重复监听）
  if (!stopWorker._signalsBound) {
    stopWorker._signalsBound = true;
    const stop = () => stopWorker();
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  }

  running = true;
  activePromise = _runLoop().finally(() => {
    activePromise = null;
  });
  return activePromise;
}

async function _runLoop() {
  while (running) {
    try {
      const taskStr = await CacheManager.dequeue(QUEUE_KEY);
      if (!taskStr) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      let task;
      try {
        task = JSON.parse(taskStr);
      } catch {
        console.warn('[Worker] 获取任务失败:', taskStr);
        continue;
      }

      console.log(`[Worker] 获取到任务 ${task.id} 类型=${task.type}`);
      const handler = getHandler(task.type);

      if (!handler) {
        console.warn(`[Worker] 未找到类型为 ${task.type} 的处理程序`);
        await _writeResult(task.id, task.tenantId, { status: 'failed', error: { message: `Unknown task type: ${task.type}` } });
        continue;
      }

      try {
        const resultData = await handler(task.payload, task);
        await _writeResult(task.id, task.tenantId, { status: 'success', data: resultData });
      } catch (err) {
        // console.error(`[Worker] 监听任务错误 ${task.id}:`, err.message);
        // console.error(`[Worker] 错误堆栈:`, err.stack);
        await _writeResult(task.id, task.tenantId, { status: 'failed', error: { message: err.message } });
      }
    } catch (err) {
      console.error('[Worker] 队列错误:', err.message);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  // 静默退出，避免 jest 把退出日志当成 "after tests are done" 警告
}

// 将处理结果写入 Redis，并通过 WebSocket 推送给前端
async function _writeResult(taskId, tenantId, result) {
  if (!result || typeof result !== 'object') {
    result = { status: 'failed', error: { message: 'Handler returned invalid result' } };
  }
  result.processedAt = new Date().toISOString();
  try {
    await CacheManager.set(`task:result:${taskId}`, JSON.stringify(result), RESULT_TTL);
    if (tenantId !== undefined && tenantId !== null) {
      RealtimePusher.pushTaskResult(tenantId, taskId, result);
    }
  } catch (err) {
    console.error('[Worker] 写入结果失败:', err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}