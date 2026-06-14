// scripts/components/modal.js — I6 引入
//
// 通用 Modal 组件。用法：
//   const m = openModal({ title: '...', content: (body, close) => { body.appendChild(...); } });
//   m.close();
//
// content 可以是 Node 节点或函数。函数形式接收 body 容器 + close 函数。
// 点击遮罩、ESC、按关闭按钮都会关掉。

import { h } from '../utils.js';

let activeModal = null;   // 同时只允许一个 modal

export function openModal({ title = '', content = null, onClose = null, width = '500px' } = {}) {
    // 关掉前一个（如果有）
    if (activeModal) activeModal.close();

    const overlay = h('div', {
        class: 'modal-overlay',
        style: {
            position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: '9999',
        },
    });

    const modal = h('div', {
        class: 'modal',
        style: {
            background: 'white', borderRadius: '8px',
            minWidth: '320px', maxWidth: '90vw', width,
            maxHeight: '90vh', overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        },
    }, [
        h('div', {
            style: {
                padding: '1rem 1.5rem', borderBottom: '1px solid #ecf0f1',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            },
        }, [
            h('h3', { style: { margin: '0', fontSize: '1.1rem' } }, title),
            h('button', {
                class: 'modal-close',
                style: { background: 'transparent', color: '#7f8c8d', fontSize: '1.5rem', padding: '0 0.5rem' },
                onclick: () => close(),
            }, '×'),
        ]),
        h('div', { class: 'modal-body', style: { padding: '1.5rem' } }),
    ]);

    const body = modal.querySelector('.modal-body');

    let userContentCleanup = null;
    if (typeof content === 'function') {
        const result = content(body, close);
        if (typeof result === 'function') userContentCleanup = result;
    } else if (content instanceof Node) {
        body.appendChild(content);
    }

    function close() {
        if (typeof userContentCleanup === 'function') {
            try { userContentCleanup(); } catch (e) { console.warn('[modal] content cleanup error', e); }
        }
        overlay.remove();
        if (activeModal === api) activeModal = null;
        document.removeEventListener('keydown', onKeyDown);
        if (onClose) onClose();
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') close();
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();   // 点击遮罩关闭,点击 modal 内部不关
    });
    document.addEventListener('keydown', onKeyDown);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const api = { close };
    activeModal = api;
    return api;
}
