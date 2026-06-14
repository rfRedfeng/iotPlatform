// scripts/pages/devices.js -- 设备列表页
//
// I10 改动：
//   - 加载区域列表（state.areas）
//   - 表格列 "区域ID" 改为显示区域名（从 state.areas 查找）
//   - 创建设备 modal 的 "区域ID 输入框" 改为区域下拉
//   - 增加 "编辑" 按钮:可改 name / areaId / deviceType

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

    // WS 监听 task_result:用 msg.taskType 区分
    // I-10: 200ms 去抖,避免批量操作时每个 task_result 都触发一次完整列表刷新
    let reloadTimer = null;
    const offWs = onWs('task_result', (msg) => {
        if (msg.status === 'success' && msg.taskType && msg.taskType.startsWith('device.')) {
            console.log('[devices] task_result received:', msg.taskType, '- scheduling reload');
            if (reloadTimer) clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
                reloadTimer = null;
                loadDevices();
            }, 200);
        }
    });

    let lastTenantId = getState().selectedTenantId;
    const unsubscribe = subscribe((state) => {
        repaintTable();
        if (state.selectedTenantId !== lastTenantId) {
            lastTenantId = state.selectedTenantId;
            loadDevices();
            loadAreas();
        }
    });

    // 加载设备 + 区域（并行）
    loadDevices();
    loadAreas();

    return () => {
        unsubscribe();
        offWs();
        header.cleanup();
    };

    // ════════════════════════════════════════════════════════
    // 内部函数
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

    async function loadAreas() {
        try {
            const data = await api.listAreas(false);  // 平铺
            const list = Array.isArray(data) ? data : [];
            setState({ areas: list });
        } catch (e) {
            console.warn('[devices] load areas failed (may be empty)', e);
        }
    }

    /** 根据 areaId 找区域名 */
    function areaName(areaId) {
        if (areaId == null) return '-';
        const area = (getState().areas || []).find(a => a.id === areaId);
        return area ? `${area.name} [${area.code}]` : `#${areaId}`;
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
                th('ID'), th('名称'), th('状态'), th('区域'),
                th('协议'), th('Device Key'), th('Device Secret'), th('最后活跃'), th('操作'),
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
            td(areaName(d.areaId)),
            td(d.protocol ?? '-'),
            td(h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.25rem' } }, [
                h('code', { style: codeStyle, title: '点击 📋 复制' }, d.deviceKey || '-'),
                h('button', {
                    style: { padding: '0.15rem 0.35rem', fontSize: '0.75rem' },
                    title: '复制 deviceKey',
                    onclick: (e) => { e.stopPropagation(); copyText(d.deviceKey, 'deviceKey'); },
                }, '📋'),
            ])),
            td(h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.25rem' } }, [
                h('code', { style: codeStyle, title: '点击 📋 复制' }, d.deviceSecret || '-'),
                h('button', {
                    style: { padding: '0.15rem 0.35rem', fontSize: '0.75rem' },
                    title: '复制 deviceSecret',
                    onclick: (e) => { e.stopPropagation(); copyText(d.deviceSecret, 'deviceSecret'); },
                }, '📋'),
                h('button', {
                    style: { padding: '0.15rem 0.35rem', fontSize: '0.75rem', background: '#f39c12' },
                    title: '重新生成 deviceSecret',
                    onclick: async (e) => {
                        e.stopPropagation();
                        if (!confirm(`确定要重新生成设备 "${d.name}" 的 deviceSecret 吗？旧的 secret 将立即失效。`)) return;
                        try {
                            await api.regenerateDeviceSecret(d.id);
                            console.log('[devices] regenerate-secret enqueued');
                        } catch (err) {
                            alert('刷新失败: ' + err.message);
                        }
                    },
                }, '🔄'),
            ])),
            td(d.lastSeen ? formatDate(d.lastSeen) : '-'),
            td(h('div', { style: { display: 'flex', gap: '0.25rem' } }, [
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem' },
                    onclick: () => openEditModal(d),
                }, '编辑'),
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
        openModal({
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

    /** 构造区域下拉的 options（基于当前 state.areas 平铺） */
    function buildAreaOptions(selectedId) {
        const areas = getState().areas || [];
        const opts = [
            h('option', { value: '' }, '— 不绑定 —'),
        ];
        for (const a of areas) {
            opts.push(h('option', {
                value: String(a.id),
                selected: a.id === selectedId,
            }, `${a.name} [${a.code}]`));
        }
        return opts;
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
                        '区域 ',
                        h('select', { name: 'areaId', style: { width: '100%', padding: '0.5rem' } }, buildAreaOptions(null)),
                    ]),
                    h('label', {}, [
                        '设备类型（可选） ',
                        h('input', { name: 'deviceType', style: { width: '100%', padding: '0.5rem' } }),
                    ]),
                    h('p', { style: { color: '#7f8c8d', fontSize: '0.8rem', margin: '0' } },
                        'ℹ️ deviceKey 和 deviceSecret 由后端自动生成,无需手动填写。'),
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

    function openEditModal(d) {
        openModal({
            title: '编辑设备: ' + d.name,
            content: (body, close) => {
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('label', {}, [
                        '设备名称 ',
                        h('input', { name: 'name', required: true, value: d.name, style: { width: '100%', padding: '0.5rem' } }),
                    ]),
                    h('label', {}, [
                        '区域 ',
                        h('select', { name: 'areaId', style: { width: '100%', padding: '0.5rem' } }, buildAreaOptions(d.areaId)),
                    ]),
                    h('label', {}, [
                        '设备类型 ',
                        h('input', { name: 'deviceType', value: d.deviceType || '', style: { width: '100%', padding: '0.5rem' } }),
                    ]),
                    h('p', { style: { color: '#7f8c8d', fontSize: '0.8rem' } },
                        '提示: 协议和密钥由后端生成,不可修改。'),
                    h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' } }, [
                        h('button', { type: 'button', style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                        h('button', { type: 'submit', style: { background: '#2ecc71' } }, '保存'),
                    ]),
                ]);
                body.appendChild(form);

                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fd = new FormData(form);
                    const payload = {
                        name: String(fd.get('name') || '').trim(),
                    };
                    const areaId = fd.get('areaId');
                    if (areaId) payload.areaId = Number(areaId);
                    const deviceType = fd.get('deviceType');
                    if (deviceType) payload.deviceType = String(deviceType);

                    try {
                        await api.updateDevice(d.id, payload);
                        close();
                        console.log('[devices] update enqueued');
                    } catch (err) {
                        alert('保存失败: ' + err.message);
                    }
                });
            },
        });
    }

    function copyText(text, label) {
        if (!text) { alert('无可复制内容'); return; }
        navigator.clipboard.writeText(text).then(
            () => showToast(`已复制 ${label}`),
            () => alert('复制失败,请手动选择复制'),
        );
    }
    function showToast(msg) {
        const toast = h('div', {
            style: {
                position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
                background: '#2c3e50', color: 'white', padding: '0.6rem 1.2rem',
                borderRadius: '6px', fontSize: '0.9rem', zIndex: '99999',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', opacity: '0', transition: 'opacity 0.2s',
            },
        }, msg);
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; });
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 200);
        }, 1500);
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
const codeStyle = 'font-family:monospace;font-size:0.75rem;background:#ecf0f1;padding:0.15rem 0.3rem;border-radius:3px;';