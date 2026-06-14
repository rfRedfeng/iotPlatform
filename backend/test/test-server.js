/**
 * 测试专用 App（不启动服务器）
 * 用于 Supertest 集成测试，直接导入 Express app 而不触发 server.listen()
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// 测试用独立队列 key,避免与生产运行的 server 抢占 (I-2 BLPOP 时代尤其重要)
// 必须在 import worker 之前设置,因为 worker 启动时读取 QUEUE_KEY
process.env.WORKER_QUEUE_KEY = `task:queue:test:${process.pid}:${Date.now()}`;

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 中间件
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// 静态文件
app.use(express.static(path.join(__dirname, '../../frontend')));

// API 路由
const { default: routes } = await import('../src/routes/index.js');
app.use('/api', routes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket 服务器（不启动，只初始化）
const server = http.createServer(app);
const wsServer = new WebSocketServer({ noServer: true });

// 延迟初始化 RealtimePusher（避免在测试中触发副作用）
let pusherInitialized = false;
function ensurePusher() {
  if (!pusherInitialized) {
    import('../src/data-processing/RealtimePusher.js').then(({ default: Pusher }) => {
      Pusher.init(wsServer);
      pusherInitialized = true;
    });
  }
}

server.on('upgrade', (request, socket, head) => {
  ensurePusher();
  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit('connection', ws, request);
  });
});

// 启动 Worker（异步任务消费者），让 POST 202 异步接口的测试能等到 task:result
let workerStartedOnce = false;
async function ensureWorker() {
  const { isWorkerRunning, startWorker } = await import('../src/services/worker.js');
  if (isWorkerRunning()) return; // 已经在跑，直接返回

  if (!workerStartedOnce) {
    workerStartedOnce = true;
    // 先把所有 service 静态导入，确保 handler 注册完成，再启动 worker
    await import('../src/services/DeviceService.js');
    await import('../src/services/UserService.js');
    await import('../src/services/AreaService.js');
    await import('../src/services/AlertService.js');
    await import('../src/services/AuthService.js');
    await import('../src/services/TenantService.js');
  }
  startWorker();
}
ensureWorker();

/**
 * 关闭后台 Worker，并等待循环退出，避免 "Cannot log after tests are done" 警告
 */
export async function closeWorker() {
  const { stopWorker, isWorkerRunning } = await import('../src/services/worker.js');
  if (!isWorkerRunning()) return;
  stopWorker();
  // BLPOP 最多阻塞 1s,等待它释放 + 一次 while 循环
  await new Promise(r => setTimeout(r, 1100));
}

/**
 * 测试文件最终关闭 Worker，并等待循环退出，避免 forceExit 强制杀进程
 */
export async function closeAllBackgroundWorkers() {
  const { stopWorker } = await import('../src/services/worker.js');
  stopWorker();
  await new Promise(r => setTimeout(r, 200));
}

// 每个测试文件结束时统一兜底关闭
process.once('beforeExit', () => stopWorker_safe());
async function stopWorker_safe() {
  try {
    const { stopWorker } = await import('../src/services/worker.js');
    stopWorker();
  } catch { /* 测试结束时模块可能已卸载 */ }
}

// 导出 app 和 createTestServer 函数
export { app, server };
export default app;