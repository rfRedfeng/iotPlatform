// scripts/pages/tenants.js — 租户管理（仅 admin）

import { h, formatDate } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';
import { openModal } from '../components/modal.js';

export function render(root) {
    const header = mountHeader();
    const nav = navigation();
    const me = getState().user || {};

    const tableContainer = h('div', { id: 'tenants-table' });

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' } }, [
                h('h2', {}, '租户管理'),
                me.role === 'admin'
                    ? h('button', { id: 'create-btn', style: { padding: '0.4rem 0.8rem', background: '#2ecc71' } }, '＋ 新建租户')
                    : null,
            ]),
            tableContainer,
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    if (me.role === 'admin') {
        const btn = main.querySelector('#create-btn');
        if (btn) btn.addEventListener('click', openCreateModal);
    }

    const unsubscribe = subscribe(() => repaintTable());

    loadTenants();

    return () => {
        unsubscribe();
        header.cleanup();
    };

    // ════════════════════════════════════════════════════════

    async function loadTenants() {
        setState({ tenantsLoading: true });
        try {
            const data = await api.listTenants();
            const list = Array.isArray(data) ? data : [];
            setState({ tenants: list, tenantsLoading: false });
        } catch (e) {
            console.error('[tenants] load failed', e);
            setState({ tenantsLoading: false, tenantsError: e.message });
        }
    }

    function repaintTable() {
        if (getState().tenantsLoading) {
            tableContainer.replaceChildren(h('p', { style: { color: '#7f8c8d' } }, '加载中...'));
            return;
        }
        const err = getState().tenantsError;
        if (err) {
            tableContainer.replaceChildren(h('p', { style: { color: '#e74c3c' } }, '错误: ' + err));
            return;
        }
        const list = getState().tenants || [];
        if (list.length === 0) {
            tableContainer.replaceChildren(h('p', { style: { color: '#7f8c8d' } }, '暂无租户'));
            return;
        }
        const isAdmin = (getState().user || {}).role === 'admin';
        tableContainer.replaceChildren(
            h('table', { style: tableStyle }, [
                h('thead', {}, h('tr', {}, [
                    th('ID'), th('名称'), th('状态'), th('设备配额'), th('用户配额'), th('创建时间'),
                    isAdmin ? th('操作') : null,
                ].filter(Boolean))),
                h('tbody', {}, list.map(t => tenantRow(t, isAdmin))),
            ]),
        );
    }

    function tenantRow(t, isAdmin) {
        return h('tr', {}, [
            td(String(t.id)),
            td(t.name),
            td(statusBadge(t.status)),
            td(String(t.maxDevices)),
            td(String(t.maxUsers)),
            td(t.createdAt ? formatDate(t.createdAt) : '-'),
            isAdmin ? td(h('div', { style: { display: 'flex', gap: '0.25rem' } }, [
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem' },
                    onclick: () => openEditModal(t),
                }, '编辑'),
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem', background: '#e74c3c' },
                    onclick: () => confirmDelete(t),
                }, '删除'),
            ])) : null,
        ].filter(Boolean));
    }

    function openCreateModal() {
        openModal({
            title: '新建租户',
            content: (body, close) => {
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('label', {}, ['名称 ', h('input', { name: 'name', required: true, style: { width: '100%', padding: '0.4rem' } })]),
                    h('label', {}, ['设备配额 ', h('input', { name: 'maxDevices', type: 'number', min: '1', value: '100', style: { width: '100%', padding: '0.4rem' } })]),
                    h('label', {}, ['用户配额 ', h('input', { name: 'maxUsers', type: 'number', min: '1', value: '20', style: { width: '100%', padding: '0.4rem' } })]),
                    h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' } }, [
                        h('button', { type: 'button', style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                        h('button', { type: 'submit', style: { background: '#2ecc71' } }, '创建'),
                    ]),
                ]);
                body.appendChild(form);
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fd = new FormData(form);
                    const maxDevices = parseInt(fd.get('maxDevices'), 10);
                    const maxUsers = parseInt(fd.get('maxUsers'), 10);
                    if (isNaN(maxDevices) || maxDevices < 1 || !Number.isInteger(maxDevices)) { alert('设备配额必须为正整数'); return; }
                    if (isNaN(maxUsers) || maxUsers < 1 || !Number.isInteger(maxUsers)) { alert('用户配额必须为正整数'); return; }
                    const payload = {
                        name: String(fd.get('name') || '').trim(),
                        maxDevices,
                        maxUsers,
                    };
                    if (!payload.name) { alert('名称必填'); return; }
                    try {
                        await api.createTenant(payload);
                        close();
                        loadTenants();
                    } catch (err) { alert('创建失败: ' + err.message); }
                });
            },
        });
    }

    function openEditModal(t) {
        openModal({
            title: '编辑租户: ' + t.name,
            content: (body, close) => {
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('label', {}, ['名称 ', h('input', { name: 'name', value: t.name, required: true, style: { width: '100%', padding: '0.4rem' } })]),
                    h('label', {}, ['状态 ', h('select', { name: 'status', style: { width: '100%', padding: '0.4rem' } }, [
                        h('option', { value: 'active', selected: t.status === 'active' }, 'active'),
                        h('option', { value: 'inactive', selected: t.status === 'inactive' }, 'inactive'),
                    ])]),
                    h('label', {}, ['设备配额 ', h('input', { name: 'maxDevices', type: 'number', min: '1', value: String(t.maxDevices), style: { width: '100%', padding: '0.4rem' } })]),
                    h('label', {}, ['用户配额 ', h('input', { name: 'maxUsers', type: 'number', min: '1', value: String(t.maxUsers), style: { width: '100%', padding: '0.4rem' } })]),
                    h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' } }, [
                        h('button', { type: 'button', style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                        h('button', { type: 'submit', style: { background: '#2ecc71' } }, '保存'),
                    ]),
                ]);
                body.appendChild(form);
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fd = new FormData(form);
                    const maxDevices = parseInt(fd.get('maxDevices'), 10);
                    const maxUsers = parseInt(fd.get('maxUsers'), 10);
                    if (isNaN(maxDevices) || maxDevices < 1 || !Number.isInteger(maxDevices)) { alert('设备配额必须为正整数'); return; }
                    if (isNaN(maxUsers) || maxUsers < 1 || !Number.isInteger(maxUsers)) { alert('用户配额必须为正整数'); return; }
                    const payload = {
                        name: String(fd.get('name') || '').trim(),
                        status: String(fd.get('status') || 'active'),
                        maxDevices,
                        maxUsers,
                    };
                    try {
                        await api.updateTenant(t.id, payload);
                        close();
                        loadTenants();
                    } catch (err) { alert('保存失败: ' + err.message); }
                });
            },
        });
    }

    function confirmDelete(t) {
        openModal({
            title: '删除租户',
            content: (body, close) => {
                body.appendChild(h('p', {}, `确定要删除租户 "${t.name}" 吗？该租户下的所有用户和设备将被孤立。`));
                body.appendChild(h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' } }, [
                    h('button', { style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                    h('button', {
                        style: { background: '#e74c3c' }, onclick: async () => {
                            try { await api.deleteTenant(t.id); close(); loadTenants(); }
                            catch (e) { alert('删除失败: ' + e.message); }
                        }
                    }, '确认删除'),
                ]));
            },
        });
    }

    function td(c) { return h('td', { style: tdStyle }, c); }
    function th(t) { return h('th', { style: thStyle }, t); }
    function statusBadge(s) {
        const color = s === 'active' ? '#2ecc71' : '#e74c3c';
        return h('span', { style: { color, fontWeight: 'bold' } }, s || '-');
    }
}

const thStyle = 'padding:0.6rem 0.5rem;text-align:left;border-bottom:2px solid #bdc3c7;background:#ecf0f1;';
const tdStyle = 'padding:0.6rem 0.5rem;border-bottom:1px solid #ecf0f1;';
const tableStyle = 'width:100%;border-collapse:collapse;background:white;margin-top:0.5rem;';