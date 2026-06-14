// scripts/pages/users.js — 用户管理
//
// 权限分层（前后端同步）：
//   - admin:   看全平台用户列表 + 编辑任何用户（含切换租户/角色）
//   - manager: 本租户 + 只能编辑 role='user' 的目标
//   - user:    只能改自己资料
//
// 设计要点（修 bug 关键）：
//   - 所有 repaint/load 函数都是 render 内部的闭包,
//     能直接访问 profileContainer / main / listSection / userListContainer
//   - 之前放在模块顶层时,会找不到这些变量 (ReferenceError)
//   - 每次进页都 loadProfile() (强制拉 /auth/userinfo,保证 role 是最新)
//   - subscribe 回调里重新从 state 读 role,不用 render 时的闭包变量

import { h, formatDate, storage } from '../utils.js';
import { getState, setState, subscribe } from '../state.js';
import { api } from '../api.js';
import { disconnect as disconnectWs, on as onWs } from '../ws.js';
import { go } from '../router.js';
import { mountHeader } from '../components/header.js';
import { navigation } from '../components/navigation.js';
import { openModal } from '../components/modal.js';

export function render(root) {
    const header = mountHeader();
    const nav = navigation();

    // ═══════════ 局部 DOM 引用（repaint 函数要闭包访问）═══════════
    const profileContainer = h('div', { id: 'profile-form' });
    const listHint = h('p', { id: 'list-hint', style: { color: '#7f8c8d', fontSize: '0.85rem' } }, '');
    const userListContainer = h('div', { id: 'user-list' });
    const userSearchInput = h('input', {
        id: 'user-search',
        type: 'text',
        placeholder: '按用户名或邮箱搜索',
        style: { flex: '1', minWidth: '180px', padding: '0.4rem 0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px' },
    });
    const roleFilter = h('select', { id: 'role-filter', style: { padding: '0.4rem 0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px' } }, [
        h('option', { value: '' }, '全部角色'),
        h('option', { value: 'admin' }, '管理员'),
        h('option', { value: 'manager' }, '租户管理员'),
        h('option', { value: 'user' }, '普通用户'),
    ]);
    const tenantFilter = h('select', { id: 'tenant-filter', style: { padding: '0.4rem 0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px' } }, [
        h('option', { value: '' }, '全部租户'),
    ]);
    const listSection = h('div', { id: 'user-list-section' }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', marginBottom: '0.5rem', gap: '0.5rem' } }, [
            h('h3', { style: { margin: '0' } }, '用户列表'),
            h('button', {
                id: 'create-user-btn',
                style: { padding: '0.4rem 0.8rem', background: '#2ecc71', fontSize: '0.9rem' },
                onclick: openCreateUserModal,
            }, '＋ 新建用户'),
        ]),
        h('div', { style: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' } }, [
            userSearchInput, roleFilter, tenantFilter,
        ]),
        listHint,
        userListContainer,
    ]);

    const main = h('main', { class: 'main' }, [
        h('div', { id: 'page-content' }, [
            h('h2', {}, '用户管理'),
            h('h3', { style: { marginTop: '1rem' } }, '我的资料'),
            h('p', { style: { color: '#7f8c8d', fontSize: '0.85rem' } }, '所有用户都能修改自己的用户名、邮箱、密码'),
            profileContainer,
            listSection,
        ]),
    ]);

    root.appendChild(header.element);
    const layout = h('div', { class: 'home-text' });
    root.appendChild(layout);
    layout.appendChild(nav);
    layout.appendChild(main);

    // ════════════════════════════════════════════════════════
    // 全部作为 render 内部函数（能访问闭包的局部变量）
    // ════════════════════════════════════════════════════════

    async function loadProfile() {
        setState({ userLoading: true, userError: null });
        try {
            const data = await api.userInfo();
            setState({ user: data.user, tenant: data.tenant, userLoading: false });
        } catch (e) {
            console.error('[users] load profile failed', e);
            setState({ userLoading: false, userError: e.message || '加载失败' });
        }
    }

    // 控制编辑表单显隐
    let showEditForm = false;

    function repaintProfile() {
        const u = getState().user;
        if (!u) {
            profileContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '加载中...')
            );
            return;
        }
        const children = [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' } }, [
                h('h4', { style: { margin: '0' } }, '账号信息'),
                h('button', {
                    id: 'toggle-edit-btn',
                    style: { padding: '0.3rem 0.8rem', fontSize: '0.85rem', background: showEditForm ? '#7f8c8d' : '#3498db' },
                    onclick: () => { showEditForm = !showEditForm; repaintProfile(); },
                }, showEditForm ? '取消编辑' : '✎ 修改'),
            ]),
            row('用户名', u.username || '-'),
            row('邮箱', u.email || '（未设置）'),
            row('用户 ID', String(u.id)),
            row('角色', roleBadge(u.role)),
            row('租户', u.tenantId ? `ID ${u.tenantId}` : '（未设置）'),
        ];

        if (showEditForm) {
            children.push(
                h('hr', { style: { margin: '1rem 0', border: 'none', borderTop: '1px solid #ecf0f1' } }),
                h('form', { id: 'profile-form-el', style: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '400px' } }, [
                    h('input', { type: 'hidden', id: 'pf-username', value: u.username || '' }),
                    h('label', {}, [
                        '邮箱 ',
                        h('input', {
                            id: 'pf-email', type: 'email', value: u.email || '', placeholder: '可选',
                            style: { width: '100%', padding: '0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px', marginTop: '0.25rem' },
                        }),
                    ]),
                    h('label', {}, [
                        '新密码（留空则不改）',
                        h('input', {
                            id: 'pf-password', type: 'password', minlength: 6, placeholder: '至少 6 位',
                            style: { width: '100%', padding: '0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px', marginTop: '0.25rem' },
                        }),
                    ]),
                    h('button', {
                        type: 'submit',
                        style: { padding: '0.5rem 1rem', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '0.5rem' },
                    }, '保存'),
                ]),
            );
        }

        profileContainer.replaceChildren(
            h('div', {
                style: {
                    background: 'white', padding: '1.5rem', borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    borderLeft: '4px solid #3498db',
                },
            }, children),
        );

        // 绑定提交事件
        const form = main.querySelector('#profile-form-el');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = main.querySelector('#pf-username')?.value?.trim() || '';
                const email = main.querySelector('#pf-email')?.value?.trim() || '';
                const newPwd = main.querySelector('#pf-password')?.value || '';
                if (newPwd && newPwd.length < 6) { alert('密码至少 6 位'); return; }

                const payload = { username, email: email || null };
                if (newPwd) payload.password = newPwd;

                try {
                    await api.updateUser(u.id, payload);
                    if (newPwd) {
                        setState({ user: null, accessToken: null, refreshToken: null });
                        storage.remove('accessToken');
                        storage.remove('refreshToken');
                        try { disconnectWs(); } catch (_) { }
                        alert('密码修改成功,请重新登录');
                        go('/login');
                    } else {
                        showEditForm = false;
                        setState({ user: { ...u, username, email: email || null } });
                        alert('账号信息已更新');
                    }
                } catch (err) {
                    alert('修改失败: ' + err.message);
                }
            });
        }
    }

    // ════════════════════════════════════════════════════════
    // 用户列表 (admin / manager)
    // ════════════════════════════════════════════════════════

    async function loadTenants() {
        try {
            const data = await api.listTenants();
            const list = Array.isArray(data) ? data : [];
            setState({ tenants: list });  // 存 state,写完触发 subscribe → repaint
            const sel = main.querySelector('#tenant-filter');
            if (sel) {
                while (sel.options.length > 1) sel.remove(1);
                list.forEach(t => {
                    sel.appendChild(h('option', { value: String(t.id) }, t.name));
                });
            }
        } catch (e) {
            console.warn('[users] load tenants failed', e);
        }
    }

    /** 根据 tenantId 找租户名 */
    function tenantName(tid) {
        if (tid == null) return '-';
        if (tid === 0) return '系统管理';
        const list = getState().tenants || [];
        const t = list.find(t => t.id === tid);
        return t ? t.name : `租户 #${tid}`;
    }

    async function loadUsers() {
        setState({ usersLoading: true, usersError: null });
        try {
            const data = await api.listUsers();
            const list = Array.isArray(data) ? data : (data?.list || []);
            setState({ users: list, usersLoading: false });
        } catch (e) {
            console.error('[users] load list failed', e);
            setState({ usersLoading: false, usersError: e.message || '加载失败' });
        }
    }

    function repaintUserList() {
        // 重新从 state 读 role（render 时 user 还是 null,闭包变量不可用）
        const me = getState().user;
        if (!me) {
            listSection.style.display = 'none';
            return;
        }
        const isAdmin = me.role === 'admin';
        const isManager = me.role === 'manager';
        const canViewList = isAdmin || isManager;

        if (!canViewList) {
            listSection.style.display = 'none';
            return;
        }
        listSection.style.display = '';

        listHint.textContent = isAdmin
            ? '可编辑/删除任意用户、切换其租户'
            : '可编辑本租户其他 role=user 的账号信息';

        if (getState().usersLoading) {
            userListContainer.replaceChildren(h('p', { style: { color: '#7f8c8d' } }, '加载中...'));
            return;
        }
        if (getState().usersError) {
            userListContainer.replaceChildren(h('p', { style: { color: '#e74c3c' } }, '错误: ' + getState().usersError));
            return;
        }
        let users = getState().users || [];
        // 搜索过滤
        const searchTerm = (main.querySelector('#user-search')?.value || '').toLowerCase().trim();
        const roleFilterVal = main.querySelector('#role-filter')?.value || '';
        const tenantFilterVal = main.querySelector('#tenant-filter')?.value || '';

        if (searchTerm) {
            users = users.filter(u =>
                (u.username || '').toLowerCase().includes(searchTerm) ||
                (u.email || '').toLowerCase().includes(searchTerm)
            );
        }
        if (roleFilterVal) {
            users = users.filter(u => u.role === roleFilterVal);
        }
        if (tenantFilterVal) {
            users = users.filter(u => String(u.tenantId) === tenantFilterVal);
        }
        if (users.length === 0) {
            userListContainer.replaceChildren(h('p', { style: { color: '#7f8c8d' } },
                searchTerm ? `没有匹配 "${searchTerm}" 的用户` : '暂无用户'));
            return;
        }
        userListContainer.replaceChildren(
            h('table', { style: tableStyle }, [
                h('thead', {}, h('tr', {}, [
                    th('ID'), th('用户名'), th('角色'), th('邮箱'),
                    th('租户名称'), th('创建时间'), th('操作'),
                ])),
                h('tbody', {}, users.map((u) => userRow(u, isAdmin, isManager))),
            ]),
        );
    }

    function userRow(u, isAdmin, isManager) {
        const me = getState().user;
        const isMe = u.id === me?.id;
        let actionCell;
        if (isAdmin) {
            actionCell = h('div', { style: { display: 'flex', gap: '0.25rem' } }, [
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem' },
                    onclick: () => openEditModal(u, isAdmin),
                }, '编辑'),
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem', background: '#e74c3c' },
                    onclick: () => confirmDelete(u),
                    disabled: isMe,
                }, '删除'),
            ]);
        } else if (isManager && !isMe) {
            actionCell = h('div', { style: { display: 'flex', gap: '0.25rem' } }, [
                h('button', {
                    style: { padding: '0.25rem 0.5rem', fontSize: '0.85rem' },
                    onclick: () => openEditModal(u, isAdmin),
                }, '编辑'),
            ]);
        } else {
            actionCell = h('span', { style: { color: '#95a5a6', fontSize: '0.85rem' } }, '（只读）');
        }

        return h('tr', {}, [
            td(String(u.id)),
            td(u.username + (isMe ? ' (我)' : '')),
            td(roleBadge(u.role)),
            td(h('span', {
                title: u.email || '',
                style: { display: 'inline-block', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }, u.email || '-')),
            td(tenantName(u.tenantId)),
            td(u.createdAt ? formatDate(u.createdAt) : '-'),
            td(actionCell),
        ]);
    }

    // 编辑用户（admin 可改任意, manager 只能改本租户 role=user 的用户）
    function openEditModal(u, isAdmin) {
        openModal({
            title: '编辑用户: ' + u.username,
            content: (body, close) => {
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('div', { style: { padding: '0.4rem 0' } }, [
                        h('span', { style: { color: '#7f8c8d' } }, '用户名: '),
                        h('strong', {}, u.username),
                    ]),
                    h('input', { type: 'hidden', name: 'username', value: u.username }),
                    isAdmin
                        ? h('label', {}, [
                            '角色 ',
                            h('select', { name: 'role', style: { width: '100%', padding: '0.4rem' } }, [
                                h('option', { value: 'user', selected: u.role === 'user' }, 'user'),
                                h('option', { value: 'manager', selected: u.role === 'manager' }, 'manager'),
                                h('option', { value: 'admin', selected: u.role === 'admin' }, 'admin'),
                            ]),
                        ])
                        : h('div', { style: { padding: '0.4rem 0' } }, [
                            h('span', { style: { color: '#7f8c8d' } }, '角色: '),
                            h('strong', {}, u.role),
                            h('input', { type: 'hidden', name: 'role', value: u.role }),
                        ]),
                    isAdmin
                        ? h('label', {}, [
                            '所属租户 ',
                            h('select', { name: 'tenantId', style: { width: '100%', padding: '0.4rem' } },
                                (getState().tenants || []).length
                                    ? (getState().tenants || []).map(t => h('option', { value: String(t.id), selected: t.id === u.tenantId }, t.name))
                                    : [h('option', { value: String(u.tenantId ?? 0), selected: true }, `租户 #${u.tenantId}`)]
                            ),
                        ])
                        : h('input', { type: 'hidden', name: 'tenantId', value: String(u.tenantId ?? 1) }),
                    h('label', {}, [
                        '邮箱 ',
                        h('input', { name: 'email', type: 'email', value: u.email || '', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    h('label', {}, [
                        '新密码（留空则不修改）',
                        h('input', { name: 'password', type: 'password', minlength: 6, placeholder: '至少 6 位', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    !isAdmin ? h('p', { style: { color: '#7f8c8d', fontSize: '0.8rem' } },
                        '注: 角色和租户 ID 由系统管理员设置,不可修改') : null,
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
                        username: String(fd.get('username') || '').trim(),
                        email: String(fd.get('email') || '').trim() || null,
                    };
                    if (isAdmin) {
                        payload.role = String(fd.get('role') || 'user');
                        payload.tenantId = Number(fd.get('tenantId') || 1);
                    }
                    const newPwd = String(fd.get('password') || '');
                    if (newPwd) payload.password = newPwd;

                    try {
                        await api.updateUser(u.id, payload);
                        close();
                        alert('修改已提交,等待刷新');
                        if (isAdmin) loadUsers();
                    } catch (err) {
                        alert('修改失败: ' + err.message);
                    }
                });
            },
        });
    }

    // 创建新用户（admin + manager）
    function openCreateUserModal() {
        const me = getState().user || {};
        const isAdmin = me.role === 'admin';
        openModal({
            title: '新建用户',
            content: (body, close) => {
                const tenantOpts = isAdmin
                    ? tenants.map(t => h('option', { value: String(t.id) }, t.name))
                    : [];
                const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } }, [
                    h('label', {}, [
                        '用户名 ',
                        h('input', { name: 'username', required: true, style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    h('label', {}, [
                        '密码 ',
                        h('input', { name: 'password', type: 'password', required: true, minlength: 6, placeholder: '至少 6 位', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    isAdmin ? h('label', {}, [
                        '角色 ',
                        h('select', { name: 'role', style: { width: '100%', padding: '0.4rem' } }, [
                            h('option', { value: 'user' }, 'user'),
                            h('option', { value: 'manager' }, 'manager'),
                        ]),
                    ]) : h('input', { type: 'hidden', name: 'role', value: 'user' }),
                    isAdmin ? h('label', {}, [
                        '所属租户 ',
                        h('select', { name: 'tenantId', style: { width: '100%', padding: '0.4rem' } },
                            (getState().tenants || []).length
                                ? (getState().tenants || []).map(t => h('option', { value: String(t.id) }, t.name))
                                : [h('option', { value: '1' }, '默认租户')]),
                    ]) : h('input', { type: 'hidden', name: 'tenantId', value: String(me.tenantId || 1) }),
                    h('label', {}, [
                        '邮箱（可选）',
                        h('input', { name: 'email', type: 'email', style: { width: '100%', padding: '0.4rem' } }),
                    ]),
                    !isAdmin ? h('p', { style: { color: '#7f8c8d', fontSize: '0.8rem' } },
                        '注: 租户管理员只能创建 role=user 的用户,自动归属本租户') : null,
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
                        username: String(fd.get('username') || '').trim(),
                        password: String(fd.get('password') || ''),
                    };
                    if (isAdmin) {
                        payload.role = String(fd.get('role') || 'user');
                        payload.tenantId = Number(fd.get('tenantId') || 1);
                    }
                    const email = String(fd.get('email') || '').trim();
                    if (email) payload.email = email;

                    if (!payload.username || !payload.password) {
                        alert('用户名和密码必填'); return;
                    }
                    if (payload.password.length < 6) {
                        alert('密码至少 6 位'); return;
                    }
                    try {
                        await api.createUser(payload);
                        close();
                        alert('创建已提交,等待 WS task_result 刷新');
                    } catch (err) {
                        alert('创建失败: ' + err.message);
                    }
                });
            },
        });
    }

    function confirmDelete(u) {
        openModal({
            title: '删除用户',
            content: (body, close) => {
                body.appendChild(h('p', {}, `确定要删除用户 "${u.username}" 吗？此操作不可撤销。`));
                body.appendChild(h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' } }, [
                    h('button', { style: { background: '#7f8c8d' }, onclick: close }, '取消'),
                    h('button', {
                        style: { background: '#e74c3c' }, onclick: async () => {
                            try {
                                await api.deleteUser(u.id);
                                close();
                                loadUsers();
                            } catch (e) { alert('删除失败: ' + e.message); }
                        }
                    }, '确认删除'),
                ]));
            },
        });
    }

    // ════════════════════════════════════════════════════════
    // helpers
    // ════════════════════════════════════════════════════════

    function row(label, value) {
        return h('div', {
            style: { display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f5f5f5' },
        }, [
            h('span', { style: { color: '#7f8c8d' } }, label),
            h('span', { style: { fontWeight: '500' } }, value),
        ]);
    }
    function th(text) { return h('th', { style: thStyle }, text); }
    function td(child) { return h('td', { style: tdStyle }, child); }
    function roleBadge(role) {
        const color = role === 'admin' ? '#e74c3c' : role === 'manager' ? '#f39c12' : '#3498db';
        return h('span', { style: { color, fontWeight: 'bold' } }, role || '-');
    }

    // ════════════════════════════════════════════════════════
    // 启动
    // ════════════════════════════════════════════════════════

    // WS 监听 task_result：user 变更后自动刷新列表
    const offWs = onWs('task_result', (msg) => {
        if (msg.status === 'success' && msg.taskType && msg.taskType.startsWith('user.')) {
            console.log('[users] task_result received:', msg.taskType, '- reloading');
            loadUsers();
            // 如果改了自己,重新拉 profile
            const me = getState().user;
            if (me && msg.data && msg.data.id === me.id) {
                loadProfile();
            }
        }
    });

    // 搜索输入触发重绘
    let searchTimer = null;
    userSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => repaintUserList(), 200);
    });

    // 筛选下拉触发重绘
    roleFilter.addEventListener('change', () => repaintUserList());
    tenantFilter.addEventListener('change', () => repaintUserList());

    loadTenants();
    repaintProfile();
    loadProfile();
    loadUsers();

    const unsubscribe = subscribe(() => {
        repaintProfile();
        repaintUserList();
    });

    return () => {
        offWs();
        unsubscribe();
        header.cleanup();
    };
}

const thStyle = 'padding:0.6rem 0.5rem;text-align:left;border-bottom:2px solid #bdc3c7;background:#ecf0f1;';
const tdStyle = 'padding:0.6rem 0.5rem;border-bottom:1px solid #ecf0f1;';
const tableStyle = 'width:100%;border-collapse:collapse;background:white;margin-top:0.5rem;';