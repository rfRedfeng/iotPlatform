# Phase 5 — 前端实施计划（毕设简化版）

## 范围

3 个页面 + 最小可用的实时数据展示：

| 页面 | 路由 | 功能 |
|------|------|------|
| 登录 | `/#/login` | 用户名密码 → 存 token → 跳 Devices |
| 设备列表 | `/#/devices` | 列表 / 搜索 / 新建 / 删除 |
| 设备详情 | `/#/devices/:id` | 实时折线图（WS 推送） |
| 仪表盘 | `/#/dashboard` | 设备数/在线/告警数 3 个统计卡 + 最近 7 天趋势图 |

**不做**：Users / Areas / Alerts 的 CRUD、树形区域、用户管理、规则编辑、ESLint、单测。

## 技术栈

- Vanilla JS + ES Modules + Chart.js 4.4
- 状态：一个 `state.js` 模块导出可变对象 + EventTarget 派发变化（够用，不抽象 store）
- 路由：hash 路由（`location.hash` + `hashchange`），无需后端 SPA fallback
- WebSocket：单次连接，断线 5s 后重试一次
- 包：`frontend/package.json` 只留 `start`、`dev`（提示启动 backend）
- **不引入** ESLint、Jest、构建工具、新依赖

## 文件结构

新增（其余保持 §4.1 不变）：

```
frontend/scripts/
├── app.js                 # 改：启动 + hash 路由
├── state.js               # 新：可变 state + EventTarget
├── ws.js                  # 新：单文件 WS 客户端
├── api.js                 # 新：fetch + JWT（单文件，不拆 7 个）
├── router.js              # 新：hash 路由表
├── pages/
│   ├── login.js           # 新
│   ├── devices.js         # 新（列表 + 详情合一）
│   └── dashboard.js       # 新
├── components/
│   ├── header.js          # 新
│   └── modal.js           # 新
└── utils.js               # 新：storage / date / dom h() / chart
```

`api/services/components/api/` 目录可暂不创建（先一个 `api.js` 单文件够用）。

## 实施步骤

1. **utils.js + state.js** — 基础原子
2. **api.js** — fetch 封装 + 401 refresh 一次
3. **ws.js** — WebSocket + 单次重连
4. **router.js + 改 app.js** — hash 路由 + 启动顺序
5. **components/header.js + modal.js** — 公共 UI
6. **pages/login.js** — 登录
7. **pages/devices.js** — 列表 + 详情（含 Chart.js 时序图 + WS 实时点）
8. **pages/dashboard.js** — 统计卡 + 趋势图
9. **手测一遍**：登录 → 创建设备 → 看 Dashboard 反映

## 风险（毕设级可接受）

- **WS 重连策略简陋**：断线后只重试 1 次。演示期间网络稳定即可。接受。
- **没有单测**：手测通过即视为完成。毕设不强制覆盖。
- **状态可变**：多人协作会有坑，但这是单人毕设。
- **依赖后端响应字段**：开始前 curl `/api/auth/login` 确认字段名再写 api.js。

## 验收

- 浏览器打开 `http://localhost:3000/#/login`，无 console error
- 输入后端已有账号登录 → 跳 `#/devices`，列表非空（或能创建一条）
- 创建设备 → 5s 内列表刷新（WS 推回 task_result）
- 打开设备详情 → 折线图渲染；后端模拟器发数据 → 5s 内图上多一个点
- Dashboard 三张卡数字与列表一致
- 强制登出 → 跳回登录

## 估时

**2–3 天**（含联调卡顿）。