# Phase 3 Task List — 业务层实现

## Status Legend
- [ ] Not started
- [x] Completed
- [ ] In progress

---

## Phase 1: Foundation（middleware + worker）

- [ ] **Task 1.1**: `middleware/tenant.js` — 从 JWT 解析 tenantId，注入 req.tenantId
- [ ] **Task 1.2**: `middleware/auth.js` — 验证 accessToken，无效/过期返回 401
- [ ] **Task 1.3**: `middleware/rateLimit.js` — 基于 Redis 实现 100 req/min/user 限流
- [ ] **Task 1.4**: `services/worker.js` — Consumer 主循环，从 task:queue 消费任务

---

## Phase 2: Auth

- [ ] **Task 2.1**: `services/AuthService.js` — 登录（bcrypt）/ 注册 / 刷新 Token
- [ ] **Task 2.2**: `routes/auth.js` — `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`

---

## Phase 3: Device

- [ ] **Task 3.1**: `services/DeviceService.js` — 设备 CRUD + Cache-Aside
- [ ] **Task 3.2**: `routes/devices.js` — GET（同步）/ POST PUT DELETE（enqueue → 202）

---

## Phase 4: User + Area

- [ ] **Task 4.1**: `services/UserService.js` + `routes/users.js` — 用户 CRUD
- [ ] **Task 4.2**: `services/AreaService.js` + `routes/areas.js` — 区域 CRUD + 树形查询

---

## Phase 5: Alert + Dashboard

- [ ] **Task 5.1**: `services/AlertService.js` + `routes/alerts.js` — 告警规则 + 事件管理
- [ ] **Task 5.2**: `services/DashboardService.js` + `routes/dashboard.js` — 摘要 + 趋势 API

---

## Phase 6: Integration

- [ ] **Task 6.1**: `routes/index.js` — 路由汇总挂载
- [ ] **Task 6.2**: `app.js` — 挂载 routes + WebSocket + startWorker()
- [ ] **Task 6.3**: 更新 SPEC.md Phase 3 状态为 ✅ 完成

---

## Checkpoints

| Checkpoint | 验收条件 |
|------------|----------|
| Foundation（1.1–1.4） | Worker 运行无报错，middleware 正确拦截 |
| Auth（2.1–2.2） | 登录返回 JWT，注册写入 MySQL |
| Device（3.1–3.2） | 设备列表和创建功能正常 |
| User+Area（4.1–4.2） | 用户和区域 CRUD 正常 |
| Alert+Dashboard（5.1–5.2） | 告警和仪表盘 API 正常 |
| Integration（6.1–6.3） | npm start 启动成功，端到端可用 |