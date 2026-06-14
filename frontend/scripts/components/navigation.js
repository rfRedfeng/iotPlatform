// scripts/components/navigation.js — 侧边导航

import { h } from '../utils.js';
import { getState, subscribe } from '../state.js';
import { go } from '../router.js';

const ALL_ITEMS = [
    { path: '/',           icon: '🏠', label: '首页' },
    { path: '/devices',   icon: '📡', label: '设备列表' },
    { path: '/areas',     icon: '🏢', label: '区域管理' },
    { path: '/dashboard', icon: '📊', label: '仪表盘' },
    { path: '/users',     icon: '👥', label: '用户管理' },
    { path: '/tenants',   icon: '🏛', label: '租户管理', adminOnly: true },
];

function visibleItems() {
    const role = (getState().user || {}).role;
    return ALL_ITEMS.filter(item => !item.adminOnly || role === 'admin');
}

function activePath() {
    const cur = location.hash.slice(1) || '/';
    const match = visibleItems()
        .filter(it => cur === it.path || cur.startsWith(it.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0];
    return match?.path || null;
}

export function navigation() {
    const active = activePath();
    const items = visibleItems();

    let currentUl = buildUl(items, active);

    const nav = h('nav', { class: 'nav' }, [currentUl]);

    // 订阅 state 变化：user 加载后重新渲染导航项
    const off = subscribe(() => {
        const newActive = activePath();
        const newItems = visibleItems();
        const newUl = buildUl(newItems, newActive);
        currentUl.replaceWith(newUl);
        currentUl = newUl;
    });

    nav._cleanup = off;
    return nav;
}

function buildUl(items, active) {
    return h('ul', null,
        items.map(item => {
            const isActive = item.path === active;
            return h('li', isActive ? { class: 'active' } : null, [
                h('a', {
                    href: '#' + item.path,
                    onclick: (e) => {
                        e.preventDefault();
                        go(item.path);
                    },
                }, [
                    h('span', { class: 'icon' }, item.icon),
                    h('span', { class: 'label' }, item.label),
                ]),
            ]);
        })
    );
}