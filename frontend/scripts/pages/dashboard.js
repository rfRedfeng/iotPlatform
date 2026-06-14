// scripts/pages/dashboard.js — 仪表盘

import { h, formatShort } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { on as onWs } from '../ws.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';
import { renderChart } from '../components/data-chart.js';

export function render(root) {
    const header = mountHeader();
    const nav = navigation();

    // 当前趋势图选中的设备（null = 默认第一台）
    let selectedTrendDeviceId = null;
    // 趋势时间范围
    let trendRange = '1h';
    const RANGE_OPTS = [
        { value: '15m', label: '15 分钟', interval: '1m', ms: 15 * 60 * 1000 },
        { value: '1h', label: '1 小时', interval: '1m', ms: 60 * 60 * 1000 },
        { value: '6h', label: '6 小时', interval: '5m', ms: 6 * 60 * 60 * 1000 },
        { value: '24h', label: '24 小时', interval: '15m', ms: 24 * 60 * 60 * 1000 },
        { value: '7d', label: '7 天', interval: '1h', ms: 7 * 24 * 60 * 60 * 1000 },
    ];

    const areaSelector = h('select', {
        id: 'area-selector',
        style: { padding: '0.4rem 0.6rem', marginRight: '0.5rem' },
    });
    const summaryBar = h('div', {
        id: 'dashboard-summary-bar',
        style: { color: '#7f8c8d', fontSize: '0.9rem', marginBottom: '0.75rem' },
    }, '加载中...');
    const deviceCards = h('div', {
        id: 'device-cards',
        style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem', marginBottom: '1.5rem',
        },
    });
    const trendContainer = h('div', {
        id: 'dashboard-trend',
        style: { display: 'flex', flexWrap: 'wrap', gap: '1rem' },
    });

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' } }, [
                h('h2', { style: { margin: '0' } }, '仪表盘'),
                h('span', { style: { color: '#7f8c8d', fontSize: '0.9rem', marginLeft: '1rem' } }, '区域:'),
                areaSelector,
            ]),
            summaryBar,
            h('h3', { style: { marginTop: '1rem' } }, '设备列表'),
            h('p', { style: { color: '#95a5a6', fontSize: '0.8rem', marginBottom: '0.5rem' } },
                '点击设备卡片,下方趋势图将显示该设备数据'),
            deviceCards,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' } }, [
                h('h3', { style: { margin: '0' } }, '设备数据趋势'),
                h('select', {
                    id: 'trend-range',
                    style: { padding: '0.3rem 0.5rem', fontSize: '0.85rem' },
                    onchange: function () { trendRange = this.value; loadTrend(); },
                }, RANGE_OPTS.map(o => h('option', { value: o.value, selected: o.value === trendRange }, o.label))),
            ]),
            h('p', { id: 'trend-hint', style: { color: '#7f8c8d', fontSize: '0.85rem' } }, '加载中...'),
            trendContainer,
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    areaSelector.addEventListener('change', () => {
        const newAreaId = areaSelector.value ? Number(areaSelector.value) : null;
        setState({ selectedAreaId: newAreaId });
        selectedTrendDeviceId = null;  // 切区域重置选中
        loadSummary();
        loadDevices();
        loadTrend();
    });

    repaintAreaSelector();

    // ════════════════════════════════════════════════════════

    function repaintAreaSelector() {
        const sel = getState().selectedAreaId;
        const areas = getState().areas || [];
        areaSelector.replaceChildren(
            h('option', { value: '', selected: sel == null }, '全部区域'),
            ...areas.map(a => h('option', {
                value: String(a.id),
                selected: a.id === sel,
            }, `${a.name} [${a.code}]`)),
        );
    }

    async function loadAreas() {
        try {
            const data = await api.listAreas(false);
            const list = Array.isArray(data) ? data : [];
            setState({ areas: list });
        } catch (e) {
            console.warn('[dashboard] load areas failed', e);
        }
    }

    async function loadSummary() {
        try {
            const areaId = getState().selectedAreaId;
            const data = await api.getDashboardSummary(areaId);
            setState({ summary: data || {} });
        } catch (e) {
            console.error('[dashboard] summary failed', e);
            setState({ summary: { error: e.message } });
        }
    }

    async function loadDevices() {
        try {
            const data = await api.listDevices();
            const all = Array.isArray(data) ? data : (data?.list || []);
            const areaId = getState().selectedAreaId;
            const filtered = areaId ? all.filter(d => d.areaId === areaId) : all;
            // 选中的设备不在新列表里？重置
            if (selectedTrendDeviceId && !filtered.find(d => d.id === selectedTrendDeviceId)) {
                selectedTrendDeviceId = null;
            }
            setState({ devices: filtered, devicesTotal: all.length });
        } catch (e) {
            console.error('[dashboard] load devices failed', e);
        }
    }

    // 为不同指标配不同颜色
    const METRIC_COLORS = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c',
        '#e67e22', '#2980b9', '#27ae60', '#8e44ad',
    ];

    async function loadTrend() {
        const devices = getState().devices || [];
        const hint = main.querySelector('#trend-hint');

        if (devices.length === 0) {
            if (hint) hint.textContent = getState().selectedAreaId
                ? '该区域暂无设备,无法显示趋势' : '请先创建设备';
            trendContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '暂无设备数据')
            );
            return;
        }

        const targetDevice = selectedTrendDeviceId
            ? devices.find(d => d.id === selectedTrendDeviceId)
            : devices[0];
        if (!targetDevice) { selectedTrendDeviceId = null; loadTrend(); return; }
        selectedTrendDeviceId = targetDevice.id;

        const opt = RANGE_OPTS.find(o => o.value === trendRange) || RANGE_OPTS[1];
        const endTime = new Date().toISOString();
        const startTime = new Date(Date.now() - opt.ms).toISOString();

        // 探测该设备所有可用指标
        let metrics = [];
        try {
            const latest = await api.getDeviceData(targetDevice.id);
            if (latest && Array.isArray(latest) && latest.length > 0) {
                const m = typeof latest[0].metrics === 'string' ? JSON.parse(latest[0].metrics) : latest[0].metrics;
                if (m && typeof m === 'object') {
                    metrics = Object.keys(m).filter(k => typeof m[k] === 'number');
                }
            }
        } catch { /* fallback */ }
        if (metrics.length === 0) metrics = ['temperature'];

        // 为每个指标独立拉趋势 + 渲染一张图
        trendContainer.replaceChildren(
            h('p', { style: { width: '100%', color: '#7f8c8d', fontSize: '0.85rem', margin: '0' } },
                `已选: ${targetDevice.name} · 最近 ${opt.label}`)
        );

        const charts = [];
        for (let i = 0; i < metrics.length; i++) {
            const metric = metrics[i];
            const wrapper = h('div', {
                style: {
                    flex: '1 1 450px', minWidth: '320px', maxWidth: '650px',
                    background: 'white', borderRadius: '8px', padding: '0.75rem',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                },
            }, [
                h('div', { style: { fontSize: '0.85rem', fontWeight: 'bold', color: METRIC_COLORS[i % METRIC_COLORS.length], marginBottom: '0.4rem' } },
                    metric),
                h('canvas', { style: { maxHeight: '220px' } }),
                h('div', { style: { fontSize: '0.75rem', color: '#95a5a6', marginTop: '0.25rem', textAlign: 'center' } },
                    '加载中...'),
            ]);
            trendContainer.appendChild(wrapper);
            charts.push({ wrapper, metric, idx: i });
        }

        // 并行拉取所有指标趋势
        await Promise.all(charts.map(async (c) => {
            try {
                const data = await api.getDashboardTrends(targetDevice.id, c.metric, startTime, endTime, opt.interval);
                const points = data?.dataPoints || [];
                const statusEl = c.wrapper.querySelector('div:last-child');
                if (points.length === 0) {
                    if (statusEl) statusEl.textContent = '无数据';
                    return;
                }
                if (statusEl) statusEl.textContent = `${points.length} 个数据点`;
                const canvas = c.wrapper.querySelector('canvas');
                const color = METRIC_COLORS[c.idx % METRIC_COLORS.length];
                renderChart(canvas, {
                    labels: points.map(d => formatShort(d.timestamp)),
                    values: points.map(d => Number(d.value ?? 0)),
                }, { label: c.metric, color, tension: 0.4, fill: true });
            } catch (e) {
                const statusEl = c.wrapper.querySelector('div:last-child');
                if (statusEl) { statusEl.textContent = '加载失败'; statusEl.style.color = '#e74c3c'; }
                console.error('[dashboard] trend failed for', c.metric, e);
            }
        }));

        if (hint) hint.textContent = '';
    }

    function repaintSummary() {
        const s = getState().summary || {};
        const sel = getState().selectedAreaId;
        const area = (getState().areas || []).find(a => a.id === sel);
        const areaName = area ? area.name : '全部区域';

        if (s.error) {
            summaryBar.textContent = '加载失败: ' + s.error;
            summaryBar.style.color = '#e74c3c';
        } else {
            summaryBar.style.color = '#7f8c8d';
            summaryBar.textContent = `当前区域: ${areaName} · 设备 ${s.totalDevices ?? 0} 台 · 在线 ${s.onlineDevices ?? 0} · 离线 ${s.offlineDevices ?? 0} · 未确认告警 ${s.unacknowledgedAlerts ?? 0}`;
        }
    }

    function repaintDeviceCards() {
        const devices = getState().devices || [];
        if (devices.length === 0) {
            deviceCards.replaceChildren(
                h('p', { style: { color: '#7f8c8d', gridColumn: '1 / -1' } },
                    getState().selectedAreaId
                        ? '该区域暂无设备,先去设备管理创建或修改设备区域'
                        : '请先在设备管理创建设备')
            );
            return;
        }
        deviceCards.replaceChildren(...devices.map(deviceCard));
    }

    function deviceCard(d) {
        const area = (getState().areas || []).find(a => a.id === d.areaId);
        const isSelected = d.id === selectedTrendDeviceId;
        return h('div', {
            'data-device-id': String(d.id),
            style: {
                background: 'white', padding: '1rem', borderRadius: '8px',
                boxShadow: isSelected
                    ? '0 0 0 2px #3498db, 0 4px 12px rgba(52,152,219,0.3)'
                    : '0 2px 8px rgba(0,0,0,0.1)',
                borderLeft: '4px solid ' + statusColor(d.status),
                cursor: 'pointer',
                transition: 'transform 0.1s, box-shadow 0.1s',
            },
            onclick: () => {
                selectedTrendDeviceId = d.id;
                loadTrend();
                repaintDeviceCards();  // 重画卡片让选中态生效
            },
            onmouseenter: function () {
                if (!isSelected) {
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }
            },
            onmouseleave: function () {
                if (!isSelected) {
                    this.style.transform = '';
                    this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }
            },
        }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' } }, [
                h('strong', { style: { fontSize: '0.95rem' } }, d.name),
                h('span', { style: { color: statusColor(d.status), fontSize: '0.85rem', fontWeight: 'bold' } },
                    (isSelected ? '📊 ' : '') + statusLabel(d.status)),
            ]),
            h('div', { style: { color: '#7f8c8d', fontSize: '0.8rem', lineHeight: '1.6' } }, [
                h('div', {}, `区域: ${area ? area.name : '-'}`),
                h('div', {}, `协议: ${d.protocol || '-'}`),
                h('div', {}, `ID: ${d.id}`),
                h('div', {}, `最后活跃: ${d.lastSeen ? formatShort(d.lastSeen) : '从未'}`),
            ]),
        ]);
    }

    function statusColor(s) {
        if (s === 'online') return '#2ecc71';
        if (s === 'offline') return '#95a5a6';
        return '#e74c3c';
    }

    function statusLabel(s) {
        if (s === 'online') return '● 在线';
        if (s === 'offline') return '● 离线';
        return '● 故障';
    }

    // ════════════════════════════════════════════════════════
    // 启动
    // ════════════════════════════════════════════════════════

    repaintSummary();
    repaintDeviceCards();
    loadSummary();
    loadDevices();
    loadTrend();
    loadAreas().then(repaintAreaSelector);

    const offWs = onWs('alert', () => {
        setState({ alertCount: (getState().alertCount || 0) + 1 });
        loadSummary();
    });

    const offWsDevice = onWs('task_result', (msg) => {
        if (msg.status === 'success' && msg.taskType && msg.taskType.startsWith('device.')) {
            console.log('[dashboard] device task_result:', msg.taskType, '- reloading');
            loadDevices();
        }
    });

    let lastTenantId = getState().selectedTenantId;
    const unsubscribe = subscribe((state) => {
        if (state.summary !== undefined) repaintSummary();
        if (state.devices !== undefined) { repaintDeviceCards(); loadTrend(); }
        if (state.areas !== undefined) repaintAreaSelector();
        if (state.selectedTenantId !== lastTenantId) {
            lastTenantId = state.selectedTenantId;
            loadSummary();
            loadDevices();
            loadTrend();
            loadAreas().then(repaintAreaSelector);
        }
    });

    return () => {
        unsubscribe();
        offWs();
        offWsDevice();
        header.cleanup();
    };
}
