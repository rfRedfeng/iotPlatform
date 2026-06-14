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
import { disconnect as disconnectWs } from '../ws.js';
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
    const listSection = h('div', { id: 'user-list-section' }, [
        h('h3', { style: { marginTop: '1.5rem' } }, '用户列表'),
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

    function repaintProfile() {
        const u = getState().user;
        if (!u) {
            profileContainer.replaceChildren(
                h('p', { style: { color: '#7f8c8d' } }, '加载中...')
            );
            return;
        }
        profileContainer.replaceChildren(
            h('div', {
                style: {
                    background: 'white', padding: '1.5rem', borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    borderLeft: '4px solid #3498db',
                },
            }, [
                h('h4', { style: { margin: '0 0 0.5rem' } }, '账号信息'),
                row('用户 ID', String(u.id)),
                row('角色', roleBadge(u.role)),
                row('租户', u.tenantId ? `ID ${u.tenantId}` : '（未设置）'),
                h('hr', { style: { margin: '1rem 0', border: 'none', borderTop: '1px solid #ecf0f1' } }),
                h('h4', { style: { margin: '0 0 0.5rem' } }, '修改账号信息'),
                h('p', { style: { color: '#7f8c8d', fontSize: '0.8rem', margin: '0 0 0.5rem' } },
                    '所有用户都能修改自己的用户名、邮箱、密码。密码留空则不修改。'),
                h('form', { id: 'profile-form-el', style: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '400px' } }, [
                    h('label', {}, [
                        '用户名 ',
                        h('input', {
                            id: 'pf-username',
                            value: u.username || '',
                            required: true,
                            style: { width: '100%', padding: '0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px', marginTop: '0.25rem' },
                        }),
                    ]),
                    h('label', {}, [
                        '邮箱 ',
                        h('input', {
                            id: 'pf-email',
                            type: 'email',
                            value: u.email || '',
                            placeholder: '可选',
                            style: { width: '100%', padding: '0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px', marginTop: '0.25rem' },
                        }),
                    ]),
                    h('label', {}, [
                        '新密码（留空则不改）',
                        h('input', {
                            id: 'pf-password',
                            type: 'password',
                            minlength: 6,
                            placeholder: '至少 6 位',
                            style: { width: '100%', padding: '0.5rem', border: '1px solid #bdc3c7', borderRadius: '4px', marginTop: '0.25rem' },
                        }),
                    ]),
                    h('button', {
                        type: 'submit',
                        style: { padding: '0.5rem 1rem', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '0.5rem' },
                    }, '保存'),
                ]),
            ]),
        );

        // 绑定提交事件（每次 repaint 都重绑，确保最新的 DOM 元素有事件）
        const form = main.querySelector('#profile-form-el');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = main.querySelector('#pf-username')?.value?.trim() || '';
                const email = main.querySelector('#pf-email')?.value?.trim() || '';
                const newPwd = main.querySelector('#pf-password')?.value || '';
                if (!username) { alert('用户名不能为空'); return; }
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
            ? '系统管理员视图:可编辑/删除任意用户、切换其租户'
            : '租户管理员视图:可编辑本租户其他 role=user 的账号信息';

        if (getState().usersLoading) {
            userListContainer.replaceChildren(h('p', { style: { color: '#7f8c8d' } }, '加载中...'));
            return;
        }
        if (getState().usersError) {
            userListContainer.replaceChildren(h('p', { style: { color: '#e74c3c' } }, '错误: ' + getState().usersError));
            return;
        }
        const users = getState().users || [];
        if (users.length === 0) {
            userListContainer.replaceChildren(h('p', { style: { color: '#7f8c8d' } }, '暂无用户'));
            return;
        }
        userListContainer.replaceChildren(
            h('table', { style: tableStyle }, [
                h('thead', {}, h('tr', {}, [
                    th('ID'), th('用户名'), th('角色'), th('邮箱'),
                    th('租户 ID'), th('创建时间'), th('操作'),
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
            td(u.email || '-'),
            td(String(u.tenantId ?? '-')),
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
                    h('label', {}, [
                        '用户名 ',
                        h('input', { name: 'username', value: u.username, style: { width: '100%', padding: '0.4rem' } }),
                    ]),
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
                            '租户 ID（可切换绑定租户）',
                            h('input', { name: 'tenantId', type: 'number', value: String(u.tenantId ?? 1), style: { width: '100%', padding: '0.4rem' } }),
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

    repaintProfile();           // 1. 同步:state.user 是 null,显示"加载中..."
    loadProfile();             // 2. 异步 → setState → subscribe 触发 repaintProfile
    loadUsers();               // 3. 异步

    const unsubscribe = subscribe(() => {
        repaintProfile();
        repaintUserList();
    });

    return () => {
        unsubscribe();
        header.cleanup();
    };
}

const thStyle = 'padding:0.6rem 0.5rem;text-align:left;border-bottom:2px solid #bdc3c7;background:#ecf0f1;';
const tdStyle = 'padding:0.6rem 0.5rem;border-bottom:1px solid #ecf0f1;';
const tableStyle = 'width:100%;border-collapse:collapse;background:white;margin-top:0.5rem;';