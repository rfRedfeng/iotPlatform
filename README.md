# IoT Cloud Platform 项目说明文档

> 项目说明文档索引。本项目是一个多租户物联网设备云平台，支持全协议（MQTT/TCP/UDP/CoAP）设备接入，提供设备管理、用户管理、区域管理、数据可视化仪表盘、告警管理等核心功能。

---

## 文档索引

| 文档 | 说明 |
|------|------|
| **SPEC.md** | 架构设计规范（高层设计，~61KB） |
| **ARCHITECTURE_BACKEND.md** | 后端架构说明（基于代码实现，~22KB） |
| **ARCHITECTURE_FRONTEND.md** | 前端架构说明（基于代码实现，~20KB） |
| **API.md** | API 接口文档（~6KB） |

---

## 项目技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端 | Vanilla JS (ES2022) + ES Modules，Chart.js，本地 CSS |
| 后端 | Node.js + Express，ES Modules |
| 关系数据库 | MySQL 8.0 |
| 缓存 | Redis 7+ |
| 时序数据库 | TDengine 3.2 |
| 协议接入 | MQTT (mqtt.js) / TCP / UDP / CoAP |
| 实时通信 | WebSocket (ws 库) |
| 认证 | JWT (jsonwebtoken) + bcrypt |

---

## 目录结构

```
node_iot/
├── backend/                # 后端服务（Node.js + Express）
│   └── src/
│       ├── app.js          # 应用入口
│       ├── config/         # 数据库/JWT 配置
│       ├── data-access/    # 数据访问层
│       │   ├── mysql/      # MySQL 模型 + Repository
│       │   ├── redis/      # Redis 缓存管理
│       │   └── tdengine/   # TDengine 时序数据
│       ├── data-processing/# 数据处理层
│       │   ├── DataPipeline.js       # 数据处理流水线
│       │   ├── RealtimePusher.js     # WebSocket 实时推送
│       │   ├── protocol-adapters/    # 协议适配器
│       │   ├── cache/               # 业务缓存层
│       │   ├── alert-engine/         # 告警引擎
│       │   └── time-series/          # 时序数据
│       ├── middleware/     # 中间件
│       ├── routes/        # 路由
│       └── services/       # 业务服务
├── frontend/               # 前端 (Vanilla JS SPA)
│   ├── index.html         # 入口
│   └── scripts/
│       ├── app.js         # 应用启动
│       ├── router.js      # Hash 路由
│       ├── state.js       # 状态管理
│       ├── api.js         # API 封装
│       ├── ws.js          # WebSocket 客户端
│       ├── pages/         # 页面模块
│       └── components/    # UI 组件
└── docs/                  # 文档
    ├── SPEC.md            # 架构设计规范
    ├── ARCHITECTURE_BACKEND.md  # 后端架构
    ├── ARCHITECTURE_FRONTEND.md # 前端架构
    └── API.md             # API 接口
```

---

## 核心特性

| 特性 | 说明 |
|------|------|
| 多租户 | 租户数据完全隔离，JWT 携带 tenantId |
| 全协议接入 | MQTT / TCP / UDP / CoAP |
| 异步任务队列 | Redis List 队列 + Service Worker 后台消费 |
| 实时推送 | WebSocket 按租户推送 device_data / alert / task_result |
| 缓存策略 | Redis 单例连接 + Cache-Aside 读模式 + 多级业务缓存 |
| 时序数据 | TDengine 超表 + 子表，JSON 动态指标 |
| 告警引擎 | 支持 durationSeconds 持续时间检测，6 种比较条件 |
| JWT 双 Token | Access Token (15min) + Refresh Token (7d) |

---

*生成日期: 2026-06-14*