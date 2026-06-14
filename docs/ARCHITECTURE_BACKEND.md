# IoT Cloud Platform — 后端架构说明

> 基于代码实现，从后端模块职责、缓存机制、数据处理、任务队列等维度说明。

---

## 目录

1. [技术栈与项目结构](#1-技术栈与项目结构)
2. [整体架构](#2-整体架构)
3. [数据访问层](#3-数据访问层)
4. [缓存机制详解](#4-缓存机制详解)
5. [数据处理流程](#5-数据处理流程)
6. [异步任务队列](#6-异步任务队列)
7. [WebSocket实时推送](#7-websocket实时推送)
8. [路由与中间件](#8-路由与中间件)
9. [核心模块说明](#9-核心模块说明)
10. [数据库设计](#10-数据库设计)

---

## 1. 技术栈与项目结构

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| 运行时 | Node.js 18+ | ES Modules |
| 框架 | Express.js 4.18 | 轻量级 Web 框架 |
| 关系数据库 | MySQL 8.0 | 端口 3306，连接池 10 |
| 缓存 | Redis 7+ | 单例连接复用 |
| 时序数据库 | TDengine 3.2 | WebSocket 端口 6041 |
| MQTT | mqtt.js 5.3 | MQTT Broker 连接 |
| 协议库 | dgram / coap | UDP / CoAP 协议 |
| 实时通信 | ws (WebSocketServer) | 端口随 HTTP 升级 |
| 认证 | jsonwebtoken + bcrypt | HS256 + cost factor 12 |
| 安全 | helmet + cors + express-rate-limit | 安全头 + 跨域 + 限流 |

**后端目录结构**：

```
backend/
├── src/
│   ├── app.js                      # 应用入口
│   ├── config/
│   │   ├── database.js             # MySQL/Redis/TDengine 配置
│   │   └── jwt.js                  # JWT 密钥配置
│   ├── data-access/
│   │   ├── mysql/
│   │   │   ├── DataSourceManger.js  # MySQL 连接池管理
│   │   │   ├── models/              # 数据模型
│   │   │   │   ├── User.js / Device.js / Area.js
│   │   │   │   ├── Tenant.js / AlertRule.js / AlertEvent.js
│   │   │   │   └── RefreshToken.js
│   │   │   ├── repositories/        # 仓储层
│   │   │   │   ├── UserRepository.js
│   │   │   │   ├── DeviceRepository.js
│   │   │   │   ├── AreaRepository.js
│   │   │   │   ├── AlertRuleRepository.js
│   │   │   │   ├── AlertEventRepository.js
│   │   │   │   └── RefreshTokenRepository.js
│   │   │   └── utils/rowMapper.js    # 行映射工具
│   │   ├── redis/
│   │   │   ├── CacheManager.js      # Redis 单例连接封装
│   │   │   └── SessionStore.js      # 会话存储（待实现）
│   │   └── tdengine/
│   │       ├── TdDengineManger.js   # TDengine 连接池
│   │       └── TimeSeriesRepo.js     # 时序数据仓储
│   ├── data-processing/
│   │   ├── DataPipeline.js          # 数据处理流水线
│   │   ├── RealtimePusher.js       # WebSocket 推送
│   │   ├── protocol-adapters/       # 协议适配器
│   │   │   ├── MqttAdapter.js       # MQTT
│   │   │   ├── TcpAdapter.js        # TCP
│   │   │   ├── UdpAdapter.js        # UDP
│   │   │   ├── CoapAdapter.js       # CoAP
│   │   │   └── WebSocketAdapter.js   # WebSocket
│   │   ├── parsers/
│   │   │   └── JsonParser.js        # JSON 数据解析
│   │   ├── cache/                   # 业务缓存层
│   │   │   ├── MetricCache.js       # 设备最新指标
│   │   │   ├── DeviceCache.js       # 设备状态
│   │   │   └── AlertCache.js        # 告警规则/事件/计数
│   │   ├── alert-engine/
│   │   │   ├── RuleEvaluator.js     # 规则评估引擎
│   │   │   ├── Notifier.js          # 告警通知
│   │   │   └── AlertLogger.js       # 结构化日志
│   │   └── time-series/
│   │       └── DataIngestor.js      # 时序数据摄入
│   ├── middleware/
│   │   ├── auth.js                  # JWT 认证
│   │   ├── tenant.js                # 租户隔离
│   │   ├── rateLimit.js             # 限流
│   │   └── errorHandler.js          # 错误处理
│   ├── routes/
│   │   ├── index.js                 # 路由汇总
│   │   ├── auth.js / devices.js / users.js
│   │   ├── areas.js / alerts.js / dashboard.js / tenants.js
│   └── services/
│       ├── AuthService.js / DeviceService.js / UserService.js
│       ├── AreaService.js / AlertService.js / DashboardService.js
│       ├── TenantService.js
│       ├── handlerRegistry.js        # Handler 注册表
│       └── worker.js                 # 异步任务队列消费者
├── scripts/
│   └── init-db.js                   # 数据库初始化
└── package.json
```

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      协议接入层 (Protocol Adapters)               │
│           MQTT Broker │ TCP Server │ UDP Server │ CoAP Server     │
└─────────────────────────────┬───────────────────────────────────┘
                              │ 设备上报数据
┌─────────────────────────────┴───────────────────────────────────┐
│                    数据处理层 (DataPipeline)                      │
│  协议适配器 → JSON解析 → 设备认证 → 缓存写入 → 持久化 → 告警评估     │
│                                          ↓                       │
│                              RealtimePusher（WebSocket推送）      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                      数据访问层 (Data Access)                      │
│    MySQL (关系数据) │ Redis (缓存+队列) │ TDengine (时序数据)        │
└───────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────┴───────────────────────────────────┐
│                      API Gateway (Express)                        │
│         REST API: /api/auth/*  /api/devices/*  /api/dashboard/*   │
│         中间件链: JWT鉴权 → 租户隔离 → 限流                         │
│                              ↓                                    │
│                   异步任务入队 (Redis List: task:queue)            │
│                              ↓                                    │
│                 Service Worker (后台消费任务)                     │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据访问层

### 3.1 MySQL 连接池

`DataSourceManger.js` 使用 `mysql2` 的连接池：

```javascript
// 配置（database.js）
export const mysql = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,   // 最大 10 连接
  queueLimit: 0,
  timezone: '+08:00',
};
```

### 3.2 Repository 模式

每个实体有对应的 Repository，封装所有数据库操作：

| Repository | 职责 |
|-----------|------|
| `UserRepository` | 用户 CRUD（findByUsername/findById/findByTenantId/insert/update/delete） |
| `DeviceRepository` | 设备 CRUD（findById/findByTenantId/findByAreaId/updateStatus/update） |
| `AreaRepository` | 区域 CRUD（树形结构 findByTenantId/findByParentId） |
| `AlertRuleRepository` | 告警规则 CRUD（findByTenantIdAndDeviceId/findByTenantId） |
| `AlertEventRepository` | 告警事件 CRUD（create/findByTenantId/countUnacknowledged） |
| `RefreshTokenRepository` | 刷新令牌管理（create/findByToken/deleteByUserId） |

### 3.3 TDengine 连接池

`TdDengineManger.js` 使用 TDengine WebSocket 方式连接（端口 6041）：

```javascript
// 配置
export const tdengine = {
  host: process.env.TDENGINE_HOST || 'localhost',
  port: parseInt(process.env.TDENGINE_PORT || '6030'),
  user: process.env.TDENGINE_USER,
  password: process.env.TDENGINE_PASSWORD,
  database: process.env.TDENGINE_DB,
};
```

**TimeSeriesRepo** 读写时序数据：

```javascript
// 插入设备数据点（自动建子表）
insertDeviceDataPoint(deviceId, tenantId, areaId, deviceType, metrics)
// metrics 为 JSON 字符串：'{"temperature": 25.6, "humidity": 60.2}'

// 查询最新数据
getLatestDeviceData(deviceId, { page, pageSize })

// 按时间范围查询
getDeviceDataByTimeRange(deviceId, startTime, endTime, { page, pageSize })

// 插入设备状态点
insertDeviceStatusPoint(deviceId, tenantId, areaId, deviceType, status)
```

---

## 4. 缓存机制详解

### 4.1 Redis 单例连接

`CacheManager.js` 是 Redis 的唯一入口，整个进程生命周期内只连接一次：

```javascript
// 获取单例客户端
async getClient() {
  if (!this.client) {
    this.client = redis.createClient({ socket: { host, port }, password, database });
  }
  if (!this.connected) {
    await this.client.connect();
    this.connected = true;
  }
  return this.client;
}
```

### 4.2 缓存操作接口

| 操作类型 | 方法 | 说明 |
|---------|------|------|
| String | `set(key, value, ttl)` / `get(key)` / `del(key)` | 基本读写 |
| Hash | `hset(key, field, value)` / `hget(key, field)` / `hgetall(key)` | 哈希操作 |
| List FIFO | `enqueue(key, value)` / `dequeue(key)` | 任务队列 |
| List LIFO | `push(key, value)` / `pop(key)` | 栈操作 |
| 生命周期 | `getttl(key)` / `expirettl(key, ttl)` / `persistttl(key)` | TTL 管理 |

### 4.3 业务缓存层

在 CacheManager 之上封装了三层业务缓存：

**MetricCache** — 设备最新指标
```
Key: device:metrics:{deviceId}
Value: JSON 字符串 {"temperature": 25.6, "humidity": 60.2}
TTL: 60s
```

**DeviceCache** — 设备状态
```
Key: device:status:{deviceId}
Value: JSON 字符串 {"status": "online", "lastSeen": "ISO8601"}
TTL: 300s
```

**AlertCache** — 告警相关缓存
```
alert:duration:{deviceId}:{ruleId}  → 持续触发时间戳，TTL=durationSeconds+60s
alert:events:{deviceId}:{ruleId}    → 事件记录，TTL=3600s
alert:rules:{tenantId}             → 规则数组 JSON，TTL=300s
alert:count:{tenantId}             → 未确认告警计数，TTL=3600s
```

### 4.4 Cache-Aside 读模式

DeviceService 等服务层实现 Cache-Aside 模式：

```
getById(deviceId, tenantId):
  1. 先查 Redis `service:device:{deviceId}`
  2. 命中 → 校验 tenantId → 返回
  3. 未命中 → 查 MySQL → 校验 tenantId → 写入 Redis TTL=300s → 返回
```

写入操作后立即 `delete` 缓存，保持最终一致性。

---

## 5. 数据处理流程

### 5.1 DataPipeline 主流程

`DataPipeline.js` 是设备数据处理的核心流水线：

```
设备上报数据
    ↓
协议适配器解析（MqttAdapter / TcpAdapter / UdpAdapter / CoapAdapter）
    ↓
JsonParser.parse(rawData) → 提取 metrics 对象
    ↓
设备合法性校验（4 重校验）：
  - deviceId 存在
  - tenantId / areaId / deviceType 匹配
  - deviceKey + deviceSecret 认证
    ↓ (任一失败则 return)
写入 MetricCache.setMetrics(deviceId, metrics)        TTL=60s
写入 DeviceCache.setStatusWithTime(deviceId, 'online') TTL=300s
    ↓
DeviceRepository.update(deviceId, { status: 'online' })  更新 MySQL
DataIngestor.ingest() → TDengine 写入时序数据
    ↓
AlertRuleRep.findByTenantIdAndDeviceId()  查询该设备告警规则
    ↓ (无规则则跳过)
RuleEvaluator.evaluate() → 遍历规则，触发告警
    ↓
RealtimePusher.pushDeviceData()   WebSocket 推送指标
RealtimePusher.pushDeviceStatus() WebSocket 推送状态
```

### 5.2 告警规则评估 (RuleEvaluator)

支持两种触发模式：

**即时触发**（`durationSeconds = 0`）：
```
指标值满足条件 → 立即 triggerAlert() → AlertEventRep.create() + Notifier.notify()
```

**持续触发**（`durationSeconds > 0`）：
```
条件满足第1次 → 记录触发时间到 Redis `alert:duration:{deviceId}:{ruleId}`
条件持续满足 → 检查 elapsed >= durationSeconds → 触发 → 清除记录
条件不满足 → 清除记录，等待下次重新计时
```

支持的比较条件：`gt`, `lt`, `gte`, `lte`, `eq`, `ne`

### 5.3 设备数据 JSON 格式

TDengine 的 `metrics` 字段使用 `VARCHAR(4096)` 存储 JSON 字符串：

```json
// 温湿度传感器
{"temperature": 25.6, "humidity": 60.2}

// 气体检测器
{"CO2": 400, "PM2.5": 35, "formaldehyde": 0.02}

// GPS追踪器
{"lat": 39.9042, "lng": 116.4074, "altitude": 50.5, "speed": 0}
```

查询时使用 `metrics->>'$.key'` 语法提取特定指标。

---

## 6. 异步任务队列

### 6.1 架构设计

采用 **Producer → Redis Queue → Service Worker** 模式：

```
HTTP POST/PUT/DELETE 请求
    ↓
Routes 验证参数 → enqueue('task:queue', JSON.stringify(task))
    ↓
立即返回 HTTP 202 + { taskId }
    ↓
Service Worker 后台消费（100ms 轮询）
    ↓
getHandler(task.type) 找到 handler
    ↓
handler(task.payload, task) 执行业务逻辑
    ↓
_writeResult() → Redis `task:result:{taskId}` + RealtimePusher.pushTaskResult()
    ↓
WebSocket 推送 task_result 给前端
```

### 6.2 Redis 数据结构

| Key | 类型 | 说明 | TTL |
|-----|------|------|-----|
| `task:queue` | List | FIFO 任务队列 | 持久 |
| `task:result:{taskId}` | String (JSON) | 任务处理结果 | 300s (5min) |

### 6.3 任务结构

```javascript
{
  id: "uuid-xxx",           // 任务唯一ID
  type: "device.create",    // 操作类型（与 handlerRegistry 对应）
  payload: { ... },         // 业务数据
  tenantId: 1,
  userId: 5,
  timestamp: "ISO8601"
}
```

### 6.4 Handler 注册

各 Service 在模块加载时注册自己的 handler：

```javascript
// DeviceService.js 末尾
registerHandler('device.create', createDevice);
registerHandler('device.update', updateDevice);
registerHandler('device.delete', deleteDevice);
registerHandler('device.regenerate-secret', regenerateDeviceSecret);

// app.js 启动时静态导入，确保 handler 先于 Worker 完成注册
await import('./services/DeviceService.js');
startWorker();
```

### 6.5 已注册的 Handler

| Handler Type | Service | 用途 |
|-------------|---------|------|
| `device.create` | DeviceService | 创建设备，自动生成 deviceKey/secret |
| `device.update` | DeviceService | 更新设备，清除缓存 |
| `device.delete` | DeviceService | 删除设备，清除缓存和指标 |
| `device.regenerate-secret` | DeviceService | 重新生成 deviceSecret |
| `user.create` | UserService | 创建用户 |
| `user.update` | UserService | 更新用户 |
| `user.delete` | UserService | 删除用户 |
| `area.create` | AreaService | 创建区域 |
| `area.update` | AreaService | 更新区域 |
| `area.delete` | AreaService | 删除区域 |

---

## 7. WebSocket实时推送

### 7.1 连接鉴权

WebSocket 使用 **refreshToken**（非 accessToken）鉴权：

```
前端 ws.js: new WebSocket('ws://host/?refreshToken=xxx')
    ↓
后端 app.js upgrade handler:
  1. 从 URL 解析 refreshToken 参数
  2. verifyRefreshToken() 验证 JWT 签名 + 数据库存在性
  3. 鉴权通过 → 注入 ws.user = { userId, tenantId, role }
  4. 鉴权失败 → HTTP/1.1 401 → socket.destroy()
```

**为什么用 refreshToken？**
- accessToken 15分钟过期 → WS 长连接频繁断连
- refreshToken 7天有效期 → 连接生命周期内不会过期

### 7.2 客户端管理

RealtimePusher 按租户分组管理 WebSocket 连接：

```javascript
this.clients = new Map(); // tenantId → Set of { ws, userId }
```

- `_addClient(tenantId, ws, userId)` — 注册客户端
- `_removeClient(tenantId, ws)` — 移除客户端
- `pushToTenant(tenantId, payload)` — 向租户所有客户端推送，自动清理无效连接

### 7.3 推送消息类型

| type | 触发时机 | 核心字段 |
|------|---------|---------|
| `device_data` | DataPipeline 处理设备上报 | deviceId, metrics, timestamp |
| `device_status` | 设备上线/下线 | deviceId, status, timestamp |
| `alert` | RuleEvaluator 触发告警 | ruleName, metric, triggerValue |
| `task_result` | Worker 处理完异步任务 | taskId, status, taskType, data/error |

---

## 8. 路由与中间件

### 8.1 路由汇总 (routes/index.js)

```
/api/auth/*                    → 无需认证（公开路由）
/api/devices/*                 → auth → tenant → rateLimit → 子路由
/api/users/*                   → auth → tenant → rateLimit → 子路由
/api/areas/*                   → auth → tenant → rateLimit → 子路由
/api/alerts/*                  → auth → tenant → rateLimit → 子路由
/api/dashboard/*               → auth → tenant → rateLimit → 子路由
/api/tenants/*                 → auth → tenant → rateLimit → 子路由
```

### 8.2 中间件链

| 中间件 | 职责 |
|--------|------|
| `authMiddleware` | 解析 Bearer Token，验证 JWT，注入 `req.user = { userId, tenantId, role }` |
| `tenantMiddleware` | 从 JWT 提取 tenantId，写入 `req.tenantId`，用于数据隔离 |
| `rateLimitMiddleware` | 100 请求/分钟/用户限流（express-rate-limit） |
| `errorHandler` | 统一错误处理，返回 `{ success: false, error: { message } }` |
| `notFoundHandler` | 404 处理 |

---

## 9. 核心模块说明

### 9.1 应用入口 (app.js)

```javascript
// 1. Express 中间件
app.use(helmet());                    // 安全头
app.use(cors({ origin: '*' }));       // 跨域
app.use(express.json());              // JSON 解析

// 2. 静态文件托管（前端）
app.use(express.static('../../frontend'));
app.get('/', () → sendFile index.html);

// 3. API 路由
app.use('/api', routes);              // 包含中间件链

// 4. 健康检查
app.get('/health', () → { status: 'ok', uptime, timestamp });

// 5. WebSocket 服务器
const wsServer = new WebSocketServer({ noServer: true });
RealtimePusher.init(wsServer);

// 6. Upgrade 处理（WS 鉴权）
server.on('upgrade', async (request, socket, head) {
  const refreshToken = new URL(req.url).searchParams.get('refreshToken');
  const user = await verifyRefreshToken(refreshToken);
  if (!user) { socket.write('HTTP/1.1 401'); socket.destroy(); return; }
  wsServer.handleUpgrade(req, socket, head, (ws) => {
    ws.user = { userId, tenantId, role };
    wsServer.emit('connection', ws, req);
  });
});

// 7. 启动服务 + Worker
server.listen(PORT, async () => {
  await import('./services/DeviceService.js');  // 注册 handler
  await import('./services/UserService.js');
  // ...
  const { startWorker } = await import('./services/worker.js');
  startWorker();  // 后台运行，不阻塞 Express
});
```

### 9.2 协议适配器

| 适配器 | 协议 | 关键能力 |
|--------|------|---------|
| **MqttAdapter** | MQTT | connect / subscribe / unsubscribe / publish / disconnect |
| **TcpAdapter** | TCP | 事件回调注册 |
| **UdpAdapter** | UDP | 数据报接收 |
| **CoapAdapter** | CoAP | 协议转换 |
| **WebSocketAdapter** | WebSocket | 双向通信 |

每个适配器通过 `onMessage(callback)` 注册消息处理回调，回调内调用 `DataPipeline.processData()`。

### 9.3 TDengine 超表设计

```
超表 device_data:
  列: ts TIMESTAMP（自动索引）, metrics VARCHAR(4096)
  TAG: device_id INT, tenant_id INT, area_id INT, device_type VARCHAR(50)

子表 d{deviceId}:  每个设备一个子表
  CREATE TABLE IF NOT EXISTS d1001 USING device_data TAGS (1001, 1, 5, 'temperature_sensor');
  INSERT INTO d1001 VALUES (NOW, '{"temperature": 25.6, "humidity": 60.2}');

超表 device_status:
  列: ts TIMESTAMP, status VARCHAR(20)
  TAG: device_id INT, tenant_id INT, area_id INT, device_type VARCHAR(50)

子表 s{deviceId}:  设备状态子表
  INSERT INTO s1001 VALUES (NOW, 'online');
```

---

## 10. 数据库设计

### 10.1 MySQL 核心表

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `tenants` | 租户表 | id, name, status, max_devices, max_users |
| `users` | 用户表 | id, tenant_id, username, password_hash, role |
| `areas` | 区域表（树形） | id, tenant_id, parent_id, name, code |
| `devices` | 设备表 | id, tenant_id, area_id, name, device_key, device_secret, protocol, device_type, status |
| `device_configs` | 设备配置 | id, device_id, config_key, config_value |
| `alert_rules` | 告警规则 | id, tenant_id, device_id, name, metric, condition, threshold, duration_seconds, enabled |
| `alert_events` | 告警事件 | id, rule_id, device_id, trigger_value, triggered_at, acknowledged |
| `refresh_tokens` | 刷新令牌 | id, user_id, token, expires_at |

### 10.2 TDengine 表

| 表/超表 | 说明 | 列 | TAG |
|---------|------|-----|-----|
| `device_data` | 设备数据超表 | ts, metrics | device_id, tenant_id, area_id, device_type |
| `device_status` | 设备状态超表 | ts, status | device_id, tenant_id, area_id, device_type |

### 10.3 启动命令

```bash
cd backend
npm install
node scripts/init-db.js    # 首次运行，初始化数据库
npm start                  # 端口 3000
```

---

*本文档版本: v1.0*
*生成日期: 2026-06-14*
*基于代码实现: backend/src/*