# Implementation Plan: Phase 3 — 业务层实现

## Overview

实现 IoT 平台的业务服务层（services）、API 路由层（routes）、认证中间件（middleware）、异步任务队列 Worker（worker.js），采用 **Route → Redis Queue → Service Worker** 异步架构。

## Architecture Decisions

1. **异步队列模式**：所有写操作（POST/PUT/DELETE）由 Route 层 enqueue 到 Redis，立即返回 202；Service Worker 后台消费，执行 MySQL/Redis 读写
2. **Cache-Aside 穿透读**：读操作先查 Redis 缓存，未命中则查 MySQL 并回填缓存（TTL 5min）
3. **WebSocket 结果推送**：Worker 处理完成后通过 RealtimePusher 推送 task_result 到前端
4. **垂直分片**：按业务功能路径分片，每个 Task 交付完整功能路径

## Dependency Graph

```
middleware (auth / tenant / rateLimit)
    │
    ├── config/jwt.js (已存在)
    └── CacheManager (已存在)
           │
           ▼
services/worker.js (Consumer 主循环)
           │
           ▼
services/*.js (7个 Service，依赖 Repositories)
           │
           ▼
routes/*.js (6个 Route + index.js，依赖 Services)
           │
           ▼
app.js (挂载 + WebSocket 初始化)
```

## Task List

### Phase 1: Foundation（middleware + worker）

- [ ] Task 1.1: `middleware/tenant.js` — 从 JWT 解析 tenantId，注入 req.tenantId
- [ ] Task 1.2: `middleware/auth.js` — 验证 accessToken，无效/过期返回 401
- [ ] Task 1.3: `middleware/rateLimit.js` — 基于 Redis 实现 100 req/min/user 限流
- [ ] Task 1.4: `services/worker.js` — Consumer 主循环，从 task:queue 消费任务，分发给 handler

### Checkpoint: Foundation（Tasks 1.1–1.4）
- [ ] Worker 可独立运行，不断从 Redis 队列获取任务
- [ ] middleware 链正确拦截请求（无 token → 401，超限 → 429）

---

### Phase 2: Auth（登录/注册完整路径）

- [ ] Task 2.1: `services/AuthService.js` — 登录（bcrypt 验证 + JWT 签发）/ 注册（创建用户）/ 刷新 Token
- [ ] Task 2.2: `routes/auth.js` — `/api/auth/login`（同步返回）/ `/api/auth/register`（enqueue）/ `/api/auth/refresh`

### Checkpoint: Auth（Tasks 2.1–2.2）
- [ ] POST /api/auth/login 返回 accessToken + refreshToken
- [ ] POST /api/auth/register 返回 202 + taskId，Worker 处理后 MySQL 有记录

---

### Phase 3: Device（设备管理完整路径）

- [ ] Task 3.1: `services/DeviceService.js` — 设备 CRUD + Cache-Aside 读 + 自动生成 deviceKey/deviceSecret
- [ ] Task 3.2: `routes/devices.js` — GET /api/devices（同步）/ POST /api/devices（enqueue → 202）/ PUT /api/devices/:id（enqueue）/ DELETE /api/devices/:id（enqueue）

### Checkpoint: Device（Tasks 3.1–3.2）
- [ ] GET /api/devices 返回设备列表（租户隔离）
- [ ] POST /api/devices 返回 202，Worker 处理后设备写入 MySQL

---

### Phase 4: User + Area

- [ ] Task 4.1: `services/UserService.js` + `routes/users.js` — 用户 CRUD，enqueue 写操作
- [ ] Task 4.2: `services/AreaService.js` + `routes/areas.js` — 区域 CRUD（含树形结构查询）

### Checkpoint: User + Area（Tasks 4.1–4.2）
- [ ] 用户列表/创建功能正常
- [ ] 区域列表/创建功能正常（含树形结构）

---

### Phase 5: Alert + Dashboard

- [ ] Task 5.1: `services/AlertService.js` + `routes/alerts.js` — 告警规则 CRUD + 告警事件查询/确认
- [ ] Task 5.2: `services/DashboardService.js` + `routes/dashboard.js` — 仪表盘摘要 + 趋势数据 API

### Checkpoint: Alert + Dashboard（Tasks 5.1–5.2）
- [ ] 告警规则可配置、可查询
- [ ] Dashboard summary 和 trends API 返回正确数据

---

### Phase 6: Integration（app.js 集成）

- [ ] Task 6.1: `routes/index.js` — 汇总挂载所有 routes
- [ ] Task 6.2: `app.js` — 挂载 routes + WebSocket 服务器初始化 + startWorker()
- [ ] Task 6.3: 更新 SPEC.md 架构状态（Phase 3 标记 ✅ 完成）

### Checkpoint: Integration（Tasks 6.1–6.3）
- [ ] `npm start` 启动成功，无报错
- [ ] WebSocket 连接建立成功
- [ ] HTTP API 响应正常

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Worker 阻塞 Express 启动 | High | Worker 使用 `spawn()` 独立进程，或 `setImmediate()` 不阻塞事件循环 |
| Redis 队列为空时 CPU 空转 | Med | `dequeue()` 阻塞 100ms 再重试，避免短轮询 |
| 任务处理失败无重试机制 | Med | 实现最多 3 次重试，记录 failed 到 task:result |
| JWT secret 未配置 | High | 启动时检查 env，无则拒绝启动 |

## Open Questions

1. **Worker 进程模型**：独立进程（`child_process.fork()`）还是 Express 内置后台循环？
2. **限流粒度**：按 userId 还是按 IP？还是两者结合？
3. **设备创建时是否自动创建 TDengine 子表**？当前 DeviceService 只写 MySQL，TDengine 子表由 DataPipeline 在设备首次上报数据时创建
4. **前端如何感知 202 任务完成**？轮询 `/api/task/:taskId` 还是 WebSocket 自动推送？建议 WebSocket 自动推送

## Implementation Order

```
Task 1.1 → Task 1.2 → Task 1.3 → Task 1.4  (Foundation)
         ↓
Task 2.1 → Task 2.2                          (Auth)
         ↓
Task 3.1 → Task 3.2                          (Device)
         ↓
Task 4.1 → Task 4.2                          (User + Area)
         ↓
Task 5.1 → Task 5.2                          (Alert + Dashboard)
         ↓
Task 6.1 → Task 6.2 → Task 6.3               (Integration)
```