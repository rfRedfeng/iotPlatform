// scripts/state.js 

const state = {
    user: null,                  // 登录用户 {id, username, role, tenantId}
    accessToken: null,           // access token
    refreshToken: null,          // refresh token 
    wsStatus: 'disconnected',    // WebSocket 连接状态：'connected' / 'connecting' / 'disconnected'
    devices: [],                 // 设备列表
    devicesLoading: false,       // 设备列表加载中
    devicesError: null,          // 设备列表加载错误信息
    selectedDevice: null,        // 设备详情
    summary: null,               // 仪表盘统计
    alertCount: 0,               // 未确认告警数
};

const subs = new Set();
const dispatcher = new EventTarget();
dispatcher.addEventListener('change', (e) => {
    subs.forEach((fn) => {
        try { fn(e.detail); }
        catch (err) { console.error('[state] subscriber error', err); }
    });
});

export function getState() { return state; }

export function setState(patch) {
    Object.assign(state, patch);
    dispatcher.dispatchEvent(new CustomEvent('change', { detail: state }));
}

export function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
}
