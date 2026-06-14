// scripts/components/navigation.js — 侧边导航
//
// 用于所有受保护页面（home / devices / device-detail / dashboard）,
// 不在 /login 公开页用。
//
// 行为：
//   - 链接以 hash 形式写出,onclick 阻止默认跳转并调 go(path) 走 router
//   - 当前页 li 加 .active 类,CSS 蓝底高亮
//   - 鼠标悬停 li → CSS 灰底 + 微右移

import { h } from '../utils.js';
import { go } from '../router.js';

const ITEMS = [
    { path: '/', icon: '🏠', label: '首页' },
    { path: '/users', icon: '👥', label: '用户管理' },
    { path: '/devices', icon: '📡', label: '设备列表' },
    { path: '/dashboard', icon: '📊', label: '仪表盘' },
];

/** 当前 hash 匹配的导航项（最长前缀匹配） */
function activePath() {
    const cur = location.hash.slice(1) || '/';
    const match = ITEMS
        .filter(it => cur === it.path || cur.startsWith(it.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0];
    return match?.path || null;
}

export function navigation() {
    const active = activePath();

    return h('nav', { class: 'nav' }, [
        h('ul', null,
            ITEMS.map(item => {
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
        ),
    ]);
}
