// scripts/api.js — 完整业务接口

import { getState, setState } from './state.js';
import { storage } from './utils.js';

const BASE = '/api';
let refreshing = null;

async function request(path, opts = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
    };
    const token = getState().accessToken;
    if (token && path !== '/auth/login' && path !== '/auth/refresh') {
        headers.Authorization = `Bearer ${token}`;
    }

    const init = { ...opts, headers };
    if (opts.body && typeof opts.body === 'object') {
        init.body = JSON.stringify(opts.body);
    }

    let res;
    try {
        res = await fetch(BASE + path, init);
    } catch (e) {
        const err = new Error('NETWORK_ERROR: ' + e.message);
        err.code = 'NETWORK';
        throw err;
    }

    if (res.status === 401) {
        if (path === '/auth/login' || path === '/auth/refresh') {
            return parseError(res, '认证失败');
        }
        const refreshed = await tryRefresh();
        if (refreshed) {
            return request(path, { ...opts, _retried: true });
        }
        setState({ user: null, accessToken: null, refreshToken: null });
        storage.remove('accessToken');
        storage.remove('refreshToken');
        location.hash = '#/login';
        const err = new Error('AUTH_FAILED');
        err.code = 'HTTP_4XX';
        throw err;
    }

    if (!res.ok) {
        return parseError(res);
    }

    if (res.status === 204) return null;

    const envelope = await res.json().catch(() => null);
    if (envelope && envelope.success === false) {
        const err = new Error(envelope.error?.message || '请求失败');
        err.code = 'HTTP_4XX';
        throw err;
    }
    return envelope?.data ?? envelope;
}

async function parseError(res, fallback) {
    let message = fallback || `HTTP ${res.status}`;
    try {
        const env = await res.json();
        if (env?.error?.message) message = env.error.message;
    } catch {}
    const err = new Error(message);
    err.code = res.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX';
    throw err;
}

async function tryRefresh() {
    if (refreshing) return refreshing;

    const rt = getState().refreshToken || storage.get('refreshToken');
    if (!rt) return false;

    refreshing = (async () => {
        try {
            const res = await fetch(BASE + '/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: rt }),
            });
            if (!res.ok) return false;
            const env = await res.json();
            const data = env?.data || env;
            if (!data?.accessToken) return false;

            setState({
                accessToken: data.accessToken,
                refreshToken: data.refreshToken || rt,
            });
            storage.set('accessToken', data.accessToken);
            if (data.refreshToken) storage.set('refreshToken', data.refreshToken);
            return true;
        } catch {
            return false;
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}

// ────────── 业务接口 ──────────
export const api = {
    // 认证
    login: (username, password) =>
        request('/auth/login', { method: 'POST', body: { username, password } }),

    // 设备
    listDevices: (params) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return request('/devices' + qs);
    },
    getDevice: (id) => request('/devices/' + encodeURIComponent(id)),
    getDeviceData: (id) => request('/devices/' + encodeURIComponent(id) + '/data'),
    createDevice: (payload) => request('/devices', { method: 'POST', body: payload }),
    updateDevice: (id, payload) => request('/devices/' + encodeURIComponent(id), { method: 'PUT', body: payload }),
    deleteDevice: (id) => request('/devices/' + encodeURIComponent(id), { method: 'DELETE' }),

    // 仪表盘
    getDashboardSummary: () => request('/dashboard/summary'),
    // 后端要 deviceId, metric, startTime, endTime; 缺一返 400
    getDashboardTrends: (deviceId, metric, startTime, endTime, interval = '1h') => {
        const qs = new URLSearchParams({
            deviceId: String(deviceId),
            metric: String(metric),
            startTime: String(startTime),
            endTime: String(endTime),
            interval,
        });
        return request('/dashboard/trends?' + qs.toString());
    },
};
