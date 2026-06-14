// scripts/pages/areas.js — 区域管理
//
// 功能：
//   - 树形结构显示区域（楼栋 → 楼层 → 房间）
//   - 创建/编辑/删除区域
//   - 监听 WS task_result 自动刷新
//
// 设计：所有 repaint/load 函数作为 render 内部闭包（与 users.js 一致）

import { h, formatDate } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { on as onWs } from '../ws.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';
import { openModal } from '../components/modal.js';

export function render(root) {
    const header = mountHeader();
    const nav = navigation();

    // 局部 DOM 引用
    const treeContainer = h('div', { id: 'areas-tree' });
    const toolbar = h('div', { style: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' } }, [
        h('button', { id: 'create-root-btn', style: { padding: '0.4rem 0.8rem' } }, '＋ 新建根区域'),
        h('button', { id: 'refresh-btn', style: { padding: '0.4rem 0.8rem' } }, '🔄 刷新'),
    ]);

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('h2', {}, '区域管理'),
            h('p', { style: { color: '#7f8c8d', fontSize: '0.85rem', marginBottom: '1rem' } },
                '树形结构管理区域:楼栋 → 楼层 → 房间。区域可嵌套。'),
            toolbar,
            treeContainer,
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    // 当前选中的父区域(用于"新建子区域"时预填 parentId)
    let selectedParentId = null;
    let selectedParentName = null;

    // ════════════════════════════════════════════════════════
    // 内部函数
    // ════════════════════════════════════════════════════════

    async function loadAreas() {
        setState({ areasLoading: true });
        try {
            // 同时拉平铺和树形
            const [tree, flat] = await Promise.all([
                api.listAreas(true),
                api.listAreas(false),
            ]);
            const treeData = Array.isArray(tree) ? tree : [];
            const flatData = Array.isArray(flat) ? flat : [];
            setState({ areas: flatData, areasTree: treeData, areasLoading: false });
        } catch (e) {
            console.error('[areas] load failed', e);
            setState({ areasLoading: false, areasError: e.message });
        }
    }

    function repaintTree() {
        if (getState().areasLoading) {
            treeContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '加载中...')
            );
            return;
        }
        const err = getState().areasError;
        if (err) {
            treeContainer.replaceChildren(
                h('p', { style: { color: '#e74c3c' } }, '错误: ' + err)
            );
            return;
        }
        const tree = getState().areasTree || [];
        if (tree.length === 0) {
            treeContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '暂无区域,点上方"新建根区域"开始')
            );
            return;
        }
        treeContainer.replaceChildren(
            h('div', { class: 'area-tree' }, tree.map((node) => treeNode(node, 0)))
        );
    }

    function treeNode(node, depth) {
        const hasChildren = node.children && node.children.length > 0;
        return h('div', {
            'data-area-id': String(node.id),
            style: {
                marginLeft: (depth * 24) + 'px',
                padding: '0.5rem 0rem',
                borderLeft: depth > 0 ? '2px solid #3498db' : 'none',
                marginBottom: '0.25rem',
            },
        }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' } }, [
                h('span', { style: { color: '#3498db', fontWeight: 'bold' } }, depth === 0 ? '🏢' : '📍'),
                h('strong', {}, node.name),
                h('span', { style: { color: '#7f8c8d', fontSize: '0.85rem' } }, `[${node.code}]`),
                node.description ? h('span', { style: { color: '#95a5a6', fontSize: '0.8rem', fontStyle: 'italic' } }, node.description) : null,
                h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '0.25rem' } }, [
                    h('button', {
                        style: { padding: '0.2rem 0.5rem', fontSize: '0.8rem' },
                        onclick: () => onAddChild(node),
                    }, '＋ 子区域'),
                    h('button', {
                        style: { padding: '0.2rem 0.5rem', fontSize: '0.8rem' },
                        onclick: () => onEdit(node),
                    }, '编辑'),
                    h('button', {
                        style: { padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: '#e74c3c' },
                        onclick: () => onDelete(node),
                    }, '删除'),
                ]),
            ]),
            hasChildren
                ? h('div', null, node.children.map((child) => treeNode(child, depth + 1)))
                : null,
        ]);
    }

    // ═══════════ CRUD 操作 ═══════════

    function onAddRoot() {
        openCreateModal({ parentId: null, parentName: '（根）' });
    }

    function onAddChild(parent) {
        openCreateModal({ parentId: parent.id, parentName: parent.name });
    }

    function onEdit(area) {
        openEditModal(area);
    }

    function onDelete(area) {
        // 检查是否有子区域
        if (area.children && area.children.length > 0) {
            alert(`"${area.name}" 下还有 ${area.children.length} 个子区域,无法删除。请先删除子区域。`);
            return;
        }
        openModal({
            title: '删除区域',
            content: (body, close) => {
                body.appendChild(h('p', {}, `确定要删除区域 "${area.name}" 吗？此操作不可撤销。`));
                body.appendChild(h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' } }, [
                    h('button', { style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                    h('button', {
                        style: { background: '#e74c3c' }, onclick: async () => {
                            try {
                                await api.deleteArea(area.id);
                                close();
                                console.log('[areas] delete enqueued');
                            } catch (e) { alert('删除失败: ' + e.message); }
                        }
                    }, '确认删除'),
                ]));
            },
        });
    }

    function openCreateModal({ parentId, parentName }) {
        openModal({
            title: parentId ? `新建子区域 (父: ${parentName})` : '新建根区域',
            content: (body, close) => {
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('label', {}, [
                        '区域名称 ',
                        h('input', { name: 'name', required: true, placeholder: '如:1号楼', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    h('label', {}, [
                        '区域编码 (唯一) ',
                        h('input', { name: 'code', required: true, placeholder: '如:BLDG-1', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    h('label', {}, [
                        '描述 (可选) ',
                        h('input', { name: 'description', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' } }, [
                        h('button', { type: 'button', style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                        h('button', { type: 'submit', style: { background: '#2ecc71' } }, '创建'),
                    ]),
                ]);
                body.appendChild(form);

                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fd = new FormData(form);
                    const payload = {
                        name: String(fd.get('name') || '').trim(),
                        code: String(fd.get('code') || '').trim(),
                        description: String(fd.get('description') || '').trim() || null,
                    };
                    if (parentId) payload.parentId = parentId;
                    if (!payload.name || !payload.code) {
                        alert('名称和编码必填');
                        return;
                    }
                    try {
                        await api.createArea(payload);
                        close();
                        console.log('[areas] create enqueued');
                    } catch (err) {
                        alert('创建失败: ' + err.message);
                    }
                });
            },
        });
    }

    function openEditModal(area) {
        openModal({
            title: '编辑区域: ' + area.name,
            content: (body, close) => {
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('label', {}, [
                        '区域名称 ',
                        h('input', { name: 'name', required: true, value: area.name, style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    h('label', {}, [
                        '区域编码 (唯一) ',
                        h('input', { name: 'code', required: true, value: area.code, style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    h('label', {}, [
                        '描述 (可选) ',
                        h('input', { name: 'description', value: area.description || '', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
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
                        code: String(fd.get('code') || '').trim(),
                        description: String(fd.get('description') || '').trim() || null,
                    };
                    try {
                        await api.updateArea(area.id, payload);
                        close();
                        console.log('[areas] update enqueued');
                    } catch (err) {
                        alert('保存失败: ' + err.message);
                    }
                });
            },
        });
    }

    // ════════════════════════════════════════════════════════
    // 启动
    // ════════════════════════════════════════════════════════

    // 事件
    main.querySelector('#create-root-btn').addEventListener('click', onAddRoot);
    main.querySelector('#refresh-btn').addEventListener('click', loadAreas);

    // 首次加载
    repaintTree();
    loadAreas();

    // WS 监听 task_result:area 变化后重拉(用 msg.taskType 区分)
    const offWs = onWs('task_result', (msg) => {
        if (msg.status === 'success' && msg.taskType && msg.taskType.startsWith('area.')) {
            console.log('[areas] task_result received:', msg.taskType, '- reloading');
            loadAreas();
        }
    });

    let lastTenantId = getState().selectedTenantId;
    const unsubscribe = subscribe((state) => {
        repaintTree();
        if (state.selectedTenantId !== lastTenantId) {
            lastTenantId = state.selectedTenantId;
            loadAreas();
        }
    });

    return () => {
        unsubscribe();
        offWs();
        header.cleanup();
    };
}