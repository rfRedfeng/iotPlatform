// scripts/router.js — 前端路由系统

// 依赖：getState 来自 state.js；state.js 不依赖 router.js（无循环）
import { getState } from './state.js';

const routes = new Map();
const publicPaths = new Set();   // 标记不需要鉴权的路径
let currentCleanup = null;

/**
 * 注册一条路由。
 * @param {string} path  例如 '/', '/devices', '/devices/:id'
 * @param {(root: HTMLElement, params?: object) => void | (() => void)} handler
 *        渲染函数；可选返回 cleanup 函数，在离开此页面前调用
 */
export function route(path, handler) {
    routes.set(path, handler);
}

/**
 * 标记某路径为公开（不要求登录）。
 * 必须在 route() 同一个路径之前或之后调用，二者顺序无要求。
 * @param {string} path 例如 '/login'
 */
export function publicRoute(path) {
    publicPaths.add(path);
}

/**
 * 启动路由监听。
 * 必须在所有 route() 调用之后调用。
 */
export function start() {
    window.addEventListener('hashchange', dispatch);
    dispatch();   // 处理首次进入（location.hash 已有值的情况）
}

/**
 * 编程式跳转。
 * 如果目标 hash 与当前相同（hashchange 不会触发），手动派发一次。
 * @param {string} path 例如 '/devices'
 */
export function go(path) {
    const target = '#' + path;
    if (location.hash === target) {
        dispatch();
    } else {
        location.hash = target;
    }
}

/**
 * 注册一个兜底路由（404 / 未匹配）。多次调用以最后一次为准。
 */
export function fallback(handler) {
    routes.set('*', handler);
}

/**
 * 路由分发：根据 location.hash 找到 handler，调用它渲染。
 * 1. 调用上一次的 cleanup（如果有）
 * 2. 清空 #app
 * 3. 找 handler，调用它，传入 params（如果有）
 * 4. 如果 handler 返回函数，保存为 currentCleanup，以便下次调用
 *
 * 注意：handler 可以是 async 的，等待异步操作完成后再渲染。
 */
async function dispatch() {
    const raw = location.hash;           // '#/devices/42' 或 ''
    const path = raw ? raw.slice(1) : '/';
    const app = document.getElementById('app');
    if (!app) {
        console.error('[router] #app 挂载点不存在');
        return;
    }

    // ── 鉴权守卫（I3 新增）──
    const isPublic = publicPaths.has(path);
    const hasToken = !!getState().accessToken;
    if (!isPublic && !hasToken) {
        // 受保护路径 + 未登录 → 跳登录页
        location.hash = '#/login';
        return;
    }
    if (path === '/login' && hasToken) {
        // 已登录访问登录页 → 跳首页
        location.hash = '#/';
        return;
    }

    // 1. 调用上一次的 cleanup 
    if (typeof currentCleanup === 'function') {
        try { currentCleanup(); } catch (e) { console.error('[router] cleanup error', e); }
        currentCleanup = null;
    }

    // 2. 清空 #app（用 replaceChildren，不解析 HTML，规避 XSS）
    app.replaceChildren();

    // 3. 找 handler
    const match = matchRoute(path);
    const handler = match ? routes.get(match.pattern) : null;

    if (!handler) {
        const fb = routes.get('*');
        if (fb) {
            const ret = await fb(app, {});
            if (typeof ret === 'function') currentCleanup = ret;
        } else {
            app.innerHTML = '<p style="padding:2rem;">404 — 路径未注册: ' + path + '</p>';
        }
        return;
    }

    // 4. 调用 handler，参数来自 :id 解析
    const ret = await handler(app, match.params || {});
    if (typeof ret === 'function') currentCleanup = ret;

    console.log('[router] dispatched:', path);
}

/**
 * 简单路径匹配：把 '/devices/:id' 编译成正则，匹配 '/devices/42' → { pattern: '/devices/:id', params: {id: '42'} }
 * 不支持 query、不支持通配符，I5 设备详情会用上 :id。
 */
function matchRoute(path) {
    for (const pattern of routes.keys()) {
        if (pattern === '*') continue;
        const paramNames = [];
        // 提取模板中需要的匹配项目
        const regexStr = pattern.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
        });
        // 编译为正则表达式,用 ^$ 包裹，确保全匹配
        const re = new RegExp('^' + regexStr + '$');
        const m = path.match(re);
        if (m) {
            const params = {};
            paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
            return { pattern, params };
        }
    }
    return null;
}