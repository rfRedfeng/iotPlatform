import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 中间件
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json());

// 静态文件托管 (前端)
app.use(express.static(path.join(__dirname, '../../frontend')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// API 路由 (暂时注释，等实现后再启用)
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/devices', require('./routes/devices'));
// app.use('/api/users', require('./routes/users'));
// app.use('/api/areas', require('./routes/areas'));
// app.use('/api/alerts', require('./routes/alerts'));
// app.use('/api/dashboard', require('./routes/dashboard'));

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 IOT项目运行: http://localhost:${PORT}`);
    console.log(`📁 静态文件服务: http://localhost:${PORT}`);
    console.log(`🔧 API服务:  http://localhost:${PORT}/api`);
});

export default app;