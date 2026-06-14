// scripts/components/header.js — 受保护页面统一头部
// I11: admin 可切换租户查看所有数据

import { getState, setState, subscribe } from '../state.js';
import { disconnect } from '../ws.js';
import { storage, h } from '../utils.js';
import { go } from '../router.js';
import { api } from '../api.js';

export function mountHeader() {
    const user = getState().user;
    const status = getState().wsStatus;

    // 租户切换器（仅 admin,初始隐藏）
    const tenantSelect = h('select', {
        id: 'tenant-switcher',
        style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem', display: 'none' },
    }, [h('option', { value: '' }, '我的租户')]);

    // 用 addEventListener 确保事件可靠
    tenantSelect.addEventListener('change', function () {
        const v = this.value;
        const tid = v ? Number(v) : null;
        console.log('[header] 切换到租户:', tid);
        setState({ selectedTenantId: tid });
    });

    const userSpan = h('span', {
        id: 'user-name',
        style: { fontSize: '0.9rem' },
    }, user ? `欢迎, ${user.username}` : '');

    const logoutBtn = h('button', {
        id: 'logout-btn',
        style: { padding: '0.25rem 0.75rem', display: user ? '' : 'none' },
    }, '登出');

    const element = h('header', { class: 'header' }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' } }, [
            h('h1', { style: { margin: '0' } }, 'IoT Cloud Platform'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '1rem' } }, [
                tenantSelect,
                h('span', {
                    id: 'ws-status',
                    style: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: colorFor(status) },
                }, [
                    h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colorFor(status), display: 'inline-block' } }),
                    textFor(status),
                ]),
                userSpan,
                logoutBtn,
            ]),
        ]),
    ]);

    logoutBtn.addEventListener('click', handleLogout);

    // 加载租户列表给 admin 切换用
    loadTenantsForAdmin();

    const unsubscribe = subscribe((state) => {
        updateWsIndicator(element, state.wsStatus);
        // 用户信息变化
        const u = state.user;
        const nameEl = element.querySelector('#user-name');
        const btn = element.querySelector('#logout-btn');
        if (nameEl) nameEl.textContent = u ? `欢迎, ${u.username}` : '';
        if (btn) btn.style.display = u ? '' : 'none';
        // admin 显示/隐藏租户切换器 + 加载租户列表
        const sel = element.querySelector('#tenant-switcher');
        const isAdmin = u && u.role === 'admin';
        if (sel) {
            sel.style.display = isAdmin ? '' : 'none';
            if (isAdmin && sel.options.length <= 1) loadTenantsForAdmin();
        }
    });

    return {
        element,
        cleanup: () => unsubscribe(),
    };

    // ══════════ helpers ══════════

    async function loadTenantsForAdmin() {
        if (!getState().user || getState().user.role !== 'admin') return;
        try {
            const data = await api.listTenants();
            const list = Array.isArray(data) ? data : [];
            const sel = element.querySelector('#tenant-switcher');
            if (!sel) return;
            // 保留第一个 option（我的租户），追加租户列表
            while (sel.options.length > 1) sel.remove(1);
            list.forEach(t => {
                sel.appendChild(h('option', { value: String(t.id) }, t.name));
            });
            // 恢复上次选择
            const cur = getState().selectedTenantId;
            if (cur) sel.value = String(cur);
        } catch (e) {
            console.warn('[header] load tenants failed', e);
        }
    }
}

function updateWsIndicator(element, status) {
    const ind = element.querySelector('#ws-status');
    if (!ind) return;
    const color = colorFor(status);
    ind.style.color = color;
    ind.replaceChildren(
        h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' } }),
        textFor(status),
    );
}

function colorFor(status) {
    if (status === 'connected') return '#2ecc71';
    if (status === 'connecting') return '#f39c12';
    return '#e74c3c';
}

function textFor(status) {
    if (status === 'connected') return '实时已连接';
    if (status === 'connecting') return '连接中';
    return '实时已断开';
}

function handleLogout() {
    setState({ user: null, accessToken: null, refreshToken: null, selectedTenantId: null });
    storage.remove('accessToken');
    storage.remove('refreshToken');
    try { disconnect(); } catch (e) { console.warn('[logout] disconnect error', e); }
    console.log('[logout] cleared');
    go('/login');
}