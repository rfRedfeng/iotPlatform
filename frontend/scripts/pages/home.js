// scripts/pages/home.js — 首页

import { h } from '../utils.js';
import { mountHeader } from '../components/header.js';

export function render(root) {
    const header = mountHeader();

    root.appendChild(header.element);
    root.appendChild(
        h('main', { class: 'main' }, [
            h('div', { id: 'page-content' }, [
                h('h2', {}, '首页 (I8)'),
                h('p', {}, '已登录。访问：'),
                h('p', {}, [
                    h('a', { href: '#/dashboard' }, '仪表盘 (I8)'),
                    ' | ',
                    h('a', { href: '#/devices' }, '设备列表 (I5-I7)'),
                ]),
                h('p', { style: { marginTop: '1.5rem', color: '#7f8c8d', fontSize: '0.9rem', lineHeight: '1.5' } }, [
                    'Phase 5 已完成 I0–I8 全部迭代。',
                    h('br'),
                    '① Dashboard: 4 张统计卡 + 趋势图 + WS 实时告警',
                    h('br'),
                    '② Devices 列表: 搜索/筛选/创建/删除/WS 自动刷新',
                    h('br'),
                    '③ Device 详情: 基本信息 + 实时折线图（WS 追加）',
                    h('br'),
                    '④ Login 鉴权 + Token 401 自动 refresh',
                ]),
            ]),
        ]),
    );

    return header.cleanup;
}
