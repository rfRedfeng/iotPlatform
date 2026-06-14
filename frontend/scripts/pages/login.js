// scripts/pages/login.js — 登录页
//
// 流程：
//   1. 用户填表单 → submit
//   2. api.login(username, password) → 后端
//   3. 成功 → setState({user, accessToken, refreshToken}) + 写 localStorage → go('/')
//   4. 失败 → 显示错误文案（不清空输入框，方便重试）

import { api } from '../api.js';
import { setState } from '../state.js';
import { h, storage } from '../utils.js';
import { go } from '../router.js';
import { connect as connectWs } from '../ws.js';

export function render(root) {
    let error = '';
    let loading = false;

    function repaint() {
        root.replaceChildren(
            h('header', { class: 'header' }, [
                h('h1', {}, 'IoT Cloud Platform'),
                h('p', { style: { margin: '0', opacity: '0.7', fontSize: '0.9rem' } }, '登录'),
            ]),
            h('main', { class: 'main' }, [
                h('div', { id: 'page-content', style: { maxWidth: '400px', margin: '2rem auto' } }, [
                    h('h2', {}, '用户登录'),
                    h('form', {
                        id: 'login-form',
                        style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
                    }, [
                        h('label', {}, [
                            '用户名 ',
                            h('input', {
                                name: 'username',
                                required: true,
                                autocomplete: 'username',
                                style: { width: '100%', padding: '0.5rem', marginTop: '0.25rem' },
                            }),
                        ]),
                        h('label', {}, [
                            '密码 ',
                            h('input', {
                                name: 'password',
                                type: 'password',
                                required: true,
                                autocomplete: 'current-password',
                                style: { width: '100%', padding: '0.5rem', marginTop: '0.25rem' },
                            }),
                        ]),
                        h('button', {
                            type: 'submit',
                            disabled: loading,
                            style: { padding: '0.5rem', cursor: loading ? 'wait' : 'pointer' },
                        }, loading ? '登录中...' : '登录'),
                    ]),
                    error ? h('p', { style: { color: '#e74c3c', marginTop: '1rem' } }, error) : null,
                    h('p', { style: { marginTop: '1.5rem', color: '#7f8c8d', fontSize: '0.9rem', lineHeight: '1.5' } }, [
                        '提示：使用后端 users 表里的测试账号登录。',
                        h('br'),
                        'I3 验收：成功后 localStorage 会有 accessToken，刷新页面仍保持登录。',
                    ]),
                ]),
            ]),
        );

        const form = document.getElementById('login-form');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loading) return;
            loading = true;
            error = '';
            repaint();

            const fd = new FormData(form);
            const username = String(fd.get('username') || '').trim();
            const password = String(fd.get('password') || '');

            try {
                const data = await api.login(username, password);
                // 后端响应: { success: true, data: { accessToken, refreshToken, user } }
                const user = data?.user;
                const accessToken = data?.accessToken;
                const refreshToken = data?.refreshToken;
                if (!accessToken) {
                    throw new Error('后端响应缺少 accessToken 字段（请检查 api.js 与后端约定）');
                }

                setState({ user, accessToken, refreshToken });
                storage.set('accessToken', accessToken);
                if (refreshToken) storage.set('refreshToken', refreshToken);

                connectWs();   // 登录成功后连接 WebSocket

                console.log('[login] success, user:', user);
                go('/');
            } catch (e) {
                loading = false;
                error = e.message || '登录失败';
                repaint();
            }
        });
    }

    repaint();
    return null;
}