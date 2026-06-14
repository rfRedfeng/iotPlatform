import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

import RealtimePusher from './data-processing/RealtimePusher.js';
import DataPipeline from './data-processing/DataPipeline.js';
import DeviceTcpServer from './data-processing/protocol-adapters/DeviceTcpServer.js';
import { verifyRefreshToken } from './services/AuthService.js';
import routes from './routes/index.js';

// 加载环境变量
dotenv.config();

// @tdengine/websocket 内置的 winston-daily-rotate-file transport 在每次 WsClient 实例化时
// 都会给内部 stream 挂 error/finish 监听器。在测试 / 高频连接场景下会突破 Node 默认 10 个上限。
// 主动调高全局监听器数量，避免 MaxListenersExceededWarning 噪声。
process.setMaxListeners(50);

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 中间件
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// 静态文件托管 (前端)
app.use(express.static(path.join(__dirname, '../../frontend')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// API 路由（统一通过 routes/index.js 挂载，含中间件链）
app.use('/api', routes);

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ========== WebSocket 服务器 ==========
const server = http.createServer(app);

const wsServer = new WebSocketServer({ noServer: true });
RealtimePusher.init(wsServer);

// 处理 WebSocket upgrade 请求 —— 用 refreshToken 鉴权
server.on('upgrade', async (request, socket, head) => {
    try {
        // 1. 从 URL 拿 refreshToken（前端 ws.js 用 ?refreshToken=xxx 传）
        const url = new URL(request.url, `http://${request.headers.host}`);
        const refreshToken = url.searchParams.get('refreshToken');

        // 2. 验证（JWT 签名 + 数据库存在性）
        const user = await verifyRefreshToken(refreshToken);
        if (!user) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            console.warn('[ws upgrade] 鉴权失败,拒绝连接');
            return;
        }

        // 3. 鉴权通过:把 user 绑到 ws 实例,RealtimePusher.init() 会从 ws.user 读
        wsServer.handleUpgrade(request, socket, head, (ws) => {
            ws.user = { userId: user.userId, tenantId: user.tenantId, role: user.role };
            wsServer.emit('connection', ws, request);
        });
        console.log(`[ws upgrade] 鉴权通过: tenant=${user.tenantId} user=${user.userId}`);
    } catch (err) {
        console.error('[ws upgrade] 异常', err);
        try { socket.destroy(); } catch {}
    }
});

// ========== 启动 ==========
server.listen(PORT, async () => {
    console.log(`🚀 IOT项目运行: http://localhost:${PORT}`);
    console.log(`📁 静态文件服务: http://localhost:${PORT}`);
    console.log(`🔧 API服务: http://localhost:${PORT}/api`);

    try {
        // 静态导入确保 handler 在 Worker 启动前完成注册
        await import('./services/DeviceService.js');
        await import('./services/UserService.js');
        await import('./services/AreaService.js');
        await import('./services/AlertService.js');
        await import('./services/AuthService.js');
        await import('./services/TenantService.js');
        const { startWorker } = await import('./services/worker.js');
        startWorker();

        // TCP 设备上报服务器 (Device Key + Secret 认证)
        DeviceTcpServer.onData((device, metrics) =>
          DataPipeline.processDevicePayload(device, metrics)
        );
        await DeviceTcpServer.start();
    } catch (err) {
        console.error('[启动] 失败:', err.message);
    }
});

export default app;