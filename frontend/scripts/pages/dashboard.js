// scripts/pages/dashboard.js — 仪表盘
//
// 功能：
//   - 4 个统计卡：设备总数 / 在线 / 离线 / 告警数
//   - 设备数趋势折线图
//   - WS 推 alert 时告警数 +1
//   - 路由：/dashboard

import { h, formatDate } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { on as onWs } from '../ws.js';
import { mountHeader } from '../components/header.js';
import { renderChart } from '../components/data-chart.js';

export function render(root) {
    const header = mountHeader();

    const summaryContainer = h('div', {
        id: 'dashboard-summary',
        style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem', marginBottom: '1.5rem',
        },
    });

    const trendContainer = h('div', { id: 'dashboard-trend', style: { height: '300px', position: 'relative' } });

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('h2', {}, '仪表盘'),
            summaryContainer,
            h('h3', { style: { marginTop: '1rem' } }, '设备数趋势'),
            h('p', { style: { color: '#7f8c8d', fontSize: '0.85rem' } }, '最近 7 天设备总数变化'),
            trendContainer,
            h('p', { style: { marginTop: '1.5rem', color: '#7f8c8d', fontSize: '0.85rem' } }, [
                'I8 验收：',
                h('br'),
                '① 4 张卡显示设备统计',
                h('br'),
                '② 趋势图渲染',
                h('br'),
                '③ WS 推 alert 时告警卡 +1',
            ]),
        ]),
    ]);

    root.appendChild(header.element);
    root.appendChild(main);

    loadSummary();
    loadTrend();

    // WS 监听 alert
    const offWs = onWs('alert', (msg) => {
        setState({ alertCount: (getState().alertCount || 0) + 1 });
    });

    const unsubscribe = subscribe(() => repaint());

    return () => {
        unsubscribe();
        offWs();
        header.cleanup();
    };

    // ════════════════════════════════════════════════════════

    async function loadSummary() {
        try {
            const data = await api.getDashboardSummary();
            setState({ summary: data || {} });
        } catch (e) {
            console.error('[dashboard] summary failed', e);
            // 不致命,卡片会显示 "-"
        }
    }

    async function loadTrend() {
        // 后端要 deviceId, metric, startTime, endTime; 用第一台设备作样本
        const devices = getState().devices;
        if (!devices || devices.length === 0) {
            trendContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '暂无设备,无法显示趋势')
            );
            return;
        }
        const firstDevice = devices[0];
        const endTime = new Date().toISOString();
        const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        try {
            const data = await api.getDashboardTrends(firstDevice.id, 'value', startTime, endTime, '1h');
            const list = Array.isArray(data) ? data : (data?.list || data?.data || []);
            if (list.length === 0) {
                trendContainer.replaceChildren(
                    h('p', { style: { color: '#7f8c8d' } }, `设备 "${firstDevice.name}" 最近 7 天无数据`)
                );
                return;
            }
            trendContainer.replaceChildren(
                h('canvas', { id: 'trend-canvas', style: { maxHeight: '300px' } })
            );
            const canvas = trendContainer.querySelector('#trend-canvas');
            renderChart(canvas, {
                labels: list.map(d => d.timestamp ? formatDate(d.timestamp) : (d.ts || d.date || '-')),
                values: list.map(d => Number(d.value ?? 0)),
            }, { label: `${firstDevice.name} / value`, color: '#9b59b6' });
        } catch (e) {
            console.error('[dashboard] trend failed', e);
            trendContainer.replaceChildren(
                h('p', { style: { color: '#e74c3c' } }, '趋势加载失败: ' + e.message)
            );
        }
    }

    function repaint() {
        const s = getState().summary || {};
        const total = s.total ?? s.deviceCount ?? s.deviceTotal ?? '-';
        const online = s.online ?? s.onlineCount ?? s.onlineTotal ?? '-';
        const offline = s.offline ?? s.offlineCount ?? s.offlineTotal ?? '-';
        const alert = getState().alertCount ?? 0;
        summaryContainer.replaceChildren(
            statCard('设备总数', total, '#3498db'),
            statCard('在线', online, '#2ecc71'),
            statCard('离线', offline, '#95a5a6'),
            statCard('告警数', alert, '#e74c3c'),
        );
    }

    function statCard(label, value, color) {
        return h('div', {
            style: {
                background: 'white', padding: '1.5rem',
                borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                textAlign: 'center',
            },
        }, [
            h('div', { style: { color: '#7f8c8d', fontSize: '0.9rem', marginBottom: '0.5rem' } }, label),
            h('div', { style: { color, fontSize: '2rem', fontWeight: 'bold' } }, String(value)),
        ]);
    }
}
