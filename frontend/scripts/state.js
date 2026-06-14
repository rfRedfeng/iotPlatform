// scripts/state.js

const state = {
    user: null,                  // 当前用户（登录存基础字段，/auth/userinfo 后存完整字段）
    tenant: null,                // 当前租户（/auth/userinfo 返回）
    accessToken: null,           // access token
    refreshToken: null,          // refresh token
    wsStatus: 'disconnected',    // WebSocket 连接状态：'connected' / 'connecting' / 'disconnected'
    devices: [],                 // 设备列表
    devicesLoading: false,       // 设备列表加载中
    devicesError: null,          // 设备列表错误信息
    selectedDevice: null,        // 设备详情
    summary: null,               // 仪表盘统计
    alertCount: 0,               // 未确认告警数
    userLoading: false,          // /auth/userinfo 加载状态
    userError: null,             // /auth/userinfo 错误信息
    users: [],                   // 用户列表（admin/manager 可见）
    usersLoading: false,
    usersError: null,
    tenants: [],                 // 租户列表
    tenantsLoading: false,
    tenantsError: null,
    areas: [],                   // I10: 区域列表（平铺）
    areasTree: [],              // I10: 区域树形结构
    areasLoading: false,
    selectedAreaId: null,        // I10: 仪表盘当前选中的区域（null = 全部）
    selectedTenantId: null,      // admin 切换查看的租户（null = 自己）
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
