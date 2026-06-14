# IoT Cloud Platform — 前端架构说明

> 基于代码实现从前端项目结构、路由、状态管理、API封装、WebSocket客户端、页面模块等维度说明。

---

## 目录

1. [技术栈与项目结构](#1-技术栈与项目结构)
2. [整体架构](#2-整体架构)
3. [应用启动流程](#3-应用启动流程)
4. [路由系统](#4-路由系统)
5. [状态管理](#5-状态管理)
6. [API 封装](#6-api-封装)
7. [WebSocket 客户端](#7-websocket-客户端)
8. [页面模块](#8-页面模块)
9. [核心工具](#9-核心工具)
10. [CSS 样式架构](#10-css-样式架构)

---

## 1. 技术栈与项目结构

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| 核心语言 | Vanilla JS (ES2022) + ES Modules | 无框架依赖，`type="module"` |
| 路由 | Hash History API | `location.hash`，如 `#/devices` |
| 状态管理 | 自研 EventTarget 模式 | 约 50 行，零依赖 |
| HTTP | Fetch API（原生） | 无 Axios 等封装库 |
| 实时通信 | 原生 WebSocket | 自动重连 |
| 图表 | Chart.js 4.4 | 本地副本 `lib/chart.umd.js` |
| 样式 | 原生 CSS（拆分） | main.css / components.css / pages.css |

**前端目录结构**：

```
frontend/
├── index.html                 # 单页入口，#app 挂载点
├── package.json               # scripts: lint / test / dev
├── lib/
│   └── chart.umd.js          # Chart.js 本地副本（避开 CSP）
├── styles/
│   ├── main.css               # reset + CSS 自定义属性
│   ├── components.css         # Header / Sidebar / Modal / Chart 组件
│   └── pages.css              # 各页面级样式
├── scripts/
│   ├── app.js                 # 应用入口：启动路由 + WS + 预加载
│   ├── router.js              # Hash 路由注册与分发
│   ├── state.js               # 状态管理（EventTarget 发布订阅）
│   ├── api.js                 # API 封装：fetch + 自动 JWT + 401 刷新
│   ├── ws.js                  # WebSocket 客户端：连接/重连/订阅/分发
│   ├── utils.js               # 工具函数集合
│   ├── pages/                 # 页面模块
│   │   ├── home.js            # 首页
│   │   ├── login.js           # 登录页
│   │   ├── dashboard.js       # 仪表盘
│   │   ├── devices.js         # 设备列表
│   │   ├── device-detail.js   # 设备详情
│   │   ├── users.js           # 用户管理
│   │   ├── areas.js           # 区域管理
│   │   └── tenants.js        # 租户管理
│   └── components/            # UI 组件（各页面共享）
│       ├── header.js / sidebar.js
│       ├── device-card.js / data-chart.js
│       ├── alert-item.js / modal.js
│       └── forms.js
└── assets/
    └── images/
```

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────┐
│                    index.html                         │
│                  #app 挂载点                           │
└──────────────────────┬───────────────────────────────┘
                       │ DOM 渲染
┌──────────────────────┴───────────────────────────────┐
│                   app.js (启动)                       │
│  1. 从 localStorage 恢复 token → setState            │
│  2. 注册所有路由（publicRoute / route）               │
│  3. startRouter() → 首次分发                          │
│  4. connectWs() → WebSocket 连接                      │
│  5. api.userInfo() → 预加载用户信息                   │
└──────────────────────┬───────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ↓             ↓             ↓
┌────────────┐  ┌────────────┐  ┌────────────┐
│  router.js │  │  state.js  │  │   ws.js     │
│  Hash 路由  │  │  状态管理  │  │  WS 客户端  │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │               │               │
      ↓               ↓               ↓
┌────────────┐  ┌────────────┐  ┌────────────┐
│  api.js    │  │ subscribers│  │ listeners  │
│  HTTP 请求 │  │  状态变更通知│  │  WS 消息处理│
└─────┬──────┘  └────────────┘  └────────────┘
      │
      ↓
   后端 REST API / WebSocket
```

---

## 3. 应用启动流程

`app.js` 是前端唯一的入口文件，启动顺序严格固定：

```javascript
// 1) 从 localStorage 恢复 token → setState
const savedToken = storage.get('accessToken');
const savedRefresh = storage.get('refreshToken');
if (savedToken) {
    setState({ accessToken: savedToken, refreshToken: savedRefresh });
    connectWs();  // 连接 WebSocket
    api.userInfo().then(data => {
        setState({ user: data.user, tenant: data.tenant });  // 预加载用户信息
    }).catch(() => { /* 401 由 api.js handleAuthFailure 处理 */ });
}

// 2) 注册路由（必须先于 startRouter）
publicRoute('/login');              // 标记公开路径
route('/login', renderLogin);
route('/', renderHome);
route('/devices', renderDevices);
route('/devices/:id', renderDeviceDetail);
route('/areas', renderAreas);
route('/tenants', renderTenants);
route('/users', renderUsers);
route('/dashboard', renderDashboard);

// 3) 启动路由
startRouter();
```

---

## 4. 路由系统

### 4.1 Hash 路由实现

`router.js` 使用 `location.hash` 实现路由：

```javascript
// 注册路由
route('/devices', renderDevices);
route('/devices/:id', renderDeviceDetail);  // 动态参数

// 启动监听
window.addEventListener('hashchange', dispatch);
dispatch();  // 首次处理

// 编程式跳转
export function go(path) {
    const target = '#' + path;
    if (location.hash === target) {
        dispatch();
    } else {
        location.hash = target;
    }
}
```

### 4.2 动态参数解析

`matchRoute()` 将 `/devices/:id` 编译成正则表达式：

```javascript
// '/devices/:id' 匹配 '/devices/42'
// → { pattern: '/devices/:id', params: { id: '42' } }
```

### 4.3 路由守卫

```javascript
async function dispatch() {
    const path = raw ? raw.slice(1) : '/';
    const isPublic = publicPaths.has(path);
    const hasToken = !!getState().accessToken;

    // 未登录访问受保护路由 → 跳登录页
    if (!isPublic && !hasToken) {
        location.hash = '#/login';
        return;
    }

    // 已登录访问登录页 → 跳首页
    if (path === '/login' && hasToken) {
        location.hash = '#/';
        return;
    }

    // 调用 handler 渲染页面
    const ret = await handler(app, match.params || {});
    if (typeof ret === 'function') currentCleanup = ret;  // 保存 cleanup
}
```

### 4.4 页面 Cleanup

Handler 可返回一个 cleanup 函数，在离开页面时调用：

```javascript
// 示例：dashboard.js
export async function render(app) {
    const unsub = on('device_data', handleDeviceData);  // 订阅 WS
    // ...渲染 DOM
    return () => {
        unsub();  // 离开页面时取消订阅
    };
}
```

### 4.5 页面清单

| 页面 | 路由 | 说明 |
|------|------|------|
| 首页 | `/` | 仪表盘快捷入口 |
| 登录 | `/login` | 公开路由，无需认证 |
| 仪表盘 | `/dashboard` | 数据概览、告警列表、趋势图 |
| 设备列表 | `/devices` | 设备 CRUD、状态筛选 |
| 设备详情 | `/devices/:id` | 单设备数据历史 |
| 用户管理 | `/users` | 用户 CRUD（admin/manager） |
| 区域管理 | `/areas` | 树形区域结构 |
| 租户管理 | `/tenants` | 租户 CRUD（admin） |

---

## 5. 状态管理

### 5.1 状态结构

`state.js` 使用 `EventTarget` 实现简单的发布订阅模式：

```javascript
const state = {
    user: null,               // 当前用户
    tenant: null,             // 当前租户
    accessToken: null,        // access token
    refreshToken: null,       // refresh token
    wsStatus: 'disconnected', // WS 连接状态：connected / connecting / disconnected
    devices: [],              // 设备列表
    devicesLoading: false,
    devicesError: null,
    selectedDevice: null,      // 设备详情
    summary: null,             // 仪表盘统计
    alertCount: 0,            // 未确认告警数
    userLoading: false,
    users: [],                // 用户列表
    areas: [],               // 区域列表
    areasTree: [],           // 区域树
    selectedTenantId: null,   // admin 切换租户
};
```

### 5.2 状态操作

```javascript
export function getState() { return state; }           // 获取状态副本

export function setState(patch) {
    Object.assign(state, patch);
    dispatcher.dispatchEvent(new CustomEvent('change', { detail: state }));
}

export function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);  // 返回取消订阅函数
}
```

### 5.3 订阅状态变更

```javascript
// 在页面组件中
const unsub = subscribe((state) => {
    console.log('设备列表更新:', state.devices);
});

// 页面销毁时
unsub();
```

---

## 6. API 封装

### 6.1 请求拦截器

`api.js` 对所有 HTTP 请求做统一处理：

```javascript
async function request(path, opts = {}) {
    // 1. 自动附加 Bearer Token
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (token && path !== '/auth/login' && path !== '/auth/refresh') {
        headers.Authorization = `Bearer ${token}`;
    }

    // 2. 跨租户查询（admin 切换租户时追加 tenantId）
    if (tid && !path.includes('tenantId=') && !path.startsWith('/auth/')) {
        urlPath = path + '?tenantId=' + tid;
    }

    // 3. 发起请求
    let res = await fetch(BASE + urlPath, init);

    // 4. 401 → 自动 refresh 一次 → 重试
    if (res.status === 401) {
        const refreshed = await tryRefresh();
        if (refreshed) return request(urlPath, { ...opts, _retried: true });
        handleAuthFailure('401 + refresh 失败');
    }

    return envelope?.data ?? envelope;
}
```

### 6.2 Token 刷新

```javascript
async function tryRefresh() {
    const rt = getState().refreshToken || storage.get('refreshToken');
    if (!rt) return false;

    refreshing = (async () => {
        const res = await fetch(BASE + '/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        const data = (await res.json()).data;
        if (!data?.accessToken) return false;

        setState({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken || rt,
        });
        storage.set('accessToken', data.accessToken);
        if (data.refreshToken) storage.set('refreshToken', data.refreshToken);
        return true;
    })();
    return refreshing;
}
```

### 6.3 鉴权失败处理

```javascript
function handleAuthFailure(reason) {
    setState({ user: null, accessToken: null, refreshToken: null });
    storage.remove('accessToken');
    storage.remove('refreshToken');
    if (location.hash !== '#/login') {
        location.hash = '#/login';
    }
}
```

### 6.4 业务接口

```javascript
export const api = {
    login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
    userInfo: () => request('/auth/userinfo'),

    listDevices: (params) => request('/devices?' + new URLSearchParams(params)),
    getDevice: (id) => request('/devices/' + encodeURIComponent(id)),
    getDeviceData: (id) => request('/devices/' + encodeURIComponent(id) + '/data'),
    createDevice: (payload) => request('/devices', { method: 'POST', body: payload }),
    updateDevice: (id, payload) => request('/devices/' + encodeURIComponent(id), { method: 'PUT', body: payload }),
    deleteDevice: (id) => request('/devices/' + encodeURIComponent(id), { method: 'DELETE' }),
    regenerateDeviceSecret: (id) => request('/devices/' + encodeURIComponent(id) + '/regenerate-secret', { method: 'POST' }),

    listUsers: () => request('/users'),
    createUser: (payload) => request('/users', { method: 'POST', body: payload }),
    updateUser: (id, payload) => request('/users/' + encodeURIComponent(id), { method: 'PUT', body: payload }),
    deleteUser: (id) => request('/users/' + encodeURIComponent(id), { method: 'DELETE' }),

    listAreas: (tree = true) => request('/areas' + (tree ? '?tree=true' : '')),
    createArea: (payload) => request('/areas', { method: 'POST', body: payload }),

    getDashboardSummary: (areaId) => request('/dashboard/summary' + (areaId ? '?areaId=' + areaId : '')),
    getDashboardTrends: (deviceId, metric, startTime, endTime, interval) =>
        request('/dashboard/trends?' + new URLSearchParams({ deviceId, metric, startTime, endTime, interval })),

    listTenants: () => request('/tenants'),
    createTenant: (payload) => request('/tenants', { method: 'POST', body: payload }),
    updateTenant: (id, payload) => request('/tenants/' + encodeURIComponent(id), { method: 'PUT', body: payload }),
    deleteTenant: (id) => request('/tenants/' + encodeURIComponent(id), { method: 'DELETE' }),
};
```

---

## 7. WebSocket 客户端

### 7.1 连接建立

`ws.js` 使用 **refreshToken** 建立 WebSocket 连接：

```javascript
function buildUrl() {
    const rt = getState().refreshToken;
    if (!rt) return null;
    return `ws://${location.host}/?refreshToken=${encodeURIComponent(rt)}`;
}

export function connect() {
    const url = buildUrl();
    if (!url) return;

    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
        setState({ wsStatus: 'connected' });
        // 冗余鉴权：open 后发 auth 消息
        ws.send(JSON.stringify({ type: 'auth', refreshToken: rt }));
    });
}
```

### 7.2 重连机制

```javascript
function scheduleReconnect() {
    if (reconnectTimer || manuallyClosed) return;
    if (!getState().refreshToken) return;  // 登出后不重连
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, 5000);  // 5s 重连
}
```

### 7.3 鉴权失败检测

```javascript
ws.addEventListener('close', (e) => {
    const wasOpened = opened;
    setState({ wsStatus: 'disconnected' });

    // 从未 open 就 close → 鉴权失败
    if (!wasOpened && !manuallyClosed) {
        handleAuthFailure();  // 清 token + 跳 /login
        return;
    }
    if (!manuallyClosed) scheduleReconnect();
});
```

### 7.4 消息订阅

```javascript
const listeners = new Map();  // type → Set<fn>

export function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);  // 返回取消订阅
}

// WS 收到消息后分发
ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const set = listeners.get(msg.type);
    if (set) set.forEach(fn => fn(msg));
});
```

### 7.5 订阅示例

```javascript
import { on } from './ws.js';

// 订阅设备数据
const unsubData = on('device_data', (msg) => {
    console.log('设备', msg.deviceId, '最新数据:', msg.metrics);
    // 更新页面上的设备指标显示
});

// 订阅告警
const unsubAlert = on('alert', (msg) => {
    console.log('触发告警:', msg.ruleName);
    // 显示告警通知
});

// 订阅任务结果（异步操作完成通知）
const unsubTask = on('task_result', (msg) => {
    if (msg.status === 'success') {
        console.log('任务完成:', msg.taskType, msg.data);
        // 刷新列表
    }
});

// 组件销毁时取消订阅
unsubData();
unsubAlert();
unsubTask();
```

---

## 8. 页面模块

每个页面模块是一个独立的 JS 文件，导出 `render(app, params)` 函数：

```javascript
export async function render(app, params = {}) {
    // 1. 渲染页面 HTML
    app.innerHTML = '<div>...</div>';

    // 2. 绑定事件监听

    // 3. 订阅状态变更（WS 推送更新 UI）
    const unsubState = subscribe(handleStateChange);

    // 4. 订阅 WebSocket 消息
    const unsubWs = on('device_data', handleDeviceData);

    // 5. 返回 cleanup 函数
    return () => {
        unsubState();
        unsubWs();
    };
}
```

### 8.1 Dashboard（仪表盘）

- 顶部统计卡片：总设备数、在线数、离线数、今日告警
- 未确认告警列表（AlertItem 组件）
- 设备状态分布图表（Chart.js 饼图/柱状图）
- 指标趋势折线图
- 订阅 `device_data` / `device_status` / `alert` 实时更新

### 8.2 Devices（设备列表）

- 设备列表（DeviceCard 组件）
- 状态筛选、区域筛选、分页
- 创建设备表单（Modal）
- 订阅 `task_result` 处理异步 CRUD 结果
- 订阅 `device_data` 实时更新设备指标

### 8.3 Device Detail（设备详情）

- 设备基本信息
- 实时数据图表（Chart.js 折线图）
- 历史数据表格
- 订阅 `device_data` 实时更新图表

### 8.4 Users（用户管理）

- 用户列表（admin/manager 可见）
- 角色筛选
- 创 建/编辑/删除用户（Modal）
- 订阅 `task_result` 处理异步操作

### 8.5 Areas（区域管理）

- 树形结构展示（递归渲染）
- 新增/编辑区域
- 支持多级嵌套

### 8.6 Tenants（租户管理）

- 租户列表（admin 可见）
- 租户 CRUD
- 切换查看租户（`selectedTenantId` 状态）

### 8.7 Login（登录页）

- 用户名/密码表单
- 登录成功后存储 token → 跳首页

---

## 9. 核心工具

### 9.1 utils.js 工具函数

`utils.js` 包含多个工具函数：

```javascript
// localStorage 封装（内存+本地双层）
export const storage = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    remove(key) { localStorage.removeItem(key); },
};

// DOM 辅助函数
export function h(tag, props, children) { /* 创建 DOM 元素 */ }
export function on(el, event, handler) { el.addEventListener(event, handler); }
export function off(el, event, handler) { el.removeEventListener(event, handler); }

// 格式化工具
export function formatDate(date) { /* YYYY-MM-DD HH:mm */ }
export function formatNumber(n) { /* 千分位格式化 */ }

// 图表工厂
export function createChart(canvas, config) { /* Chart.js 封装 */ }
```

### 9.2 前端常量约定

```javascript
// WS 连接状态
wsStatus: 'connected' | 'connecting' | 'disconnected'

// 设备状态
status: 'online' | 'offline' | 'inactive'

// 用户角色
role: 'admin' | 'manager' | 'user'

// WS 消息类型
type: 'device_data' | 'device_status' | 'alert' | 'task_result' | 'auth' | 'auth_result'
```

---

## 10. CSS 样式架构

### 10.1 样式文件分工

| 文件 | 内容 |
|------|------|
| `main.css` | reset + CSS 自定义属性（颜色/间距）+ 全局布局 |
| `components.css` | Header/Sidebar/Modal/DeviceCard/AlertItem/DataChart 组件 |
| `pages.css` | 各页面级样式，覆盖组件在特定页面的表现 |

### 10.2 CSS 自定义属性

```css
:root {
    --color-primary: #1890ff;
    --color-success: #52c41a;
    --color-warning: #faad14;
    --color-danger: #ff4d4f;
    --color-bg: #f0f2f5;
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --radius: 4px;
    --shadow: 0 2px 8px rgba(0,0,0,0.1);
}
```

### 10.3 响应式布局

使用 CSS Grid + Flexbox 实现响应式：

```css
.app-layout { display: grid; grid-template-columns: 220px 1fr; grid-template-rows: 60px 1fr; }
.header { grid-column: 1 / -1; }
.sidebar { grid-row: 2; }
.content { padding: var(--spacing-lg); }
```

---

*本文档版本: v1.0*
*生成日期: 2026-06-14*
*基于代码实现: frontend/scripts/*