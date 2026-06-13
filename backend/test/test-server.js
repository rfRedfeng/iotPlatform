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

// 导出 app 和 createTestServer 函数
export { app, server };
export default app;