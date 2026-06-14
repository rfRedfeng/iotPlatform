// scripts/ws.js — I4 引入 + refreshToken 鉴权升级
//
// WebSocket 客户端，3 个能力：
//   1. connect()    - 打开连接,自动写 state.wsStatus
//   2. disconnect() - 关闭连接,停止重连
//   3. on(type, fn) - 订阅后端推送的某类消息（I5+ 用）
//
// 鉴权设计（重点）：
//   ★ 连接建立时用 refreshToken（不是 accessToken）★
//
//   原因：
//     - accessToken 短（15min），accessToken 过期 WS 会被后端拒绝
//     - refreshToken 长（7d），连接生命周期内不会过期 → 连接稳定
//     - WS 是长连接，不适合用短期 accessToken
//
//   传递方式：URL 查询参数 ?refreshToken=xxx
//     - 后端可在 upgrade handler 里从 req.url 解析
//     - 也兼容在 open 后第一条消息发 auth（保留作为冗余）
//
// 后端约定（来自 backend/src/data-processing/RealtimePusher.js）：
//   - URL: ws://${host}/  + ?refreshToken=xxx
//   - 推送消息格式: { type: 'device_data' | 'device_status' | 'alert' | 'task_result', ... }

import { getState, setState } from './state.js';

let ws = null;
let reconnectTimer = null;
let manuallyClosed = false;   // 区分"用户主动断开"和"网络断线"
const listeners = new Map();   // type -> Set<fn>

/**
 * 构造带 refreshToken 的 WebSocket URL。
 * refreshToken 缺失时返回 null,调用方应跳过连接。
 */
function buildUrl() {
    const rt = getState().refreshToken;
    if (!rt) return null;
    // URL 编码避免特殊字符破坏 query
    const encoded = encodeURIComponent(rt);
    return `ws://${location.host}/?refreshToken=${encoded}`;
}

/**
 * 建立 WebSocket 连接。
 * 多次调用安全: 已有连接(OPEN 或 CONNECTING)不会重复打开。
 */
export function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    const url = buildUrl();
    if (!url) {
        console.log('[ws] 无 refreshToken, 跳过连接');
        setState({ wsStatus: 'disconnected' });
        return;
    }

    manuallyClosed = false;
    setState({ wsStatus: 'connecting' });
    console.log('[ws] connecting (refreshToken auth)');

    try {
        ws = new WebSocket(url);
    } catch (e) {
        console.error('[ws] new WebSocket 失败', e);
        scheduleReconnect();
        return;
    }

    ws.addEventListener('open', () => {
        console.log('[ws] open');
        setState({ wsStatus: 'connected' });

        // 冗余:有些后端实现不读 URL query,需要第一条消息鉴权
        // 保留这个发送,后端按需支持
        try {
            const rt = getState().refreshToken;
            if (rt && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'auth', refreshToken: rt }));
            }
        } catch (e) { /* ignore */ }
    });

    ws.addEventListener('message', (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (!msg || typeof msg !== 'object' || !msg.type) return;
        // 忽略后端对 auth 的回执
        if (msg.type === 'auth_result') return;
        const set = listeners.get(msg.type);
        if (set) {
            set.forEach((fn) => {
                try { fn(msg); } catch (err) { console.error('[ws] listener error', err); }
            });
        }
    });

    ws.addEventListener('close', (e) => {
        console.log('[ws] close', e.code, e.reason);
        ws = null;
        setState({ wsStatus: 'disconnected' });
        if (!manuallyClosed) scheduleReconnect();
    });

    ws.addEventListener('error', (e) => {
        console.warn('[ws] error', e);
    });
}

/**
 * 主动关闭连接（登出时调用）。
 * 不会再重连。
 */
export function disconnect() {
    manuallyClosed = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (ws) {
        try { ws.close(1000, 'logout'); } catch {}
        ws = null;
    }
    setState({ wsStatus: 'disconnected' });
    console.log('[ws] disconnected (manual)');
}

function scheduleReconnect() {
    if (reconnectTimer || manuallyClosed) return;
    if (!getState().refreshToken) return;   // 登出后不重连
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, 5000);
}

/**
 * 订阅某类消息。
 * @param {string} type 例如 'task_result' / 'device_data' / 'alert'
 * @param {(msg: object) => void} fn
 * @returns {() => void} unsubscribe
 */
export function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => {
        const set = listeners.get(type);
        if (set) set.delete(fn);
    };
}
