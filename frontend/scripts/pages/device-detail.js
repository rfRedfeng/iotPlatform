// scripts/pages/device-detail.js — 设备详情 

import { h, formatDate } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { on as onWs } from '../ws.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';
import { renderChart, appendPoint, destroyChart } from '../components/data-chart.js';

export function render(root, params) {
    const deviceId = params.id;
    const header = mountHeader();
    const nav = navigation();

    const infoContainer = h('div', { id: 'device-info' });
    const chartWrapper = h('div', { id: 'device-chart-wrapper', style: { height: '300px', position: 'relative', marginTop: '1rem' } });
    const chartContainer = h('div', { id: 'device-chart' }, [
        h('p', { style: { color: '#7f8c8d' } }, '加载中...'),
    ]);

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' } }, [
                h('button', { id: 'back-btn', style: { padding: '0.4rem 0.8rem' } }, '← 返回'),
                h('h2', { style: { margin: '0' } }, '设备详情'),
            ]),
            infoContainer,
            h('h3', { style: { marginTop: '1.5rem' } }, '实时数据'),
            h('p', { style: { color: '#7f8c8d', fontSize: '0.85rem' } }, '历史数据 + WS 推送的新点会追加到图上'),
            chartContainer,
            chartWrapper,
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    main.querySelector('#back-btn').addEventListener('click', () => go('/devices'));

    // ────────── WS 监听 device_data ──────────
    const offWs = onWs('device_data', (msg) => {
        if (String(msg.deviceId) !== String(deviceId)) return;
        const canvas = main.querySelector('#live-canvas');
        if (!canvas) return;
        const value = msg.metrics?.value ?? msg.metrics?.temperature ?? msg.value ?? 0;
        appendPoint(canvas, {
            label: new Date(msg.timestamp || Date.now()).toLocaleTimeString(),
            value,
        });
    });

    // 设备状态变化
    const offWsStatus = onWs('device_status', (msg) => {
        if (String(msg.deviceId) !== String(deviceId)) return;
        const s = getState().selectedDevice;
        if (s) {
            setState({ selectedDevice: { ...s, status: msg.status, lastSeen: msg.timestamp || msg.lastSeen } });
        }
    });

    const unsubscribe = subscribe(() => repaintInfo());

    loadDevice();
    loadHistory();

    return () => {
        unsubscribe();
        offWs();
        offWsStatus();
        const canvas = main.querySelector('#live-canvas');
        if (canvas) destroyChart(canvas);
        header.cleanup();
    };

    // ════════════════════════════════════════════════════════

    async function loadDevice() {
        try {
            const device = await api.getDevice(deviceId);
            setState({ selectedDevice: device });
        } catch (e) {
            infoContainer.replaceChildren(
                h('p', { style: { color: '#e74c3c' } }, '加载设备信息失败: ' + e.message)
            );
        }
    }

    async function loadHistory() {
        try {
            const data = await api.getDeviceData(deviceId);
            const list = Array.isArray(data) ? data : (data?.list || data?.data || []);
            // canvas 放到 chartContainer 里（不在 wrapper 里）
            chartContainer.replaceChildren(
                h('canvas', { id: 'live-canvas', style: { maxHeight: '300px' } })
            );
            const canvas = chartContainer.querySelector('#live-canvas');
            renderChart(canvas, {
                labels: list.map(d => d.timestamp ? formatDate(d.timestamp) : (d.ts || '-')),
                values: list.map(d => Number(d.value ?? d.metric_value ?? 0)),
            }, { label: '数值', color: '#3498db' });
        } catch (e) {
            console.error('[device-detail] history failed', e);
            chartContainer.replaceChildren(
                h('p', { style: { color: '#e74c3c' } }, '历史数据加载失败: ' + e.message)
            );
        }
    }

    function repaintInfo() {
        const d = getState().selectedDevice;
        if (!d) return;
        infoContainer.replaceChildren(
            infoRow('ID', String(d.id ?? '-')),
            infoRow('名称', d.name ?? '-'),
            infoRow('状态', statusBadge(d.status)),
            infoRow('协议', d.protocol ?? '-'),
            infoRow('设备类型', d.deviceType ?? '-'),
            infoRow('区域ID', String(d.areaId ?? '-')),
            infoRow('最后活跃', d.lastSeen ? formatDate(d.lastSeen) : '-'),
        );
    }

    function infoRow(label, value) {
        return h('div', {
            style: {
                padding: '0.5rem 0', borderBottom: '1px solid #ecf0f1',
                display: 'flex', justifyContent: 'space-between',
            },
        }, [
            h('span', { style: { color: '#7f8c8d' } }, label),
            h('span', { style: { fontWeight: 'bold' } }, value),
        ]);
    }

    function statusBadge(status) {
        const color = status === 'online' ? '#2ecc71'
            : status === 'offline' ? '#95a5a6'
                : '#e74c3c';
        return h('span', { style: { color, fontWeight: 'bold' } }, status || '-');
    }
}
