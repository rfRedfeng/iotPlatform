// scripts/pages/home.js — 首页（展示用户 + 租户信息）

import { h, formatDate } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';

export function render(root) {
    const header = mountHeader();
    const nav = navigation();

    const profileContainer = h('div', {
        id: 'profile-cards',
        style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1rem', marginBottom: '1.5rem',
        },
    });

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('h2', { style: { marginBottom: '0.5rem' } }, '首页'),
            h('p', { style: { color: '#7f8c8d', marginBottom: '1.5rem' } }, '当前登录账号与所属租户概览'),
            profileContainer,
            h('p', { style: { marginTop: '1.5rem' } }, [
                '快捷入口：',
                h('a', { href: '#/dashboard', style: { marginLeft: '0.5rem' } }, '仪表盘'),
                ' | ',
                h('a', { href: '#/devices', style: { marginLeft: '0.5rem' } }, '设备列表'),
            ]),
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    loadProfile();

    const unsubscribe = subscribe(() => repaintProfile());
    return () => {
        unsubscribe();
        header.cleanup();
    };

    // ══════════ 函数区 ══════════

    async function loadProfile() {
        setState({ userLoading: true, userError: null });
        try {
            const data = await api.userInfo();
            // 直接存到 state.user 和 state.tenant
            setState({ user: data.user, tenant: data.tenant, userLoading: false });
        } catch (e) {
            console.error('[home] load profile failed', e);
            setState({ userLoading: false, userError: e.message || '加载失败' });
        }
    }

    function repaintProfile() {
        const s = getState();
        if (s.userLoading) {
            profileContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '加载中...')
            );
            return;
        }
        if (s.userError) {
            profileContainer.replaceChildren(
                h('p', { style: { color: '#e74c3c' } }, '错误: ' + s.userError)
            );
            return;
        }
        const user = s.user;
        const tenant = s.tenant;
        if (!user) {
            profileContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '暂无数据')
            );
            return;
        }
        profileContainer.replaceChildren(
            userCard(user),
            tenantCard(tenant),
        );
    }

    function userCard(u) {
        return h('div', {
            style: {
                background: 'white', padding: '1.5rem', borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                borderLeft: '4px solid #3498db',
            },
        }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' } }, [
                h('span', { style: { fontSize: '1.5rem' } }, '👤'),
                h('h3', { style: { margin: '0', color: '#2c3e50' } }, '用户信息'),
            ]),
            row('用户名', u.username),
            row('用户 ID', String(u.id)),
            row('角色', roleBadge(u.role)),
            row('邮箱', u.email || '（未设置）'),
            row('注册时间', u.createdAt ? formatDate(u.createdAt) : '-'),
        ]);
    }

    function tenantCard(t) {
        if (!t) {
            return h('div', {
                style: {
                    background: 'white', padding: '1.5rem', borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    borderLeft: '4px solid #95a5a6',
                },
            }, [
                h('h3', {}, '租户信息'),
                h('p', { style: { color: '#7f8c8d' } }, '租户数据不可用'),
            ]);
        }
        return h('div', {
            style: {
                background: 'white', padding: '1.5rem', borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                borderLeft: '4px solid #9b59b6',
            },
        }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' } }, [
                h('span', { style: { fontSize: '1.5rem' } }, '🏢'),
                h('h3', { style: { margin: '0', color: '#2c3e50' } }, '租户信息'),
            ]),
            row('租户名称', t.name),
            row('租户 ID', String(t.id)),
            row('状态', tenantStatusBadge(t.status)),
            row('设备配额', `${t.maxDevices ?? '-'} 台`),
            row('用户配额', `${t.maxUsers ?? '-'} 人`),
        ]);
    }

    function row(label, value) {
        return h('div', {
            style: {
                display: 'flex', justifyContent: 'space-between',
                padding: '0.4rem 0', borderBottom: '1px solid #f5f5f5',
            },
        }, [
            h('span', { style: { color: '#7f8c8d' } }, label),
            h('span', { style: { fontWeight: '500' } }, value),
        ]);
    }

    function roleBadge(role) {
        const color = role === 'admin' ? '#e74c3c'
            : role === 'manager' ? '#f39c12'
                : '#3498db';
        return h('span', { style: { color, fontWeight: 'bold' } }, role || '-');
    }

    function tenantStatusBadge(status) {
        const color = status === 'active' ? '#2ecc71' : '#e74c3c';
        return h('span', { style: { color, fontWeight: 'bold' } }, status || '-');
    }
}