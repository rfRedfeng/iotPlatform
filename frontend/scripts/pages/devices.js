// scripts/pages/devices.js -- 设备列表页
//

import { h, formatDate } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { on as onWs } from '../ws.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';
import { openModal } from '../components/modal.js';

export function render(root) {
    const header = mountHeader();
    const nav = navigation();

    const tableContainer = h('div', { id: 'devices-table' });

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' } }, [
                h('h2', { style: { margin: '0' } }, '设备列表'),
                h('div', { style: { display: 'flex', gap: '0.5rem' } }, [
                    h('button', { id: 'create-btn', style: { padding: '0.4rem 0.8rem' } }, '＋ 新建'),
                    h('button', { id: 'refresh-btn', style: { padding: '0.4rem 0.8rem' } }, '🔄 刷新'),
                ]),
            ]),
            h('div', { style: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' } }, [
                h('input', {
                    id: 'search-input',
                    type: 'text',
                    placeholder: '按名称搜索',
                    style: { flex: '1', minWidth: '200px', padding: '0.5rem' },
                }),
                h('select', { id: 'status-filter', style: { padding: '0.5rem' } }, [
                    h('option', { value: '' }, '全部状态'),
                    h('option', { value: 'online' }, '在线'),
                    h('option', { value: 'offline' }, '离线'),
                    h('option', { value: 'error' }, '故障'),
                ]),
            ]),
            tableContainer,
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    // ────────── 事件 ──────────
    main.querySelector('#refresh-btn').addEventListener('click', () => loadDevices());
    main.querySelector('#create-btn').addEventListener('click', openCreateModal);

    const searchInput = main.querySelector('#search-input');
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => repaintTable(), 200);
    });

    const statusFilter = main.querySelector('#status-filter');
    statusFilter.addEventListener('change', () => repaintTable());

    // ────────── WS 监听 task_result ──────────
    // 后端异步队列处理完 device.create 后会推 { type: 'task_result', status: 'success', data: {...} }
    const offWs = onWs('task_result', (msg) => {
        if (msg.status === 'success' && msg.data && (
            msg.data.type === 'device.create' ||
            msg.data.type === 'device.update' ||
            msg.data.type === 'device.delete'
        )) {
            console.log('[devices] task_result received, reloading');
            loadDevices();
        }
    });

    const unsubscribe = subscribe(() => repaintTable());

    loadDevices();

    return () => {
        unsubscribe();
        offWs();
        header.cleanup();
    };

    // ════════════════════════════════════════════════════════
    // 函数区域
    // ════════════════════════════════════════════════════════

    async function loadDevices() {
        setState({ devicesLoading: true, devicesError: null });
        try {
            const data = await api.listDevices();
            const list = Array.isArray(data) ? data : (data?.list || data?.devices || []);
            setState({ devices: list, devicesLoading: false });
        } catch (e) {
            console.error('[devices] load failed', e);
            setState({ devicesLoading: false, devicesError: e.message || '加载失败' });
        }
    }

    function repaintTable() {
        tableContainer.replaceChildren(buildTable());
    }

    function buildTable() {
        if (getState().devicesLoading) {
            return h('p', { style: { color: '#7f8c8d' } }, '加载中...');
        }
        const err = getState().devicesError;
        if (err) {
            return h('p', { style: { color: '#e74c3c' } }, '错误: ' + err);
        }
        const filtered = applyFilters(getState().devices);
        if (filtered.length === 0) {
            return h('p', { style: { color: '#7f8c8d' } }, '暂无设备');
        }
        return h('table', { style: tableStyle }, [
            h('thead', {}, h('tr', {}, [
                th('ID'), th('名称'), th('状态'), th('区域ID'),
                th('协议'), th('最后活跃'), th('操作'),
            ])),
            h('tbody', {}, filtered.map(deviceRow)),
        ]);
    }

    function applyFilters(devices) {
        const search = (main.querySelector('#search-input')?.value || '').toLowerCase().trim();
        const status = main.querySelector('#status-filter')?.value || '';
        return devices.filter(d => {
            if (search && !(d.name || '').toLowerCase().includes(search)) return false;
            if (status && d.status !== status) return false;
            return true;
        });
    }

    function deviceRow(d) {
        return h('tr', {}, [
            td(String(d.id ?? '-')),
            td(d.name ?? '-'),
            td(statusBadge(d.status)),
            td(String(d.areaId ?? '-')),
            td(d.protocol ?? '-'),
            td(d.lastSeen ? formatDate(d.lastSeen) : '-'),
            td(h('div', { style: { display: 'flex', gap: '0.25rem' } }, [
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem' },
                    onclick: () => go('/devices/' + d.id),
                }, '详情'),
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem', background: '#e74c3c' },
                    onclick: () => confirmDelete(d),
                }, '删除'),
            ])),
        ]);
    }

    function confirmDelete(d) {
        const m = openModal({
            title: '删除设备',
            content: (body, close) => {
                body.appendChild(h('p', {}, `确定要删除设备 "${d.name}" 吗？此操作不可撤销。`));
                body.appendChild(h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' } }, [
                    h('button', { style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                    h('button', {
                        style: { background: '#e74c3c' }, onclick: async () => {
                            try {
                                await api.deleteDevice(d.id);
                                console.log('[devices] delete enqueued');
                                close();
                            } catch (e) {
                                alert('删除失败: ' + e.message);
                            }
                        }
                    }, '确认删除'),
                ]));
            },
        });
    }

    function openCreateModal() {
        openModal({
            title: '创建设备',
            content: (body, close) => {
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('label', {}, [
                        '设备名称 ',
                        h('input', { name: 'name', required: true, style: { width: '100%', padding: '0.5rem' } }),
                    ]),
                    h('label', {}, [
                        '协议 ',
                        h('select', { name: 'protocol', required: true, style: { width: '100%', padding: '0.5rem' } }, [
                            h('option', { value: 'mqtt' }, 'MQTT'),
                            h('option', { value: 'tcp' }, 'TCP'),
                            h('option', { value: 'udp' }, 'UDP'),
                            h('option', { value: 'coap' }, 'CoAP'),
                        ]),
                    ]),
                    h('label', {}, [
                        '区域ID（可选） ',
                        h('input', { name: 'areaId', type: 'number', style: { width: '100%', padding: '0.5rem' } }),
                    ]),
                    h('label', {}, [
                        '设备类型（可选） ',
                        h('input', { name: 'deviceType', style: { width: '100%', padding: '0.5rem' } }),
                    ]),
                    h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' } }, [
                        h('button', { type: 'button', style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                        h('button', { type: 'submit', style: { background: '#2ecc71' } }, '提交'),
                    ]),
                ]);
                body.appendChild(form);

                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fd = new FormData(form);
                    const payload = {
                        name: String(fd.get('name') || '').trim(),
                        protocol: String(fd.get('protocol') || ''),
                    };
                    const areaId = fd.get('areaId');
                    if (areaId) payload.areaId = Number(areaId);
                    const deviceType = fd.get('deviceType');
                    if (deviceType) payload.deviceType = String(deviceType);

                    if (!payload.name || !payload.protocol) {
                        alert('名称和协议必填');
                        return;
                    }

                    const submitBtn = form.querySelector('button[type="submit"]');
                    submitBtn.disabled = true;
                    submitBtn.textContent = '提交中...';

                    try {
                        await api.createDevice(payload);
                        console.log('[devices] create enqueued, waiting for ws task_result');
                        close();
                    } catch (err) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = '提交';
                        alert('创建失败: ' + err.message);
                    }
                });
            },
        });
    }

    function th(text) { return h('th', { style: thStyle }, text); }
    function td(child) { return h('td', { style: tdStyle }, child); }
    function statusBadge(status) {
        const color = status === 'online' ? '#2ecc71'
            : status === 'offline' ? '#95a5a6'
                : '#e74c3c';
        return h('span', { style: { color, fontWeight: 'bold' } }, status || '-');
    }
}

const thStyle = 'padding:0.6rem 0.5rem;text-align:left;border-bottom:2px solid #bdc3c7;background:#ecf0f1;';
const tdStyle = 'padding:0.6rem 0.5rem;border-bottom:1px solid #ecf0f1;';
const tableStyle = 'width:100%;border-collapse:collapse;background:white;';
