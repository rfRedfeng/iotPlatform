// scripts/app.js — 完整启动
//
// 启动顺序（必须严格）：
//   1) 从 localStorage 恢复 token → setState
//   2) 注册所有路由（含 publicRoute 标记）
//   3) startRouter() —— 首次 dispatch 才会查到 accessToken

import { start as startRouter, route, publicRoute } from './router.js';
import { setState } from './state.js';
import { storage } from './utils.js';
import { connect as connectWs } from './ws.js';

import { render as renderHome } from './pages/home.js';
import { render as renderLogin } from './pages/login.js';
import { render as renderDevices } from './pages/devices.js';
import { render as renderDeviceDetail } from './pages/device-detail.js';
import { render as renderDashboard } from './pages/dashboard.js';

console.log('[I8] boot');

// 1) 恢复登录态
const savedToken = storage.get('accessToken');
const savedRefresh = storage.get('refreshToken');
if (savedToken) {
    setState({ accessToken: savedToken, refreshToken: savedRefresh });
    console.log('[I8] restored token from localStorage');
    connectWs();
}

// 2) 注册路由
publicRoute('/login');
route('/login', renderLogin);
route('/', renderHome);
route('/devices', renderDevices);
route('/devices/:id', renderDeviceDetail);
route('/dashboard', renderDashboard);

// 3) 启动
startRouter();
