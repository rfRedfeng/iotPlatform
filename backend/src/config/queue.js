/**
 * 异步任务队列配置
 *
 * 把 queue key 集中管理,而不是在 routes/services 散落硬编码。
 * 测试可通过 WORKER_QUEUE_KEY 环境变量使用独立 key,避免与生产 server 抢占。
 */

export const TASK_QUEUE_KEY = process.env.WORKER_QUEUE_KEY || 'task:queue';
export const TASK_RESULT_PREFIX = 'task:result:';
