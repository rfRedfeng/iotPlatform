# IoT Cloud Platform 架构设计规范

## 1. 目标与范围

### 1.1 项目目标
构建一个**多租户**物联网设备云平台，支持全协议（MQTT/TCP/UDP/CoAP）设备接入，提供设备管理、用户管理、区域管理、数据可视化仪表盘、告警管理等核心功能。

### 1.2 目标用户
- **设备管理员**：负责设备的接入配置、固件管理
- **普通用户**：查看设备数据、配置告警规则
- **系统管理员**：管理租户、用户权限、系统配置

### 1.3 核心边界
| 范围 | 说明 |
|------|------|
| 协议接入 | MQTT Broker、TCP Server、UDP Server、CoAP Server |
| 数据处理 | 数据解析 → 缓存 → 持久化 → 告警分析 |
| 前端功能 | 设备管理、用户管理、区域管理、仪表盘、告警查看 |
| 后端架构 | 分层架构：数据层 → 网关处理层 → 业务路由层 |

---

## 2. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                           前端 (Vanilla JS)                          │
│        设备管理 / 用户管理 / 区域管理 / 仪表盘 / 告警管理              │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ REST API / WebSocket
┌─────────────────────────────────┴───────────────────────────────────┐
│                         API Gateway Layer                           │
│                    (路由、鉴权、限流、协议适配)                       │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                      Business Service Layer                         │
│        用户服务 / 设备服务 / 区域服务 / 告警服务 / 仪表盘服务          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                       Data Processing Layer                          │
│     协议适配器 │ 数据解析 │ 缓存管理 │ 告警引擎 │ 时序数据处理         │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                         Data Access Layer                           │
│              MySQL (关系数据) │ Redis (缓存) │ TDengine (时序)        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                        Protocol Adapters                             │
│           MQTT Broker │ TCP Server │ UDP Server │ CoAP Server      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┴───────────────────────────────────┐
│                           IoT Devices                                │
│              传感器 / 执行器 / 网关 / 智能硬件                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 后端分层详细设计

### 3.1 数据访问层 (Data Access Layer)

**职责**：封装所有数据库操作，提供统一的数据访问接口

```
data-access/
├── mysql/                 # MySQL 关系型数据访问
│   ├── models/           # 数据模型定义
│   │   ├── User.js       # 用户模型
│   │   ├── Device.js     # 设备模型
│   │   ├── Area.js       # 区域模型
│   │   ├── Tenant.js     # 租户模型
│   │   └── AlertRule.js  # 告警规则模型
│   ├── repositories/     # 仓储模式实现
│   │   ├── UserRepository.js
│   │   ├── DeviceRepository.js
│   │   └── AreaRepository.js
│   └── migrations/       # 数据库迁移脚本
├── redis/                 # Redis 缓存访问
│   ├── CacheManager.js   # 缓存管理器
│   └── SessionStore.js   # 会话存储
├── tdengine/             # TDengine 时序数据访问
│   ├── TimeSeriesRepo.js # 时序数据仓储
│   └── AggregationRepo.js# 聚合查询仓储
└── DataSourceManager.js  # 数据源统一管理
```

**关键表结构**：

| 表名 | 说明 | 核心字段 |
|------|------|----------|
| tenants | 租户表 | id, name, status, created_at |
| users | 用户表 | id, tenant_id, username, password_hash, role, created_at |
| areas | 区域表 | id, tenant_id, name, code, description, parent_id |
| devices | 设备表 | id, tenant_id, area_id, name, device_key, protocol, status, last_seen |
| device_configs | 设备配置表 | id, device_id, config_key, config_value |
| alert_rules | 告警规则表 | id, tenant_id, device_id, metric, threshold, condition, enabled |
| alert_events | 告警事件表 | id, rule_id, device_id, value, triggered_at, acknowledged |
| data_points | 数据点表（MySQL备份） | id, device_id, metric, value, timestamp |

### 3.2 数据处理层 (Data Processing Layer)

**职责**：协议适配、数据解析、缓存管理、告警分析、时序数据处理

```
data-processing/
├── protocol-adapters/     # 协议适配器
│   ├── MqttAdapter.js     # MQTT 协议适配器
│   ├── TcpAdapter.js      # TCP 自定义协议适配器
│   ├── UdpAdapter.js      # UDP 数据报适配器
│   └── CoapAdapter.js     # CoAP 协议适配器
├── parsers/              # 数据解析器
│   ├── JsonParser.js     # JSON 数据解析
│   ├── BinaryParser.js   # 二进制协议解析
│   └── XmlParser.js      # XML 数据解析
├── cache/                # 缓存管理
│   ├── DeviceCache.js    # 设备状态缓存
│   ├── MetricCache.js    # 指标数据缓存
│   └── AlertCache.js     # 告警缓存
├── alert-engine/         # 告警引擎
│   ├── RuleEvaluator.js  # 规则评估器
│   ├── Notifier.js       # 通知器（仅界面展示）
│   └── AlertLogger.js    # 告警日志
├── time-series/          # 时序数据处理
│   ├── DataIngestor.js   # 数据摄入管道
│   ├── DownSampler.js    # 数据降采样
│   └── Aggregator.js     # 聚合计算
└── DataPipeline.js       # 数据处理流水线
```

**数据流向**：
```
设备数据 → 协议适配器 → 数据解析器 → 缓存层 → 告警评估 → 时序存储
                ↓
           数据验证 (格式、范围、完整性)
```

### 3.3 业务服务层 (Business Service Layer)

**职责**：用户管理、设备管理、区域管理、告警管理、仪表盘数据

```
services/
├── UserService.js        # 用户服务：CRUD、权限验证
├── DeviceService.js      # 设备服务：注册、配置、状态管理
├── AreaService.js        # 区域服务：树形结构管理
├── AlertService.js       # 告警服务：规则管理、事件查询
├── DashboardService.js   # 仪表盘服务：聚合数据、趋势计算
├── AuthService.js        # 认证服务：JWT签发、刷新
└── TenantService.js      # 租户服务：隔离、配额
```

### 3.4 API路由层 (API Gateway Layer)

**职责**：请求路由、身份认证、限流、参数校验、响应格式化

```
routes/
├── index.js             # 路由汇总
├── auth.js              # 认证路由：/api/auth/login, /api/auth/refresh
├── users.js             # 用户路由：/api/users
├── devices.js           # 设备路由：/api/devices, /api/devices/:id/data
├── areas.js             # 区域路由：/api/areas
├── alerts.js            # 告警路由：/api/alerts/rules, /api/alerts/events
└── dashboard.js         # 仪表盘路由：/api/dashboard/*
```

**API 规范**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录，返回JWT |
| POST | /api/auth/refresh | 刷新令牌 |
| GET | /api/users | 获取用户列表 |
| POST | /api/users | 创建用户 |
| GET | /api/devices | 获取设备列表 |
| POST | /api/devices | 创建设备 |
| PUT | /api/devices/:id | 更新设备 |
| DELETE | /api/devices/:id | 删除设备 |
| GET | /api/devices/:id/data | 获取设备历史数据 |
| GET | /api/areas | 获取区域列表 |
| POST | /api/areas | 创建区域 |
| GET | /api/alerts/rules | 获取告警规则 |
| POST | /api/alerts/rules | 创建告警规则 |
| GET | /api/alerts/events | 获取告警事件 |
| PUT | /api/alerts/events/:id/ack | 确认告警 |
| GET | /api/dashboard/summary | 获取仪表盘摘要 |
| GET | /api/dashboard/trends | 获取趋势数据 |

---

## 4. 前端架构设计

### 4.1 项目结构

```
frontend/
├── index.html           # 主入口 (由后端 Express 托管)
├── styles/
│   ├── main.css         # 主样式
│   ├── components.css   # 组件样式
│   └── pages.css        # 页面样式
├── scripts/
│   ├── app.js           # 应用入口，路由初始化
│   ├── config.js        # 前端配置
│   ├── api/             # API 调用层
│   │   ├── client.js    # Fetch 封装，自动附加 JWT
│   │   ├── auth.js      # 认证API (/api/auth/login)
│   │   ├── devices.js   # 设备API (/api/devices/*)
│   │   ├── users.js     # 用户API (/api/users/*)
│   │   ├── areas.js     # 区域API (/api/areas/*)
│   │   ├── alerts.js    # 告警API (/api/alerts/*)
│   │   └── dashboard.js # 仪表盘API (/api/dashboard/*)
│   ├── services/        # 业务逻辑层
│   │   ├── AuthService.js    # 登录/登出/Token刷新
│   │   ├── DeviceService.js  # 设备CRUD封装
│   │   └── AlertService.js   # 告警服务封装
│   ├── components/      # UI 组件
│   │   ├── Header.js
│   │   ├── Sidebar.js
│   │   ├── DeviceCard.js
│   │   ├── DataChart.js
│   │   ├── AlertItem.js
│   │   └── Modal.js
│   ├── pages/          # 页面模块
│   │   ├── Login.js
│   │   ├── Dashboard.js
│   │   ├── DeviceList.js
│   │   ├── DeviceDetail.js
│   │   ├── UserManagement.js
│   │   ├── AreaManagement.js
│   │   └── AlertManagement.js
│   └── utils/          # 工具函数
│       ├── storage.js   # localStorage 封装
│       ├── date.js      # 日期格式化
│       └── chart.js    # 图表封装
└── assets/
    └── images/
```

### 4.2 前端 API 客户端配置

```javascript
// frontend/scripts/config.js
const CONFIG = {
    API_BASE_URL: '/api',           // 相对路径，后端托管时使用同源
    TOKEN_KEY: 'iot_access_token',
    REFRESH_TOKEN_KEY: 'iot_refresh_token'
};
```

```javascript
// frontend/scripts/api/client.js
import { CONFIG } from '../config.js';

class ApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // 自动附加 JWT
        const token = localStorage.getItem(CONFIG.TOKEN_KEY);
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            // Token 过期，尝试刷新
            const refreshed = await this.refreshToken();
            if (refreshed) {
                // 重试原请求
                headers['Authorization'] = `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`;
                return fetch(url, { ...options, headers });
            }
        }

        return response;
    }

    async refreshToken() {
        const refreshToken = localStorage.getItem(CONFIG.REFRESH_TOKEN_KEY);
        if (!refreshToken) return false;

        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem(CONFIG.TOKEN_KEY, data.accessToken);
            return true;
        }
        return false;
    }

    get(endpoint) { return this.request(endpoint); }
    post(endpoint, data) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) }); }
    put(endpoint, data) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) }); }
    delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }
}

export const apiClient = new ApiClient(CONFIG.API_BASE_URL);
```

### 4.2 页面清单

| 页面 | 路由 | 功能描述 |
|------|------|----------|
| 登录页 | /login | 用户名密码登录，JWT存储 |
| 仪表盘 | /dashboard | 数据概览、实时数据、告警列表、趋势图表 |
| 设备列表 | /devices | 设备CRUD、状态筛选、搜索 |
| 设备详情 | /devices/:id | 单设备数据历史、配置管理 |
| 用户管理 | /users | 用户CRUD、角色分配（管理员） |
| 区域管理 | /areas | 树形区域管理、设备分配 |
| 告警管理 | /alerts | 告警规则配置、事件查看、确认 |

---

## 5. 关键模块设计

### 5.1 设备接入流程

```
设备连接 → 协议握手 → 设备认证(device_key) → 会话建立
                                      ↓
设备上报数据 → 协议适配器解析 → 数据验证 → 缓存(Redis) → 告警评估 → 时序存储(TDengine)
                                      ↓
                              实时推送(WebSocket) → 前端仪表盘
```

### 5.2 认证与授权

- **认证方式**：JWT (JSON Web Token)
- **Token 结构**：
  - Access Token：15分钟有效期，用于API访问
  - Refresh Token：7天有效期，用于刷新Access Token
- **权限角色**：
  - `admin`：系统管理员，拥有所有权限
  - `manager`：租户管理员，管理本租户内用户和设备
  - `user`：普通用户，仅可查看和操作自己有权限的设备

### 5.3 多租户隔离策略

```
请求 → JWT解析 → 获取tenant_id → 查询租户配额 → 数据隔离查询
```

- 所有数据查询必须包含 `tenant_id` 条件
- 租户间数据完全隔离，无跨租户访问
- 租户配额控制（设备数量、用户数量、API调用限制）

### 5.4 告警处理流程

```
数据点 → 规则匹配 → 阈值检查 → 触发告警 → 事件记录 → WebSocket推送 → 前端展示
                                      ↓
                              告警确认 → 事件更新
```

### 5.5 实时数据推送

- 使用 **Server-Sent Events (SSE)** 或 **WebSocket** 推送实时数据到前端
- 设备状态变更、告警触发、数据更新实时可见
- 前端自动重连机制

---

## 6. 技术约束

### 6.1 后端技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 运行时 | Node.js 18+ | LTS版本 |
| 框架 | Express.js | 轻量级Web框架 |
| 数据库 | MySQL 8.0 | 关系数据存储 |
| 缓存 | Redis 7+ | 会话、热点数据缓存 |
| 时序数据库 | TDengine 3.2 | 时序数据存储与聚合，连接端口 6041（WebSocket） |
| MQTT Broker | EMQX 或 Mosquitto | 设备接入 |
| 协议库 | mqtt.js, dgram, coap | 协议实现 |

### 6.2 前端技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 核心 | 原生 JavaScript (ES6+) | 无框架依赖 |
| 图表 | Chart.js | 仪表盘图表 |
| 布局 | CSS Grid + Flexbox | 响应式布局 |
| 状态管理 | 简单发布订阅模式 | 避免过度设计 |
| HTTP客户端 | Fetch API | 原生支持 |

### 6.3 项目目录结构

```
node_iot/
├── backend/                          # 后端项目 (独立仓库/目录)
│   ├── src/
│   │   ├── data-access/              # 数据访问层
│   │   │   ├── mysql/
│   │   │   │   ├── models/           # User, Device, Area, Tenant, AlertRule
│   │   │   │   └── repositories/    # UserRepository, DeviceRepository, ...
│   │   │   ├── redis/
│   │   │   │   ├── CacheManager.js
│   │   │   │   └── SessionStore.js
│   │   │   ├── tdengine/
│   │   │   │   └── TimeSeriesRepo.js
│   │   │   └── DataSourceManager.js
│   │   ├── data-processing/          # 数据处理层
│   │   │   ├── protocol-adapters/    # MqttAdapter, TcpAdapter, UdpAdapter, CoapAdapter
│   │   │   ├── parsers/              # JsonParser, BinaryParser
│   │   │   ├── cache/                # DeviceCache, MetricCache
│   │   │   ├── alert-engine/         # RuleEvaluator, Notifier
│   │   │   ├── time-series/          # DataIngestor, Aggregator
│   │   │   └── DataPipeline.js
│   │   ├── services/                 # 业务服务层
│   │   │   ├── UserService.js
│   │   │   ├── DeviceService.js
│   │   │   ├── AreaService.js
│   │   │   ├── AlertService.js
│   │   │   ├── DashboardService.js
│   │   │   ├── AuthService.js
│   │   │   └── TenantService.js
│   │   ├── routes/                   # 路由层
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── devices.js
│   │   │   ├── areas.js
│   │   │   ├── alerts.js
│   │   │   └── dashboard.js
│   │   ├── middleware/                # 中间件
│   │   │   ├── auth.js               # JWT验证
│   │   │   ├── tenant.js             # 租户隔离
│   │   │   ├── rateLimit.js          # 限流
│   │   │   └── errorHandler.js       # 错误处理
│   │   ├── models/                   # 数据模型
│   │   ├── config/                   # 配置文件
│   │   │   ├── database.js          # MySQL/Redis/TDengine配置
│   │   │   └── jwt.js               # JWT密钥配置
│   │   └── app.js                   # 应用入口
│   ├── package.json
│   └── .env                          # 环境变量 (PORT=3000, DB_HOST, REDIS_HOST, etc)
│
├── frontend/                         # 前端项目 (独立仓库/目录)
│   ├── index.html                   # 主入口 (由后端 Express 托管)
│   ├── styles/
│   │   ├── main.css
│   │   ├── components.css
│   │   └── pages.css
│   ├── scripts/
│   │   ├── app.js                   # 应用入口
│   │   ├── api/                     # API 调用层
│   │   │   ├── client.js            # Fetch 封装，含 JWT 自动附加
│   │   │   ├── auth.js
│   │   │   ├── devices.js
│   │   │   ├── users.js
│   │   │   ├── areas.js
│   │   │   ├── alerts.js
│   │   │   └── dashboard.js
│   │   ├── services/                # 业务逻辑层
│   │   │   ├── AuthService.js       # 登录/登出/Token刷新
│   │   │   ├── DeviceService.js
│   │   │   └── AlertService.js
│   │   ├── components/              # UI 组件
│   │   │   ├── Header.js
│   │   │   ├── Sidebar.js
│   │   │   ├── DeviceCard.js
│   │   │   ├── DataChart.js         # 基于Chart.js
│   │   │   ├── AlertItem.js
│   │   │   └── Modal.js
│   │   ├── pages/                   # 页面模块
│   │   │   ├── Login.js
│   │   │   ├── Dashboard.js
│   │   │   ├── DeviceList.js
│   │   │   ├── DeviceDetail.js
│   │   │   ├── UserManagement.js
│   │   │   ├── AreaManagement.js
│   │   │   └── AlertManagement.js
│   │   └── utils/                   # 工具函数
│   │       ├── storage.js           # localStorage 封装
│   │       ├── date.js
│   │       └── chart.js
│   ├── assets/
│   │   └── images/
│   └── package.json
│
├── docs/                            # 文档
│   └── SPEC.md
├── docker-compose.yml               # 容器编排
└── README.md
```

### 6.4 服务启动命令

```bash
# 后端服务 (同时托管前端静态文件)
cd backend
npm install
npm start  # 启动服务器 (端口 3000)
# 访问 http://localhost:3000 即可看到前端页面
```

---

## 7. 数据库表结构详情

### 7.1 MySQL 表设计

```sql
-- 租户表
CREATE TABLE tenants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    status ENUM('active', 'suspended') DEFAULT 'active',
    max_devices INT DEFAULT 100,
    max_users INT DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户表
-- 注意：系统管理员(role='admin')属于 tenant_id=0 的系统租户
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

-- 区域表（树形结构，支持多级楼层/区域）
CREATE TABLE areas (
    id INT PRIMARY KEY AUTO_INCREMENT, -- id
    tenant_id INT NOT NULL,            -- 区域编号
    parent_id INT DEFAULT NULL,        -- 上层编号
    name VARCHAR(100) NOT NULL,        -- 区域名称
    code VARCHAR(50) NOT NULL UNIQUE,  -- 区域唯一编码，如 F0-B1-L1-R101
    description TEXT,       
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (parent_id) REFERENCES areas(id)
);

-- 设备表
CREATE TABLE devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    area_id INT,
    name VARCHAR(100) NOT NULL,
    device_key VARCHAR(64) NOT NULL UNIQUE,
    device_secret VARCHAR(128) NOT NULL,
    protocol ENUM('mqtt', 'tcp', 'udp', 'coap') NOT NULL,
    status ENUM('online', 'offline', 'inactive') DEFAULT 'offline',
    last_seen TIMESTAMP NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (area_id) REFERENCES areas(id)
);

-- 设备配置表
CREATE TABLE device_configs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL,
    config_key VARCHAR(50) NOT NULL,
    config_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- 告警规则表
CREATE TABLE alert_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    device_id INT,
    name VARCHAR(100) NOT NULL,
    metric VARCHAR(50) NOT NULL,
    condition ENUM('gt', 'lt', 'eq', 'gte', 'lte') NOT NULL,
    threshold DECIMAL(20, 6) NOT NULL,
    duration_seconds INT DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- 告警事件表
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

-- Refresh Token 表
CREATE TABLE refresh_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 7.2 TDengine 超表设计

**SDK**: `@tdengine/websocket`（WebSocket 方式连接，端口 6041）

**连接字符串**:
```
ws://root:taosdata@localhost:6041
```

**建库语句**:
```sql
CREATE DATABASE iot_db KEEP 30 BUFFER 256;
```

**超表结构**（已创建）:

```sql
-- 设备数据超级表（温度/湿度/电压）
CREATE STABLE device_data (
    ts TIMESTAMP,           -- 时间戳（自动建索引）
    temperature FLOAT,      -- 温度
    humidity FLOAT,         -- 湿度
    voltage FLOAT           -- 电压
) TAGS (
    device_id INT,         -- 设备ID（子表标签）
    area_id INT            -- 区域ID（子表标签）
);

-- 设备状态超级表（在线/离线）
CREATE STABLE device_status (
    ts TIMESTAMP,          -- 时间戳
    status VARCHAR(20)     -- online / offline / inactive
) TAGS (
    device_id INT,         -- 设备ID（子表标签）
    area_id INT            -- 区域ID（子表标签）
);
```

**子表创建示例**（设备接入时自动创建）:
```sql
-- 根据 device_id 创建设备子表
CREATE TABLE IF NOT EXISTS d1001 USING device_data TAGS (1001, 5);

-- 插入数据
INSERT INTO d1001 VALUES (NOW, 25.6, 60.2, 220.5);
```

**Node.js 接入示例**:
```javascript
const { sqlConnect, setLogLevel, destroy } = require('@tdengine/websocket');
const { WSConfig } = require('@tdengine/websocket/src/common/config');

const conf = new WSConfig('ws://root:taosdata@localhost:6041');
const wsSql = await sqlConnect(conf);

// 插入
await wsSql.exec('INSERT INTO d1001 USING device_data TAGS (1, 5) VALUES (NOW, 25.6, 60.2, 220.5)');

// 查询（游标遍历）
const rows = await wsSql.query('SELECT * FROM device_data WHERE ts > NOW - 1h');
while (await rows.next()) {
    console.log(rows.getData());
}
await rows.close();
await wsSql.close();
destroy();
```

---

## 8. API 详细规范

### 8.1 认证 API

**POST /api/auth/login**
```json
// Request
{
    "username": "admin",
    "password": "password123"
}

// Response 200
{
    "success": true,
    "data": {
        "accessToken": "eyJhbGciOiJIUzI1NiIs...",
        "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
        "expiresIn": 900,
        "user": {
            "id": 1,
            "username": "admin",
            "role": "admin",
            "tenantId": 1
        }
    }
}
```

### 8.2 设备 API

**POST /api/devices**
```json
// Request
{
    "name": "温度传感器-001",
    "areaId": 1,
    "protocol": "mqtt"
}

// Response 201
{
    "success": true,
    "data": {
        "id": 1,
        "name": "温度传感器-001",
        "deviceKey": "dev_a1b2c3d4e5f6",
        "deviceSecret": "secret_xxxxxxxxxxxx",
        "protocol": "mqtt",
        "status": "inactive",
        "createdAt": "2026-06-09T10:00:00Z"
    }
}
```

### 8.3 仪表盘 API

**GET /api/dashboard/summary**
```json
// Response 200
{
    "success": true,
    "data": {
        "totalDevices": 150,
        "onlineDevices": 120,
        "offlineDevices": 30,
        "todayAlerts": 5,
        "unacknowledgedAlerts": 2,
        "tenantName": "Demo Tenant",
        "lastUpdated": "2026-06-09T10:30:00Z"
    }
}
```

---

## 9. 安全约束

| 约束项 | 说明 |
|--------|------|
| 密码存储 | 使用 bcrypt 哈希，cost factor 12 |
| JWT签名 | HS256 算法，密钥环境变量存储 |
| 设备认证 | device_key + device_secret 双向认证 |
| SQL注入 | 使用参数化查询，禁止字符串拼接 |
| XSS | 前端输出转义，后端接口禁止返回HTML |
| CORS | 仅允许已登记的前端域名 |
| 限流 | API层限流：100请求/分钟/用户 |
| 日志 | 敏感操作审计日志，不记录密码和密钥 |

---

## 10. 部署架构

### 10.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     后端服务器 (Node.js)                         │
│                         端口: 3000                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Express 静态文件托管  │  REST API (/api/*)              │  │
│  │  /index.html          │  /api/auth/*                     │  │
│  │  /scripts/            │  /api/devices/*                  │  │
│  │  /styles/             │  /api/dashboard/*                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────┴────┐        ┌────┴────┐        ┌────┴────┐
    │  MySQL  │        │  Redis  │        │ TDengine │
    │   3306  │        │   6379  │        │   6043   │
    └─────────┘        └─────────┘        └─────────┘
                             │
                      ┌──────┴──────┐
                      │    EMQX     │
                      │ (MQTT:1883) │
                      └─────────────┘
```

### 10.2 后端服务器结构

```javascript
// backend/src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());

// 静态文件托管 (前端)
app.use(express.static(path.join(__dirname, '../../frontend')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/users', require('./routes/users'));
app.use('/api/areas', require('./routes/areas'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/dashboard', require('./routes/dashboard'));

// 健康检查
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
```

---

## 11. 开发约束

### 11.1 代码风格
- 使用 ES6+ 语法，箭头函数，async/await
- 缩进：4空格
- 命名：camelCase（变量函数），PascalCase（类），SCREAMING_SNAKE_CASE（常量）
- 每个文件不超过 300 行
- 禁用 `var`，使用 `const`/`let`

### 11.2 Git 提交规范
```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具
```

### 11.3 测试要求
- 核心服务层必须有单元测试
- API 路由必须有集成测试
- 覆盖率目标：核心逻辑 80%+

---

## 12. 缺失内容补充清单

以下是你在原需求中未提及但已补充的重要内容：

| 序号 | 补充项 | 说明 |
|------|--------|------|
| 1 | **多租户支持** | 租户隔离、 quotas 控制 |
| 2 | **JWT 认证** | Access/Refresh Token 机制 |
| 3 | **设备双向认证** | device_key + device_secret |
| 4 | **实时推送** | WebSocket/SSE 实时数据 |
| 5 | **时序数据库** | TDengine 存储时序数据 |
| 6 | **告警引擎** | 规则配置、阈值触发 |
| 7 | **协议适配器** | MQTT/TCP/UDP/CoAP 统一处理 |
| 8 | **数据验证** | 输入校验、格式转换 |
| 9 | **限流与安全** | API 限流、CORS、XSS防护 |
| 10 | **刷新令牌** | Token 续期机制 |
| 11 | **设备配置管理** | 设备参数动态配置 |
| 12 | **区域树形结构** | 支持多级区域嵌套 |

---

## 13. 实施里程碑

| 阶段 | 内容 | 产出 |
|------|------|------|
| Phase 1 | 项目初始化、数据库设计、基础架构 | 目录结构、数据库表、配置 |
| Phase 2 | 数据访问层、Redis缓存、TDengine接入 | DAO层、缓存层 |
| Phase 3 | 业务服务层、API路由、认证中间件 | 服务层、REST API |
| Phase 4 | 协议适配器、告警引擎、数据处理管道 | 设备接入、数据处理 |
| Phase 5 | 前端开发、仪表盘、实时推送 | 完整UI、数据可视化 |
| Phase 6 | 测试、安全审计、部署文档 | 测试报告、部署手册 |

---

*本文档版本: v1.0*
*最后更新: 2026-06-09*