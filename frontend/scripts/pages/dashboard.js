// scripts/pages/dashboard.js — 仪表盘
//
// 修 bug 关键：
//   之前字段名对不上后端（如 s.total ?? s.deviceCount ?? ... 全 miss → 一直显示 '-'）
//   现在严格对齐 backend/DashboardService.js 的返回字段
//
// 数据流：
//   GET /api/dashboard/summary   →  { totalDevices, onlineDevices, offlineDevices, todayAlerts, unacknowledgedAlerts, lastUpdated }
//   GET /api/dashboard/trends    →  { deviceId, metric, interval, dataPoints: [{timestamp, value}] }
//   WS  'alert'                   →  setState({ alertCount })  本地即时 +1（下次 summary 拉取时被覆盖）

import { h, formatDate } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { on as onWs } from '../ws.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';
import { renderChart } from '../components/data-chart.js';

export function render(root) {
    const header = mountHeader();
    const nav = navigation();

    // 局部 DOM 引用（repaint 函数要闭包访问）
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
            h('h3', { style: { marginTop: '1rem' } }, '设备数据趋势'),
            h('p', { id: 'trend-hint', style: { color: '#7f8c8d', fontSize: '0.85rem' } }, '加载中...'),
            trendContainer,
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    // ════════════════════════════════════════════════════════
    // 全部作为 render 内部函数
    // ════════════════════════════════════════════════════════

    async function loadSummary() {
        try {
            const data = await api.getDashboardSummary();
            // 后端: { totalDevices, onlineDevices, offlineDevices, todayAlerts, unacknowledgedAlerts, lastUpdated }
            setState({ summary: data || {} });
        } catch (e) {
            console.error('[dashboard] summary failed', e);
            setState({ summary: { error: e.message } });
        }
    }

    async function loadTrend() {
        const devices = getState().devices;
        if (!devices || devices.length === 0) {
            const hint = main.querySelector('#trend-hint');
            if (hint) hint.textContent = '暂无设备,无法显示趋势';
            trendContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '请先在设备管理创建设备')
            );
            return;
        }
        const firstDevice = devices[0];
        const endTime = new Date().toISOString();
        const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        try {
            const data = await api.getDashboardTrends(firstDevice.id, 'value', startTime, endTime, '1h');
            // 后端: { deviceId, metric, interval, dataPoints: [{ timestamp, value }] }
            const points = data?.dataPoints || [];
            const hint = main.querySelector('#trend-hint');
            if (hint) {
                hint.textContent = `设备 "${firstDevice.name}" 最近 7 天 · 共 ${points.length} 个数据点`;
            }

            if (points.length === 0) {
                trendContainer.replaceChildren(
                    h('p', { style: { color: '#7f8c8d' } }, '该设备最近 7 天无上报数据')
                );
                return;
            }
            trendContainer.replaceChildren(
                h('canvas', { id: 'trend-canvas', style: { maxHeight: '300px' } })
            );
            const canvas = trendContainer.querySelector('#trend-canvas');
            renderChart(canvas, {
                labels: points.map(d => formatDate(d.timestamp)),
                values: points.map(d => Number(d.value ?? 0)),
            }, { label: `${firstDevice.name} / value`, color: '#9b59b6' });
        } catch (e) {
            console.error('[dashboard] trend failed', e);
            trendContainer.replaceChildren(
                h('p', { style: { color: '#e74c3c' } }, '趋势加载失败: ' + e.message)
            );
        }
    }

    function repaintSummary() {
        // ★ 严格用后端字段名 ★
        const s = getState().summary || {};
        if (s.error) {
            summaryContainer.replaceChildren(
                h('p', { style: { color: '#e74c3c' } }, '加载失败: ' + s.error)
            );
            return;
        }
        summaryContainer.replaceChildren(
            statCard('设备总数', s.totalDevices ?? 0, '#3498db'),
            statCard('在线', s.onlineDevices ?? 0, '#2ecc71'),
            statCard('离线', s.offlineDevices ?? 0, '#95a5a6'),
            statCard('未确认告警', s.unacknowledgedAlerts ?? 0, '#e74c3c'),
        );
    }

    function repaintAlert() {
        // WS 推 alert 时,只更新"未确认告警"卡（保留原 summary 其他字段）
        const summaryEl = summaryContainer.querySelector('[data-card="alert"]');
        if (summaryEl) {
            const n = getState().alertCount ?? 0;
            summaryEl.querySelector('.value').textContent = String(n);
            summaryEl.querySelector('.value').style.color = '#e74c3c';
        }
    }

    function statCard(label, value, color) {
        return h('div', {
            'data-card': label,
            style: {
                background: 'white', padding: '1.5rem',
                borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                textAlign: 'center',
            },
        }, [
            h('div', { style: { color: '#7f8c8d', fontSize: '0.9rem', marginBottom: '0.5rem' } }, label),
            h('div', { class: 'value', style: { color, fontSize: '2rem', fontWeight: 'bold' } }, String(value)),
        ]);
    }

    // ════════════════════════════════════════════════════════
    // 启动
    // ════════════════════════════════════════════════════════

    repaintSummary();
    loadSummary();
    loadTrend();

    // WS 推 alert:本地 +1,触发卡片重画
    const offWs = onWs('alert', () => {
        setState({ alertCount: (getState().alertCount || 0) + 1 });
    });

    // subscribe:summary 变化时重画卡片
    const unsubscribe = subscribe((state) => {
        if (state.summary !== undefined) repaintSummary();
        if (state.alertCount !== undefined) repaintAlert();
    });

    return () => {
        unsubscribe();
        offWs();
        header.cleanup();
    };
}