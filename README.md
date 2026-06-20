# IoT Cloud Platform

**多租户物联网设备云平台** — 支持全协议（MQTT/TCP/UDP/CoAP）设备接入，提供设备管理、用户管理、区域管理、数据可视化仪表盘、告警管理等核心功能。

---

## 一、项目概述

### 1.1 项目目标

构建一个**多租户**物联网设备云平台，实现以下目标：

- 支持多种设备通信协议（MQTT/TCP/UDP/CoAP）的统一接入
- 提供完整的设备管理、用户管理、区域管理功能
- 实现数据可视化仪表盘，支持实时数据展示与历史趋势分析
- 建立灵活的告警引擎，支持阈值告警与 Webhook 通知
- 实现租户间数据完全隔离，保障安全性

### 1.2 目标用户

| 用户角色 | 说明 |
|---------|------|
| **系统管理员 (admin)** | 管理所有租户、系统配置 |
| **租户管理员 (manager)** | 管理本租户内的用户、设备、区域 |
| **普通用户 (user)** | 查看和管理有权限的设备、告警 |

### 1.3 技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端 | Vanilla JS (ES2022) + ES Modules，Chart.js，本地 CSS |
| 后端 | Node.js 18+ + Express，ES Modules |
| 关系数据库 | MySQL 8.0 |
| 缓存 | Redis 7+ |
| 时序数据库 | TDengine 3.2（WebSocket 连接，端口 6041） |
| 协议接入 | MQTT (mqtt.js) / TCP / UDP / CoAP |
| 实时通信 | WebSocket (ws 库) |
| 认证 | JWT (Access Token 15min + Refresh Token 7d) + bcrypt |

### 1.4 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Vanilla JS SPA)                    │
│         设备管理 / 用户管理 / 区域管理 / 仪表盘 / 告警管理         │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ REST API / WebSocket
┌─────────────────────────────────┴───────────────────────────────┐
│                      API Gateway Layer (Express)                │
│                 路由、鉴权、限流、租户隔离、中间件链               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────┐
│                     Business Service Layer                      │
│        用户服务 / 设备服务 / 区域服务 / 告警服务 / 仪表盘服务       │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────┐
│                      Data Processing Layer                      │
│    协议适配器 │ 数据解析 │ 缓存管理 │ 告警引擎 │ 时序数据处理       │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────┐
│                       Data Access Layer                         │
│          MySQL (关系数据) │ Redis (缓存/队列) │ TDengine (时序)   │
└─────────────────────────────────┴───────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────┐
│                     Protocol Adapters                           │
│           MQTT Broker │ TCP Server │ UDP Server │ CoAP Server   │
└─────────────────────────────────┴───────────────────────────────┘
```

---

## 二、数据库设计

### 2.1 MySQL 表结构

#### 租户表 (tenants)
```sql
CREATE TABLE tenants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    status ENUM('active', 'suspended') DEFAULT 'active',
    max_devices INT DEFAULT 100,
    max_users INT DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 用户表 (users)
```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL DEFAULT 0,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'user') DEFAULT 'user',
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```
> **注意**：`role='admin'` 的系统管理员属于 `tenant_id=0` 的系统租户。

#### 区域表 (areas)
```sql
CREATE TABLE areas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    parent_id INT DEFAULT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (parent_id) REFERENCES areas(id)
);
```
> 支持树形结构，用于多级楼层/区域管理。

#### 设备表 (devices)
```sql
CREATE TABLE devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    area_id INT,
    name VARCHAR(100) NOT NULL,
    device_key VARCHAR(64) NOT NULL UNIQUE,
    device_secret VARCHAR(128) NOT NULL,
    protocol ENUM('mqtt', 'tcp', 'udp', 'coap') NOT NULL,
    device_type VARCHAR(50) NOT NULL DEFAULT 'generic',
    status ENUM('online', 'offline', 'inactive') DEFAULT 'offline',
    last_seen TIMESTAMP NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (area_id) REFERENCES areas(id)
);
```

#### 设备配置表 (device_configs)
```sql
CREATE TABLE device_configs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL,
    config_key VARCHAR(50) NOT NULL,
    config_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id)
);
```

#### 告警规则表 (alert_rules)
```sql
CREATE TABLE alert_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    device_id INT,
    name VARCHAR(100) NOT NULL,
    metric VARCHAR(50) NOT NULL,
    condition ENUM('gt', 'lt', 'eq', 'gte', 'lte', 'ne') NOT NULL,
    threshold DECIMAL(20, 6) NOT NULL,
    duration_seconds INT DEFAULT 0,
    severity ENUM('info', 'warning', 'error', 'critical') DEFAULT 'warning',
    webhook_url VARCHAR(500),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);
```

#### 告警事件表 (alert_events)
```sql
CREATE TABLE alert_events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    rule_id INT NOT NULL,
    device_id INT NOT NULL,
    trigger_value DECIMAL(20, 6) NOT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by INT NULL,
    acknowledged_at TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (rule_id) REFERENCES alert_rules(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);
```

#### 刷新令牌表 (refresh_tokens)
```sql
CREATE TABLE refresh_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 2.2 TDengine 时序数据库

**建库语句**：
```sql
CREATE DATABASE iot_db KEEP 30 BUFFER 256;
```

**设备数据超级表**：
```sql
CREATE STABLE device_data (
    ts TIMESTAMP,
    metrics VARCHAR(4096)
) TAGS (
    device_id INT,
    tenant_id INT,
    area_id INT,
    device_type VARCHAR(50)
);
```

**设备状态超级表**：
```sql
CREATE STABLE device_status (
    ts TIMESTAMP,
    status VARCHAR(20)
) TAGS (
    device_id INT,
    tenant_id INT,
    area_id INT,
    device_type VARCHAR(50)
);
```

> **设计说明**：TDengine 3.2.x 不支持 JSON 列类型，`metrics` 使用 `VARCHAR(4096)` 存储 JSON 字符串，查询语法与 JSON 类型完全兼容（`metrics->>'$.key'`）。

### 2.3 Redis 数据结构

| Key 模式 | 类型 | 说明 | TTL |
|---------|------|------|-----|
| `task:queue` | List | 异步任务队列（FIFO） | 持久 |
| `task:result:{taskId}` | String | 任务处理结果 | 5min |
| `device:status:{id}` | String | 设备在线状态 | 5min |
| `metrics:{deviceId}` | String | 设备最新指标数据 | 5min |
| `alert:rules:{tenantId}` | String | 告警规则缓存 | 5min |
| `alert:count:{tenantId}` | String | 租户活跃告警计数 | 5min |

---

## 三、项目文件说明

### 3.1 后端目录结构

```
backend/
├── src/
│   ├── app.js                    # 应用入口
│   ├── config/                   # 配置文件
│   │   ├── database.js           # MySQL 连接配置
│   │   ├── jwt.js                # JWT 密钥配置
│   │   └── queue.js              # Redis 队列配置
│   ├── data-access/              # 数据访问层
│   │   ├── mysql/
│   │   │   ├── models/          # 数据模型
│   │   │   │   ├── User.js
│   │   │   │   ├── Device.js
│   │   │   │   ├── Area.js
│   │   │   │   ├── Tenant.js
│   │   │   │   ├── AlertRule.js
│   │   │   │   └── AlertEvent.js
│   │   │   └── repositories/    # 仓储实现
│   │   │       ├── UserRepository.js
│   │   │       ├── DeviceRepository.js
│   │   │       ├── AreaRepository.js
│   │   │       ├── AlertRuleRepository.js
│   │   │       └── AlertEventRepository.js
│   │   ├── redis/
│   │   │   └── CacheManager.js  # Redis 缓存管理（单例连接复用）
│   │   └── tdengine/
│   │       └── TimeSeriesRepo.js # TDengine 时序数据访问
│   ├── data-processing/          # 数据处理层
│   │   ├── DataPipeline.js       # 数据处理流水线
│   │   ├── RealtimePusher.js    # WebSocket 实时推送
│   │   ├── protocol-adapters/    # 协议适配器
│   │   │   ├── DeviceTcpServer.js # TCP 设备服务器
│   │   │   ├── TcpAdapter.js
│   │   │   ├── UdpAdapter.js
│   │   │   ├── CoapAdapter.js
│   │   │   └── WebSocketAdapter.js
│   │   ├── parsers/
│   │   │   └── JsonParser.js     # JSON 数据解析
│   │   ├── cache/               # 业务缓存
│   │   │   ├── DeviceCache.js
│   │   │   ├── MetricCache.js
│   │   │   └── AlertCache.js
│   │   ├── alert-engine/         # 告警引擎
│   │   │   ├── RuleEvaluator.js
│   │   │   ├── Notifier.js
│   │   │   ├── AlertLogger.js
│   │   │   └── WebhookNotifier.js
│   │   └── time-series/
│   │       └── DataIngestor.js
│   ├── middleware/               # 中间件
│   │   ├── auth.js              # JWT 认证
│   │   ├── tenant.js             # 租户隔离
│   │   ├── rateLimit.js         # 限流
│   │   └── errorHandler.js      # 错误处理
│   ├── routes/                  # 路由层
│   │   ├── index.js             # 路由汇总
│   │   ├── auth.js              # 认证路由
│   │   ├── users.js             # 用户路由
│   │   ├── devices.js           # 设备路由
│   │   ├── areas.js             # 区域路由
│   │   ├── alerts.js            # 告警路由
│   │   ├── dashboard.js         # 仪表盘路由
│   │   └── tenants.js           # 租户路由
│   ├── services/                # 业务服务层
│   │   ├── AuthService.js
│   │   ├── UserService.js
│   │   ├── DeviceService.js
│   │   ├── AreaService.js
│   │   ├── AlertService.js
│   │   ├── DashboardService.js
│   │   ├── TenantService.js
│   │   ├── handlerRegistry.js
│   │   └── worker.js            # 异步任务 Worker
│   └── utils/
│       └── sqlSanitizer.js      # SQL 注入防御
├── scripts/
│   └── init-db.js               # 数据库初始化
└── .env                         # 环境变量
```

### 3.2 前端目录结构

```
frontend/
├── index.html                    # 单页入口
├── styles/
│   └── main.css                  # 样式表
├── scripts/
│   ├── app.js                   # 应用入口
│   ├── router.js                # Hash 路由
│   ├── state.js                 # 状态管理
│   ├── api.js                   # API 调用封装
│   ├── ws.js                    # WebSocket 客户端
│   ├── utils.js                 # 工具函数
│   ├── components/              # UI 组件
│   └── pages/                   # 页面模块
├── lib/
│   └── chart.umd.js             # Chart.js 本地副本
└── assets/
    └── images/
```

### 3.3 核心模块说明

| 模块 | 文件路径 | 功能说明 |
|------|---------|---------|
| **DataPipeline** | `data-processing/DataPipeline.js` | 设备数据处理流水线：解析→缓存→持久化→告警评估→实时推送 |
| **RealtimePusher** | `data-processing/RealtimePusher.js` | WebSocket 实时推送，按租户分组管理连接 |
| **DeviceTcpServer** | `data-processing/protocol-adapters/DeviceTcpServer.js` | TCP 设备接入服务器，JSON 协议认证 |
| **JsonParser** | `data-processing/parsers/JsonParser.js` | 统一 JSON 数据解析，支持单例模式 |
| **RuleEvaluator** | `data-processing/alert-engine/RuleEvaluator.js` | 告警规则评估，支持 durationSeconds 持续检测 |
| **WebhookNotifier** | `data-processing/alert-engine/WebhookNotifier.js` | HTTP Webhook 通知，带重试机制 |
| **CacheManager** | `data-access/redis/CacheManager.js` | Redis 缓存管理，单例连接复用 |
| **TimeSeriesRepo** | `data-access/tdengine/TimeSeriesRepo.js` | TDengine 时序数据存取 |
| **Worker** | `services/worker.js` | 异步任务消费者，从 Redis 队列获取任务 |

---

## 四、项目展示

### 4.1 主要功能页面

| 页面 | 路由 | 功能描述 |
|------|------|---------|
| 登录页 | `/login` | 用户名密码登录，JWT 存储 |
| 仪表盘 | `/dashboard` | 数据概览、实时数据、告警列表、趋势图表 |
| 设备列表 | `/devices` | 设备 CRUD、状态筛选、搜索 |
| 设备详情 | `/devices/:id` | 单设备数据历史、配置管理 |
| 用户管理 | `/users` | 用户 CRUD、角色分配 |
| 区域管理 | `/areas` | 树形区域管理、设备分配 |
| 告警管理 | `/alerts` | 告警规则配置、事件查看、确认 |

### 4.2 设备接入流程

```
设备连接 → 协议握手 → 设备认证(deviceKey + deviceSecret) → 会话建立
                                      ↓
设备上报数据 → JSON 解析 → 数据验证 → 缓存(Redis) → 告警评估 → 时序存储(TDengine)
                                      ↓
                              实时推送(WebSocket) → 前端仪表盘
```

### 4.3 WebSocket 消息类型

| type | 说明 | 触发时机 |
|------|------|---------|
| `device_data` | 设备最新指标数据 | DataPipeline 处理设备上报 |
| `device_status` | 设备状态变更 | 设备上线/下线 |
| `alert` | 告警触发通知 | RuleEvaluator 触发告警 |
| `task_result` | 异步任务处理结果 | Worker 处理完成 |

### 4.4 告警通知

- **界面展示**：通过 WebSocket 实时推送到前端
- **Webhook 通知**：支持 HTTP POST 回调，包含告警详情（severity/metric/threshold/triggerValue）

---

## 五、项目实现

### 5.1 异步任务队列架构

**设计模式**：Route（Producer）→ Redis Queue → Service Worker（Consumer）

```
用户 HTTP 请求
    ↓
Routes（验证参数）→ enqueue('task:queue', task) → 立即返回 202 Accepted { taskId }
    ↓
Service Worker（后台消费）
    ↓
Repository / CacheManager（读写 MySQL/Redis）
    ↓
RealtimePusher.pushTaskResult → WebSocket 推送结果给前端
```

### 5.2 多租户隔离策略

```
请求 → JWT 解析 → 获取 tenant_id → 数据隔离查询
```

- 所有数据查询必须包含 `tenant_id` 条件
- 租户间数据完全隔离，无跨租户访问
- 租户配额控制（设备数量、用户数量）

### 5.3 认证与授权

- **认证方式**：JWT (JSON Web Token)
- **Token 结构**：
  - Access Token：15分钟有效期，用于 API 访问
  - Refresh Token：7天有效期，用于刷新 Access Token
- **WebSocket 鉴权**：通过 `?refreshToken=xxx` URL 参数验证

### 5.4 数据处理流程

```javascript
// DataPipeline.js 核心流程
async processData(deviceId, tenantId, areaId, deviceKey, deviceSecret, deviceType, rawData) {
    // 1. JSON 解析提取指标
    const parsedData = JsonParser.parse(rawData);
    const metrics = JsonParser.extractMetrics(parsedData) || parsedData;

    // 2. 设备合法性校验
    const device = await DeviceRep.findById(_deviceId);
    // ... 认证校验

    // 3. 写入缓存
    await MetricCache.setMetrics(_deviceId, metrics);
    await DeviceCache.setStatusWithTime(_deviceId, 'online');

    // 4. 写入时序数据库
    await DataIngestor.ingest(_deviceId, _tenantId, _areaId, _deviceType, metrics);

    // 5. 告警评估
    const alertRules = await AlertRuleRep.findByTenantIdAndDeviceId(tenantId, deviceId);
    const alertEvents = await RuleEvaluator.evaluate(tenantId, deviceId, metrics, alertRules);
    // ...

    // 6. 实时推送
    await RealtimePusher.pushDeviceData(_tenantId, _deviceId, metrics);
    await RealtimePusher.pushDeviceStatus(_tenantId, _deviceId, 'online');
}
```

### 5.5 API 路由说明

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/register` | 注册用户 |
| POST | `/api/auth/refresh` | 刷新 Token |
| GET | `/api/auth/userinfo` | 当前用户信息 |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/devices` | 设备列表 |
| POST | `/api/devices` | 创建设备（异步） |
| GET | `/api/devices/:id` | 设备详情 |
| GET | `/api/devices/:id/data` | 设备数据 |
| GET | `/api/devices/:id/history` | 设备历史数据 |
| PUT | `/api/devices/:id` | 更新设备（异步） |
| DELETE | `/api/devices/:id` | 删除设备（异步） |
| GET | `/api/dashboard/summary` | 仪表盘摘要 |
| GET | `/api/dashboard/trends` | 趋势数据 |
| GET | `/api/alerts/rules` | 告警规则列表 |
| POST | `/api/alerts/rules` | 创建告警规则 |
| GET | `/api/alerts/events` | 告警事件 |
| PUT | `/api/alerts/events/:id/ack` | 确认告警 |

> **注意**：写操作（POST/PUT/DELETE）通过异步任务队列处理，立即返回 `202 Accepted`，处理结果通过 WebSocket 推送。

### 5.6 关键实现细节

#### CacheManager 单例连接复用
```javascript
// 避免每次操作重复 connect()，提升性能
class CacheManager {
    static client = null;
    static async getClient() {
        if (!this.client) {
            this.client = await redis.createClient().connect();
        }
        return this.client;
    }
}
```

#### RuleEvaluator 持续时间检测
```javascript
// 支持 durationSeconds 持续检测，Redis 缓存触发时间戳
const triggeredAt = await CacheManager.get(`alert:triggered:${tenantId}:${deviceId}:${ruleId}`);
if (triggeredAt) {
    const duration = (Date.now() - parseInt(triggeredAt)) / 1000;
    if (duration >= rule.durationSeconds) {
        // 触发告警
    }
}
```

#### WebSocket 租户分组
```javascript
// RealtimePusher 按租户分组管理客户端
const tenantClients = new Map(); // tenantId -> Set<ws>
pushDeviceData(tenantId, deviceId, metrics) {
    const clients = tenantClients.get(tenantId);
    if (clients) {
        clients.forEach(ws => ws.send(JSON.stringify({ type: 'device_data', ... })));
    }
}
```

---

## 六、系统测试

### 6.1 测试策略

| 层级 | 工具 | 覆盖目标 |
|------|------|---------|
| 单元测试 | `node --test` | 核心服务层、数据处理层 |
| 集成测试 | 手动测试 | API 路由、数据库操作 |
| 协议适配器 | 单元测试 | JSON 解析、协议处理 |

### 6.2 运行测试

```bash
cd backend

# 运行所有测试
npm test

# 运行数据处理层测试
npm test -- data-processing/

# 运行协议适配器测试
npm test -- data-processing/protocol-adapters/
```

### 6.3 测试覆盖模块

- **JsonParser**：JSON 解析、单例模式
- **Protocol Adapters**：TCP/UDP/CoAP/WebSocket JSON 消息处理
- **DataPipeline**：设备数据处理流程
- **CacheManager**：Redis 缓存操作
- **RuleEvaluator**：告警规则评估

### 6.4 手动验收清单

- [ ] 登录 → Dashboard 自动加载设备统计
- [ ] 创建设备 → 后端 202 → WS 推回 `task_result success` → 列表自动出现
- [ ] 设备上报数据 → 实时显示在仪表盘
- [ ] 配置告警规则 → 触发阈值 → WebSocket 收到告警通知
- [ ] Webhook 配置 → 告警触发 → HTTP POST 收到通知
- [ ] 401 → 自动 refresh 一次 → 失败跳登录

---

## 七、项目小结

### 7.1 已完成功能

| 模块 | 功能 | 状态 |
|------|------|------|
| **认证系统** | JWT 双 Token、刷新机制、登出 | ✅ |
| **多租户** | 租户隔离、配额控制 | ✅ |
| **设备管理** | CRUD、状态监控、配置管理 | ✅ |
| **协议接入** | TCP/UDP/CoAP/MQTT 统一接入 | ✅ |
| **数据处理** | JSON 解析、缓存、持久化 | ✅ |
| **告警引擎** | 阈值告警、持续检测、Webhook | ✅ |
| **实时推送** | WebSocket 按租户推送 | ✅ |
| **异步任务** | Redis 队列 + Worker 消费 | ✅ |
| **仪表盘** | 摘要统计、趋势图表 | ✅ |
| **区域管理** | 树形结构、设备分配 | ✅ |

### 7.2 技术亮点

1. **统一数据解析**：所有协议适配器使用 `JsonParser` 统一处理，代码复用高
2. **异步任务队列**：写操作异步化，WebSocket 推送结果，用户体验流畅
3. **多级缓存**：Redis 单例连接 + 多级业务缓存，性能优异
4. **租户隔离**：所有查询强制带 `tenant_id`，安全可靠
5. **时序数据**：TDengine 超表 + JSON 动态指标，灵活扩展

### 7.3 后续优化方向

- [ ] 设备固件管理（OTA 升级）
- [ ] 数据导出功能（CSV/Excel）
- [ ] 更多协议支持（HTTP、Modbus）
- [ ] 移动端适配
- [ ] 性能优化（连接池、索引优化）

### 7.4 快速启动

```bash
cd backend

# 安装依赖
npm install

# 数据库初始化（首次运行）
node scripts/init-db.js

# 启动后端服务
npm start
# 访问 http://localhost:3000
```

---

*生成日期: 2026-06-19*
